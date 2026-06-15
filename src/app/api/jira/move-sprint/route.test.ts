// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { NextRequest } from "next/server";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

const mockMoveToSprint = vi.fn().mockResolvedValue(undefined);
const mockMoveToBacklog = vi.fn().mockResolvedValue(undefined);
const mockRankToTopOfSprint = vi.fn().mockResolvedValue(undefined);
const mockRankToTopOfBacklog = vi.fn().mockResolvedValue(undefined);
const mockRankToBottomOfSprint = vi.fn().mockResolvedValue(undefined);
const mockRankToBottomOfBacklog = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    moveToSprint: (...args: unknown[]) => mockMoveToSprint(...args),
    moveToBacklog: (...args: unknown[]) => mockMoveToBacklog(...args),
    rankToTopOfSprint: (...args: unknown[]) => mockRankToTopOfSprint(...args),
    rankToTopOfBacklog: (...args: unknown[]) => mockRankToTopOfBacklog(...args),
    rankToBottomOfSprint: (...args: unknown[]) => mockRankToBottomOfSprint(...args),
    rankToBottomOfBacklog: (...args: unknown[]) => mockRankToBottomOfBacklog(...args),
  },
}));

vi.mock("@/lib/cache", () => ({
  cache: {
    invalidate: vi.fn(),
  },
}));

import { POST } from "./route";
import { cache } from "@/lib/cache";
import { ticket } from "@/db/schema";
import { eq } from "drizzle-orm";

