// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() { return testDb; },
}));

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    rankToTopOfSprint: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { landTicketAtTopOfSprint } from "./sprint-rank";
import { jiraClient } from "@/lib/jira-client";

function seed(key: string, sprintName: string | null, jiraRank: number | null) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title: key,
    type: "story",
    status: "TO DO",
    ...(sprintName ? { sprintName } : {}),
    ...(jiraRank != null ? { jiraRank } : {}),
  }).run();
}

function rankOf(key: string): number | null {
  return testDb.select().from(ticket).where(eq(ticket.jiraKey, key)).get()!.jiraRank;
}

describe("landTicketAtTopOfSprint (BRDG-354)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("ranks the issue to the top of the sprint in Jira", async () => {
    seed("VPL-1", "42", null);
    await landTicketAtTopOfSprint("VPL-1", 42);
    expect(jiraClient.rankToTopOfSprint).toHaveBeenCalledWith(["VPL-1"], 42);
  });

  it("sets the local jiraRank below the sprint's current minimum", async () => {
    seed("VPL-OLD-A", "42", 0);
    seed("VPL-OLD-B", "42", 1);
    seed("VPL-NEW", "42", null);

    await landTicketAtTopOfSprint("VPL-NEW", 42);

    // Below the current minimum (0) so the board (asc, nulls last) shows it first.
    expect(rankOf("VPL-NEW")).toBe(-1);
    // Peers untouched.
    expect(rankOf("VPL-OLD-A")).toBe(0);
    expect(rankOf("VPL-OLD-B")).toBe(1);
  });

  it("sets jiraRank to 0 when there are no ranked peers", async () => {
    seed("VPL-NEW", "42", null);
    await landTicketAtTopOfSprint("VPL-NEW", 42);
    expect(rankOf("VPL-NEW")).toBe(0);
  });

  it("still sets the local rank when the Jira call fails (best-effort)", async () => {
    seed("VPL-OLD", "42", 3);
    seed("VPL-NEW", "42", null);
    vi.mocked(jiraClient.rankToTopOfSprint).mockRejectedValueOnce(new Error("Jira down"));

    await expect(landTicketAtTopOfSprint("VPL-NEW", 42)).resolves.toBeUndefined();
    expect(rankOf("VPL-NEW")).toBe(2);
  });
});
