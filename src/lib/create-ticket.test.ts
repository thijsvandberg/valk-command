// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() { return testDb; },
}));

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    createIssue: vi.fn().mockResolvedValue({ key: "VPL-999", id: "99999" }),
    moveToSprint: vi.fn().mockResolvedValue(undefined),
    rankToTopOfSprint: vi.fn().mockResolvedValue(undefined),
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
const moveToSprint = jiraClient.moveToSprint as ReturnType<typeof vi.fn>;

describe("createTicketWithJira — rank to top of sprint (BRDG-354)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("ranks the new ticket to the top of its sprint once the move succeeds", async () => {
    const result = await createTicketWithJira({ title: "New story", issueType: "Story", sprintId: "42" });

    expect(moveToSprint).toHaveBeenCalledWith(["VPL-999"], 42);
    expect(rankToTop).toHaveBeenCalledWith(["VPL-999"], 42);
    expect(result.sprintId).toBe("42");
    const row = testDb.select().from(ticket).all().find((r) => r.jiraKey === "VPL-999");
    expect(row!.sprintName).toBe("42");
    // Local rank set so the board shows it at the top immediately (no peers → 0).
    expect(row!.jiraRank).toBe(0);
  });

  it("does not rank when no sprint is assigned (backlog create)", async () => {
    await createTicketWithJira({ title: "Backlog story", issueType: "Story" });

    expect(moveToSprint).not.toHaveBeenCalled();
    expect(rankToTop).not.toHaveBeenCalled();
  });

  it("does not rank when the sprint assignment itself fails", async () => {
    moveToSprint.mockRejectedValueOnce(new Error("sprint closed"));

    const result = await createTicketWithJira({ title: "Into sprint", issueType: "Story", sprintId: "42" });

    expect(rankToTop).not.toHaveBeenCalled();
    // Ticket still created, just left in the backlog.
    expect(result.sprintId).toBeNull();
    const row = testDb.select().from(ticket).all().find((r) => r.jiraKey === "VPL-999");
    expect(row!.sprintName).toBeNull();
  });

  it("tolerates a rank failure: the ticket is still created and assigned to the sprint", async () => {
    rankToTop.mockRejectedValueOnce(new Error("rank API down"));

    const result = await createTicketWithJira({ title: "Into sprint", issueType: "Story", sprintId: "42" });

    // The rank failure must not fail the create or undo the sprint assignment.
    expect(result.key).toBe("VPL-999");
    expect(result.sprintId).toBe("42");
    const row = testDb.select().from(ticket).all().find((r) => r.jiraKey === "VPL-999");
    expect(row!.sprintName).toBe("42");
  });
});