function makeRequest(body: unknown): Request {
  return new NextRequest("http://localhost/api/jira/move-sprint", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/jira/move-sprint", () => {
  beforeEach(() => {
    testDb = createTestDb();
    mockMoveToSprint.mockReset().mockResolvedValue(undefined);
    mockMoveToBacklog.mockReset().mockResolvedValue(undefined);
    mockRankToTopOfSprint.mockReset().mockResolvedValue(undefined);
    mockRankToTopOfBacklog.mockReset().mockResolvedValue(undefined);
    mockRankToBottomOfSprint.mockReset().mockResolvedValue(undefined);
    mockRankToBottomOfBacklog.mockReset().mockResolvedValue(undefined);

    testDb.insert(ticket).values({
      jiraKey: "VPL-100",
      title: "Test ticket",
      status: "TO DO",
      sprintName: "123",
    }).run();
  });

  it("moves ticket to a numbered sprint", async () => {
    const req = makeRequest({ issueKeys: ["VPL-100"], targetSprintId: "456" });
    const res = await POST(req);
    const data = await res.json();

    expect(data.ok).toBe(true);
    expect(data.movedCount).toBe(1);
    expect(mockMoveToSprint).toHaveBeenCalledWith(["VPL-100"], 456);
    // No position given -> rank is left untouched (the issue keeps its existing rank).
    expect(mockRankToTopOfSprint).not.toHaveBeenCalled();

    const t = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-100")).get();
    expect(t!.sprintName).toBe("456");
  });

  it("invalidates the sprints cache so the embedded backlogCount refreshes", async () => {
    vi.mocked(cache.invalidate).mockClear();
    const req = makeRequest({ issueKeys: ["VPL-100"], targetSprintId: "__backlog__" });
    await POST(req);

    expect(cache.invalidate).toHaveBeenCalledWith("/api/jira/sprints");
  });

  it("ranks to the top of the sprint when position is 'top'", async () => {
    const req = makeRequest({ issueKeys: ["VPL-100"], targetSprintId: "456", position: "top" });
    const res = await POST(req);
    expect((await res.json()).ok).toBe(true);
    expect(mockMoveToSprint).toHaveBeenCalledWith(["VPL-100"], 456);
    expect(mockRankToTopOfSprint).toHaveBeenCalledWith(["VPL-100"], 456);
  });

  it("ranks to the top of the backlog when position is 'top'", async () => {
    const req = makeRequest({ issueKeys: ["VPL-100"], targetSprintId: "__backlog__", position: "top" });
    const res = await POST(req);
    expect((await res.json()).ok).toBe(true);
    expect(mockMoveToBacklog).toHaveBeenCalledWith(["VPL-100"]);
    expect(mockRankToTopOfBacklog).toHaveBeenCalledWith(["VPL-100"]);
  });

  it("ranks to the bottom of the sprint when position is 'bottom'", async () => {
    const req = makeRequest({ issueKeys: ["VPL-100"], targetSprintId: "456", position: "bottom" });
    const res = await POST(req);
    expect((await res.json()).ok).toBe(true);
    expect(mockMoveToSprint).toHaveBeenCalledWith(["VPL-100"], 456);
    expect(mockRankToBottomOfSprint).toHaveBeenCalledWith(["VPL-100"], 456);
    expect(mockRankToTopOfSprint).not.toHaveBeenCalled();
  });

  it("ranks to the bottom of the backlog when position is 'bottom'", async () => {
    const req = makeRequest({ issueKeys: ["VPL-100"], targetSprintId: "__backlog__", position: "bottom" });
    const res = await POST(req);
    expect((await res.json()).ok).toBe(true);
    expect(mockMoveToBacklog).toHaveBeenCalledWith(["VPL-100"]);
    expect(mockRankToBottomOfBacklog).toHaveBeenCalledWith(["VPL-100"]);
  });

  it("re-indexes local jiraRank so a top move does not snap back", async () => {
    testDb.insert(ticket).values([
      { jiraKey: "VPL-200", title: "a", status: "TO DO", sprintName: "456", jiraRank: 0 },
      { jiraKey: "VPL-201", title: "b", status: "TO DO", sprintName: "456", jiraRank: 1 },
    ]).run();

    await POST(makeRequest({ issueKeys: ["VPL-100"], targetSprintId: "456", position: "top" }));

    const rankOf = (k: string) => testDb.select().from(ticket).where(eq(ticket.jiraKey, k)).get()!.jiraRank;
    expect(rankOf("VPL-100")).toBe(0);
    expect(rankOf("VPL-200")).toBe(1);
    expect(rankOf("VPL-201")).toBe(2);
  });

  it("re-indexes local jiraRank to the end on a bottom move", async () => {
    testDb.insert(ticket).values([
      { jiraKey: "VPL-200", title: "a", status: "TO DO", sprintName: "456", jiraRank: 0 },
      { jiraKey: "VPL-201", title: "b", status: "TO DO", sprintName: "456", jiraRank: 1 },
    ]).run();

    await POST(makeRequest({ issueKeys: ["VPL-100"], targetSprintId: "456", position: "bottom" }));

    const rankOf = (k: string) => testDb.select().from(ticket).where(eq(ticket.jiraKey, k)).get()!.jiraRank;
    expect(rankOf("VPL-200")).toBe(0);
    expect(rankOf("VPL-201")).toBe(1);
    expect(rankOf("VPL-100")).toBe(2);
  });

  it("still succeeds when ranking to top fails (rank is best-effort)", async () => {
    mockRankToTopOfSprint.mockRejectedValue(new Error("rank API down"));
    const req = makeRequest({ issueKeys: ["VPL-100"], targetSprintId: "456", position: "top" });
    const res = await POST(req);
    const data = await res.json();
    expect(data.ok).toBe(true);
    const t = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-100")).get();
    expect(t!.sprintName).toBe("456");
  });

  it("collapses sprint_ids to the single target sprint on move", async () => {
    // A multi-sprint ticket should leave every other column after a manual move.
    testDb.update(ticket).set({ sprintIds: JSON.stringify(["123", "999"]) }).where(eq(ticket.jiraKey, "VPL-100")).run();

    const req = makeRequest({ issueKeys: ["VPL-100"], targetSprintId: "456" });
    await POST(req);

    const t = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-100")).get();
    expect(t!.sprintIds).toBe(JSON.stringify(["456"]));
  });

  it("clears sprint_ids when moving to backlog", async () => {
    testDb.update(ticket).set({ sprintIds: JSON.stringify(["123"]) }).where(eq(ticket.jiraKey, "VPL-100")).run();

    const req = makeRequest({ issueKeys: ["VPL-100"], targetSprintId: "__backlog__" });
    await POST(req);

    const t = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-100")).get();
    expect(t!.sprintIds).toBeNull();
  });

  it("moves ticket to backlog by clearing sprint", async () => {
    const req = makeRequest({ issueKeys: ["VPL-100"], targetSprintId: "__backlog__" });
    const res = await POST(req);
    const data = await res.json();

    expect(data.ok).toBe(true);
    expect(data.movedCount).toBe(1);
    expect(mockMoveToBacklog).toHaveBeenCalledWith(["VPL-100"]);
    expect(mockMoveToSprint).not.toHaveBeenCalled();

    const t = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-100")).get();
    expect(t!.sprintName).toBe("");
  });

  it("returns 400 for missing issueKeys", async () => {
    const req = makeRequest({ targetSprintId: "456" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-numeric non-backlog targetSprintId", async () => {
    const req = makeRequest({ issueKeys: ["VPL-100"], targetSprintId: "abc" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
