// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, sprintNameCache } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() { return testDb; },
}));

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    rankToTopOfSprint: vi.fn().mockResolvedValue(undefined),
    rankToBottomOfSprint: vi.fn().mockResolvedValue(undefined),
    rankToTopOfBacklog: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { landNewTicket } from "./sprint-rank";
import { jiraClient } from "@/lib/jira-client";

function seed(key: string, sprintName: string | null, jiraRank: number | null) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title: key,
    type: "story",
    status: "TO DO",
    ...(sprintName !== null ? { sprintName } : {}),
    ...(jiraRank != null ? { jiraRank } : {}),
  }).run();
}

function cacheName(sprintId: string, displayName: string) {
  testDb.insert(sprintNameCache).values({ sprintId, displayName }).run();
}

function rankOf(key: string): number | null {
  return testDb.select().from(ticket).where(eq(ticket.jiraKey, key)).get()!.jiraRank;
}

describe("landNewTicket (BRDG-371)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  describe("regular numbered sprint -> bottom", () => {
    it("ranks the new story to the bottom of the sprint in Jira", async () => {
      cacheName("42", "BT: 140");
      seed("VPL-NEW", "42", null);
      await landNewTicket("VPL-NEW", "42");
      expect(jiraClient.rankToBottomOfSprint).toHaveBeenCalledWith(["VPL-NEW"], 42);
      expect(jiraClient.rankToTopOfSprint).not.toHaveBeenCalled();
    });

    it("sets the local jiraRank above the sprint's current maximum", async () => {
      cacheName("42", "BT: 140");
      seed("VPL-OLD-A", "42", 0);
      seed("VPL-OLD-B", "42", 1);
      seed("VPL-NEW", "42", null);

      await landNewTicket("VPL-NEW", "42");

      expect(rankOf("VPL-NEW")).toBe(2);
      expect(rankOf("VPL-OLD-A")).toBe(0);
      expect(rankOf("VPL-OLD-B")).toBe(1);
    });

    it("sets jiraRank to 0 when there are no ranked peers", async () => {
      cacheName("42", "BT: 140");
      seed("VPL-NEW", "42", null);
      await landNewTicket("VPL-NEW", "42");
      expect(rankOf("VPL-NEW")).toBe(0);
    });
  });

  describe("named backlog -> top", () => {
    it("ranks a named-backlog create to the top of that sprint", async () => {
      cacheName("55", "BT: Backlog");
      seed("VPL-OLD", "55", 0);
      seed("VPL-NEW", "55", null);

      await landNewTicket("VPL-NEW", "55");

      expect(jiraClient.rankToTopOfSprint).toHaveBeenCalledWith(["VPL-NEW"], 55);
      expect(jiraClient.rankToBottomOfSprint).not.toHaveBeenCalled();
      expect(rankOf("VPL-NEW")).toBe(-1);
    });
  });

  describe("generic backlog -> top", () => {
    it("ranks a no-sprint create to the top of the backlog", async () => {
      seed("VPL-BL-A", "", 0);
      seed("VPL-NEW", "", null);

      await landNewTicket("VPL-NEW", null);

      expect(jiraClient.rankToTopOfBacklog).toHaveBeenCalledWith(["VPL-NEW"]);
      expect(jiraClient.rankToBottomOfSprint).not.toHaveBeenCalled();
      expect(jiraClient.rankToTopOfSprint).not.toHaveBeenCalled();
      expect(rankOf("VPL-NEW")).toBe(-1);
    });

    it("sets jiraRank to 0 when the backlog has no ranked peers", async () => {
      seed("VPL-NEW", null, null);
      await landNewTicket("VPL-NEW", null);
      expect(rankOf("VPL-NEW")).toBe(0);
    });
  });

  describe("unresolved sprint name -> top (safe default)", () => {
    it("ranks to the top when the sprint name is not cached", async () => {
      seed("VPL-NEW", "999", null);
      await landNewTicket("VPL-NEW", "999");
      expect(jiraClient.rankToTopOfSprint).toHaveBeenCalledWith(["VPL-NEW"], 999);
      expect(jiraClient.rankToBottomOfSprint).not.toHaveBeenCalled();
    });
  });

  it("still sets the local rank when the Jira call fails (best-effort)", async () => {
    cacheName("42", "BT: 140");
    seed("VPL-OLD", "42", 3);
    seed("VPL-NEW", "42", null);
    vi.mocked(jiraClient.rankToBottomOfSprint).mockRejectedValueOnce(new Error("Jira down"));

    await expect(landNewTicket("VPL-NEW", "42")).resolves.toBeUndefined();
    expect(rankOf("VPL-NEW")).toBe(4);
  });
});
