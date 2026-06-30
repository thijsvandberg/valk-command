// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJiraClientMock } from "@/test/mocks";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketMetadata, appSetting, activityLog } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/jira-client", () => createJiraClientMock({
  jiraClient: { isLive: false },
  JiraApiError: class extends Error {},
  extractSprint: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));

import { runDeprecationStalenessScan } from "./scheduled-tasks";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

function insertTicket(key: string, opts: {
  sprintName: string;
  status: string;
  updated: string;
  removed?: string;
  epicKey?: string;
}) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title: key,
    status: opts.status,
    sprintName: opts.sprintName,
    jiraUpdatedAt: opts.updated,
    removedFromJiraAt: opts.removed ?? null,
    epicKey: opts.epicKey ?? null,
  }).run();
}

describe("runDeprecationStalenessScan", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.resetAllMocks();
  });

  it("scores backlog tickets and writes scan-state fields without an existing metadata row", async () => {
    insertTicket("BT-1", { sprintName: "", status: "Backlog", updated: daysAgo(600) });

    const result = await runDeprecationStalenessScan();

    expect(result.scanned).toBe(1);
    expect(result.candidates).toBe(1);
    expect(result.backlogSize).toBe(1);

    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-1")).get();
    expect(meta?.scanOverall).toBe(1);
    expect(meta?.lastScannedAt).toBeTruthy();
    expect(meta?.scanRationale).toContain("never in a sprint");
    const scores = JSON.parse(meta!.scanScores!);
    expect(scores.staleness.score).toBe(1);
  });

  it("excludes tickets that are in a sprint or removed from Jira", async () => {
    insertTicket("BT-1", { sprintName: "", status: "Backlog", updated: daysAgo(600) });
    insertTicket("BT-2", { sprintName: "42", status: "Backlog", updated: daysAgo(600) }); // in sprint
    insertTicket("BT-3", { sprintName: "", status: "Backlog", updated: daysAgo(600), removed: daysAgo(1) });

    const result = await runDeprecationStalenessScan();

    expect(result.backlogSize).toBe(1);
    expect(result.scanned).toBe(1);
    const scanned2 = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-2")).get();
    expect(scanned2).toBeUndefined();
  });

  it("preserves pre-existing non-staleness scores and PO metadata fields", async () => {
    insertTicket("BT-1", { sprintName: "", status: "Backlog", updated: daysAgo(600) });
    testDb.insert(ticketMetadata).values({
      jiraKey: "BT-1",
      poNotes: "keep me",
      scanScores: JSON.stringify({ duplication: { score: 0.9 } }),
    }).run();

    await runDeprecationStalenessScan();

    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-1")).get();
    expect(meta?.poNotes).toBe("keep me");
    const scores = JSON.parse(meta!.scanScores!);
    expect(scores.duplication.score).toBe(0.9);
    expect(scores.staleness).toBeTruthy();
  });

  it("counts a ticket with populated PO metadata as not a candidate when otherwise fresh", async () => {
    insertTicket("BT-1", { sprintName: "5", status: "In Progress", updated: daysAgo(5) });
    testDb.insert(ticketMetadata).values({ jiraKey: "BT-1", poNotes: "prepared" }).run();

    const result = await runDeprecationStalenessScan();
    expect(result.candidates).toBe(0);
  });

  it("writes the rolling cursor and logs a run summary", async () => {
    insertTicket("BT-1", { sprintName: "", status: "Backlog", updated: daysAgo(600) });

    await runDeprecationStalenessScan();

    const cursor = testDb.select().from(appSetting)
      .where(eq(appSetting.key, "scheduler:deprecation-staleness-scan:cursor")).get();
    expect(cursor?.value).toBeTruthy();

    const logs = testDb.select().from(activityLog).all();
    const entry = logs.find((l) => l.type === "deprecation-scan");
    expect(entry).toBeTruthy();
    expect(entry?.summary).toContain("Staleness scan");
  });

  it("returns an empty result when the backlog is empty", async () => {
    const result = await runDeprecationStalenessScan();
    expect(result).toEqual({ scanned: 0, candidates: 0, backlogSize: 0 });
  });
});
