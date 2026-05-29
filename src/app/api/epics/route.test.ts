// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

const mockCache = vi.hoisted(() => ({
  get: vi.fn().mockReturnValue(null),
  set: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("@/lib/cache", () => ({
  cache: mockCache,
}));

import { GET } from "./route";

describe("GET /api/epics", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
    mockCache.get.mockReturnValue(null);
  });

  it("returns empty array when no epics exist", async () => {
    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("returns cached data with X-Cache HIT header", async () => {
    const cachedEpics = [{ key: "VPL-E1", name: "Cached Epic", childCount: 0 }];
    mockCache.get.mockReturnValue(cachedEpics);

    const res = await GET();
    const data = await res.json();
    expect(res.headers.get("X-Cache")).toBe("HIT");
    expect(data).toEqual(cachedEpics);
    expect(mockCache.set).not.toHaveBeenCalled();
  });

  it("sets cache and returns X-Cache MISS on cache miss", async () => {
    testDb.insert(ticket).values({
      jiraKey: "VPL-E1", title: "Epic One", status: "IN PROGRESS", type: "epic",
    }).run();

    const res = await GET();
    expect(res.headers.get("X-Cache")).toBe("MISS");
    expect(mockCache.set).toHaveBeenCalledWith("/api/epics", expect.any(Array), 300_000);
  });

  it("computes correct childCount", async () => {
    testDb.insert(ticket).values([
      { jiraKey: "VPL-E1", title: "Epic", status: "TO DO", type: "epic" },
      { jiraKey: "VPL-1", title: "Child 1", status: "TO DO", type: "story", epicKey: "VPL-E1" },
      { jiraKey: "VPL-2", title: "Child 2", status: "TO DO", type: "task", epicKey: "VPL-E1" },
    ]).run();

    const res = await GET();
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].childCount).toBe(2);
  });

  it("detects stale summary when jiraUpdatedAt > summaryUpdatedAt", async () => {
    testDb.insert(ticket).values({
      jiraKey: "VPL-E1", title: "Epic", status: "TO DO", type: "epic",
      summary: "Old summary",
      summaryUpdatedAt: "2026-01-01T00:00:00Z",
      jiraUpdatedAt: "2026-03-01T00:00:00Z",
    }).run();

    const res = await GET();
    const data = await res.json();
    expect(data[0].summaryStale).toBe(true);
  });

  it("sets summaryStale false when no summary exists", async () => {
    testDb.insert(ticket).values({
      jiraKey: "VPL-E1", title: "Epic", status: "TO DO", type: "epic",
      summary: null,
      jiraUpdatedAt: "2026-03-01T00:00:00Z",
    }).run();

    const res = await GET();
    const data = await res.json();
    expect(data[0].summaryStale).toBe(false);
  });

  it("includes epics referenced by children but not synced as type=epic", async () => {
    testDb.insert(ticket).values([
      { jiraKey: "VPL-1", title: "Child", status: "TO DO", type: "story", epicKey: "VPL-E99", epic: "Phantom Epic" },
    ]).run();

    const res = await GET();
    const data = await res.json();
    const phantomEpic = data.find((e: { key: string }) => e.key === "VPL-E99");
    expect(phantomEpic).toBeDefined();
    expect(phantomEpic.name).toBe("Phantom Epic");
    expect(phantomEpic.status).toBe("Unknown");
  });

  it("sorts by most recent child activity first, then by child count", async () => {
    testDb.insert(ticket).values([
      { jiraKey: "VPL-E1", title: "Epic A", status: "TO DO", type: "epic" },
      { jiraKey: "VPL-E2", title: "Epic B", status: "TO DO", type: "epic" },
      { jiraKey: "VPL-1", title: "Old child", status: "TO DO", type: "story", epicKey: "VPL-E1", jiraUpdatedAt: "2026-01-01T00:00:00Z" },
      { jiraKey: "VPL-2", title: "Recent child", status: "TO DO", type: "story", epicKey: "VPL-E2", jiraUpdatedAt: "2026-05-01T00:00:00Z" },
    ]).run();

    const res = await GET();
    const data = await res.json();
    expect(data[0].key).toBe("VPL-E2");
    expect(data[1].key).toBe("VPL-E1");
  });
});
