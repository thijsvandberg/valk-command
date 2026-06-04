// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketMetadata, activityLog } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

// Guard rail for the epic's hard constraint: a disposition must NEVER write to
// Jira. Every Jira client method is a spy that fails the test if it is reached.
const jiraSpies = {
  updateIssue: vi.fn(),
  addComment: vi.fn(),
  transitionIssue: vi.fn(),
};
vi.mock("@/lib/jira-client", () => ({
  jiraClient: jiraSpies,
  JiraApiError: class extends Error {},
  extractSprint: vi.fn(),
}));

import { applyDisposition } from "./cleanup-disposition-service";
import { DISMISS_COOLDOWN_DAYS } from "./cleanup-disposition";

function insertTicket(key: string) {
  testDb.insert(ticket).values({ jiraKey: key, title: key, status: "Backlog", sprintName: "" }).run();
}
function meta(key: string) {
  return testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, key)).get();
}

describe("applyDisposition", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("confirm sets disposition=confirmed locally and never touches Jira", async () => {
    insertTicket("BT-1");
    const res = await applyDisposition(["BT-1"], "confirm");
    expect(res.applied).toEqual(["BT-1"]);
    expect(meta("BT-1")?.disposition).toBe("confirmed");
    expect(meta("BT-1")?.dispositionUntil ?? null).toBeNull();
    // No Jira write path was reached.
    expect(jiraSpies.updateIssue).not.toHaveBeenCalled();
    expect(jiraSpies.addComment).not.toHaveBeenCalled();
    expect(jiraSpies.transitionIssue).not.toHaveBeenCalled();
  });

  it("dismiss sets disposition=dismissed with a future cooldown and a note", async () => {
    insertTicket("BT-2");
    const now = Date.now();
    const res = await applyDisposition(["BT-2"], "dismiss", { note: "false positive", now });
    expect(res.applied).toEqual(["BT-2"]);
    const m = meta("BT-2");
    expect(m?.disposition).toBe("dismissed");
    expect(m?.dispositionNote).toBe("false positive");
    const until = new Date(m?.dispositionUntil as string).getTime();
    expect(until - now).toBe(DISMISS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    expect(jiraSpies.updateIssue).not.toHaveBeenCalled();
  });

  it("applies in bulk and skips keys with no ticket row", async () => {
    insertTicket("BT-3");
    insertTicket("BT-4");
    const res = await applyDisposition(["BT-3", "BT-4", "BT-MISSING"], "confirm");
    expect(res.applied.sort()).toEqual(["BT-3", "BT-4"]);
    expect(res.skipped).toEqual(["BT-MISSING"]);
    expect(meta("BT-3")?.disposition).toBe("confirmed");
    expect(meta("BT-4")?.disposition).toBe("confirmed");
  });

  it("writes one activity-log entry per applied batch", async () => {
    insertTicket("BT-5");
    insertTicket("BT-6");
    await applyDisposition(["BT-5", "BT-6"], "dismiss");
    const logs = testDb.select().from(activityLog).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe("deprecation-scan");
    expect(logs[0].summary).toMatch(/no Jira write/i);
  });

  it("writes no activity-log entry when nothing applied", async () => {
    await applyDisposition(["BT-NONE"], "confirm");
    expect(testDb.select().from(activityLog).all()).toHaveLength(0);
  });
});
