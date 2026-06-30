// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJiraClientMock } from "@/test/mocks";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, sprintNameCache } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() { return testDb; },
}));

vi.mock("@/lib/jira-client", () => createJiraClientMock({
  jiraClient: {
    createIssue: vi.fn().mockResolvedValue({ key: "VPL-999", id: "99999" }),
    moveToSprint: vi.fn().mockResolvedValue(undefined),
    rankToTopOfSprint: vi.fn().mockResolvedValue(undefined),
    rankToBottomOfSprint: vi.fn().mockResolvedValue(undefined),
    rankToTopOfBacklog: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/sprint-membership", () => ({
  syncTicketSprints: vi.fn(),
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/cache", () => ({
  cache: { invalidate: vi.fn() },
}));

vi.mock("@/lib/env", () => ({
  env: { JIRA_PROJECT_KEY: "VPL" },
}));

import { createTicketWithJira } from "./create-ticket";
import { jiraClient } from "@/lib/jira-client";

const rankToTop = jiraClient.rankToTopOfSprint as ReturnType<typeof vi.fn>;
const rankToBottom = jiraClient.rankToBottomOfSprint as ReturnType<typeof vi.fn>;
const rankToTopOfBacklog = jiraClient.rankToTopOfBacklog as ReturnType<typeof vi.fn>;
const moveToSprint = jiraClient.moveToSprint as ReturnType<typeof vi.fn>;

function cacheName(sprintId: string, displayName: string) {
  testDb.insert(sprintNameCache).values({ sprintId, displayName }).run();
}

describe("createTicketWithJira — placement rule (BRDG-371)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("ranks a new ticket to the BOTTOM of a regular sprint once the move succeeds", async () => {
    cacheName("42", "BT: 140");
    const result = await createTicketWithJira({ title: "New story", issueType: "Story", sprintId: "42" });

    expect(moveToSprint).toHaveBeenCalledWith(["VPL-999"], 42);
    expect(rankToBottom).toHaveBeenCalledWith(["VPL-999"], 42);
    expect(rankToTop).not.toHaveBeenCalled();
    expect(result.sprintId).toBe("42");
    const row = testDb.select().from(ticket).all().find((r) => r.jiraKey === "VPL-999");
    expect(row!.sprintName).toBe("42");
    // Local rank set so the board shows it at the bottom immediately (no peers → 0).
    expect(row!.jiraRank).toBe(0);
  });

  it("ranks a new ticket to the TOP of a named backlog", async () => {
    cacheName("55", "BT: Backlog");
    await createTicketWithJira({ title: "Into backlog sprint", issueType: "Story", sprintId: "55" });

    expect(rankToTop).toHaveBeenCalledWith(["VPL-999"], 55);
    expect(rankToBottom).not.toHaveBeenCalled();
  });

  it("ranks a no-sprint create to the TOP of the backlog", async () => {
    await createTicketWithJira({ title: "Backlog story", issueType: "Story" });

    expect(moveToSprint).not.toHaveBeenCalled();
    expect(rankToTopOfBacklog).toHaveBeenCalledWith(["VPL-999"]);
    expect(rankToTop).not.toHaveBeenCalled();
    expect(rankToBottom).not.toHaveBeenCalled();
  });

  it("falls back to the backlog (top) when the sprint assignment itself fails", async () => {
    cacheName("42", "BT: 140");
    moveToSprint.mockRejectedValueOnce(new Error("sprint closed"));

    const result = await createTicketWithJira({ title: "Into sprint", issueType: "Story", sprintId: "42" });

    // The ticket fell back to the backlog, so it ranks to the top of the backlog.
    expect(rankToTopOfBacklog).toHaveBeenCalledWith(["VPL-999"]);
    expect(rankToBottom).not.toHaveBeenCalled();
    expect(result.sprintId).toBeNull();
    const row = testDb.select().from(ticket).all().find((r) => r.jiraKey === "VPL-999");
    expect(row!.sprintName).toBeNull();
  });

  it("tolerates a rank failure: the ticket is still created and assigned to the sprint", async () => {
    cacheName("42", "BT: 140");
    rankToBottom.mockRejectedValueOnce(new Error("rank API down"));

    const result = await createTicketWithJira({ title: "Into sprint", issueType: "Story", sprintId: "42" });

    // The rank failure must not fail the create or undo the sprint assignment.
    expect(result.key).toBe("VPL-999");
    expect(result.sprintId).toBe("42");
    const row = testDb.select().from(ticket).all().find((r) => r.jiraKey === "VPL-999");
    expect(row!.sprintName).toBe("42");
  });
});
