// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketMetadata } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

// No disposition path may reach Jira (epic hard constraint).
const jiraSpies = { updateIssue: vi.fn(), addComment: vi.fn(), transitionIssue: vi.fn() };
vi.mock("@/lib/jira-client", () => ({
  jiraClient: jiraSpies,
  JiraApiError: class extends Error {},
  extractSprint: vi.fn(),
}));

import { GET, POST } from "./route";
import { DISMISS_COOLDOWN_DAYS } from "@/lib/cleanup-disposition";

function seed(key: string, opts: { scanScores?: unknown; scanOverall?: number; scanRationale?: string } = {}) {
  testDb.insert(ticket).values({ jiraKey: key, title: `Ticket ${key}`, status: "Backlog", sprintName: "" }).run();
  testDb.insert(ticketMetadata).values({
    jiraKey: key,
    scanScores: opts.scanScores ? JSON.stringify(opts.scanScores) : null,
    scanOverall: opts.scanOverall ?? null,
    scanRationale: opts.scanRationale ?? null,
  }).run();
}

function getReq(key: string) {
  return GET(new Request(`http://localhost:3100/api/cleanup/${key}/disposition`), {
    params: Promise.resolve({ key }),
  });
}
function postReq(key: string, body: unknown) {
  return POST(
    new Request(`http://localhost:3100/api/cleanup/${key}/disposition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ key }) },
  );
}

describe("GET /api/cleanup/[key]/disposition", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("404s an unknown ticket", async () => {
    const res = await getReq("BT-MISSING");
    expect(res.status).toBe(404);
  });

  it("renders every topic score with its evidence and the assembled rationale", async () => {
    seed("BT-1", {
      scanOverall: 0.78,
      scanRationale: "Old; superseded; already built",
      scanScores: {
        staleness: { score: 0.7, rationale: "Untouched 400 days" },
        duplicate: {
          score: 0.8,
          evidence: { supersededBy: "BT-99", overlapScore: 0.9, matchReason: "Same migration" },
          rationale: "Superseded by BT-99",
        },
        alreadyBuilt: {
          score: 0.6,
          evidence: { implementedIn: "src/foo.ts", detected: true, degraded: false },
        },
      },
    });

    const data = await (await getReq("BT-1")).json();
    expect(data.scanOverall).toBeCloseTo(0.78);
    expect(data.scanRationale).toBe("Old; superseded; already built");

    const byKey = Object.fromEntries(data.topics.map((t: { key: string }) => [t.key, t]));
    expect(byKey.staleness.score).toBeCloseTo(0.7);
    expect(byKey.duplicate.score).toBeCloseTo(0.8);
    // The superseded-by link target is carried through in the evidence.
    expect(byKey.duplicate.evidence.supersededBy).toBe("BT-99");
    expect(byKey.alreadyBuilt.evidence.implementedIn).toBe("src/foo.ts");
    // A topic with no score reports null rather than dropping out of the list.
    expect(byKey.relevance.score).toBeNull();
  });
});

describe("POST /api/cleanup/[key]/disposition", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("confirm sets disposition=confirmed locally with no Jira write", async () => {
    seed("BT-2");
    const res = await postReq("BT-2", { action: "confirm" });
    expect(res.status).toBe(200);
    const m = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-2")).get();
    expect(m?.disposition).toBe("confirmed");
    expect(jiraSpies.updateIssue).not.toHaveBeenCalled();
  });

  it("dismiss sets the cooldown and stores the note", async () => {
    seed("BT-3");
    const now = Date.now();
    const res = await postReq("BT-3", { action: "dismiss", note: "not relevant" });
    expect(res.status).toBe(200);
    const m = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-3")).get();
    expect(m?.disposition).toBe("dismissed");
    expect(m?.dispositionNote).toBe("not relevant");
    const until = new Date(m?.dispositionUntil as string).getTime();
    expect(until).toBeGreaterThan(now + (DISMISS_COOLDOWN_DAYS - 1) * 24 * 60 * 60 * 1000);
  });

  it("rejects an invalid action", async () => {
    seed("BT-4");
    const res = await postReq("BT-4", { action: "explode" });
    expect(res.status).toBe(400);
  });

  it("404s when the ticket does not exist", async () => {
    const res = await postReq("BT-NONE", { action: "confirm" });
    expect(res.status).toBe(404);
  });
});
