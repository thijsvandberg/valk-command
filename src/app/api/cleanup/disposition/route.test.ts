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

const jiraSpies = { updateIssue: vi.fn(), addComment: vi.fn(), transitionIssue: vi.fn() };
vi.mock("@/lib/jira-client", () => ({
  jiraClient: jiraSpies,
  JiraApiError: class extends Error {},
  extractSprint: vi.fn(),
}));

import { POST } from "./route";

function insertTicket(key: string) {
  testDb.insert(ticket).values({ jiraKey: key, title: key, status: "Backlog", sprintName: "" }).run();
}
function disp(key: string) {
  return testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, key)).get()?.disposition;
}
function post(body: unknown) {
  return POST(
    new Request("http://localhost:3100/api/cleanup/disposition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/cleanup/disposition (bulk)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("bulk-confirms several tickets locally, no Jira write", async () => {
    insertTicket("BT-1");
    insertTicket("BT-2");
    const res = await post({ action: "confirm", keys: ["BT-1", "BT-2"] });
    const data = await res.json();
    expect(data.applied).toBe(2);
    expect(disp("BT-1")).toBe("confirmed");
    expect(disp("BT-2")).toBe("confirmed");
    expect(jiraSpies.updateIssue).not.toHaveBeenCalled();
  });

  it("de-dupes keys and reports skipped non-existent ones", async () => {
    insertTicket("BT-3");
    const res = await post({ action: "dismiss", keys: ["BT-3", "BT-3", "BT-X"] });
    const data = await res.json();
    expect(data.requested).toBe(2); // de-duped
    expect(data.applied).toBe(1);
    expect(data.skipped).toEqual(["BT-X"]);
    expect(disp("BT-3")).toBe("dismissed");
  });

  it("rejects an empty key list", async () => {
    const res = await post({ action: "confirm", keys: [] });
    expect(res.status).toBe(400);
  });
});
