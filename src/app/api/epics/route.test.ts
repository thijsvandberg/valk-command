// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJiraClientMock } from "@/test/mocks";
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

vi.mock("@/lib/jira-client", () => createJiraClientMock({
  jiraClient: {
    createIssue: vi.fn().mockResolvedValue({ key: "VPL-999", id: "99999" }),
  },
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

import { GET, POST } from "./route";
import { jiraClient } from "@/lib/jira-client";

function postRequest(body: unknown): Request {
  return new Request("http://localhost:3100/api/epics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

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

describe("POST /api/epics", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
    (jiraClient.createIssue as ReturnType<typeof vi.fn>).mockResolvedValue({ key: "VPL-999", id: "99999" });
  });

  it("creates a Jira issue of type Epic and returns its key", async () => {
    const res = await POST(postRequest({ title: "New epic" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ key: "VPL-999" });
    expect(jiraClient.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({ summary: "New epic", issueType: "Epic", projectKey: "VPL" }),
    );
  });

  it("never sends sprintId or parentKey for an epic", async () => {
    await POST(postRequest({ title: "New epic", description: "desc" }));
    const arg = (jiraClient.createIssue as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg).not.toHaveProperty("sprintId");
    expect(arg).not.toHaveProperty("parentKey");
  });

  it("converts the optional description to an ADF doc node", async () => {
    await POST(postRequest({ title: "New epic", description: "**bold**" }));
    const arg = (jiraClient.createIssue as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.description).toEqual(expect.objectContaining({ type: "doc" }));
    expect(typeof arg.description).toBe("object");
  });

  it("omits description entirely when blank or absent", async () => {
    await POST(postRequest({ title: "No desc", description: "   " }));
    const arg = (jiraClient.createIssue as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg).not.toHaveProperty("description");
  });

  it("persists a local epic row with type=epic and status=TO DO", async () => {
    await POST(postRequest({ title: "Persisted epic" }));
    const rows = testDb.select().from(ticket).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].jiraKey).toBe("VPL-999");
    expect(rows[0].type).toBe("epic");
    expect(rows[0].status).toBe("TO DO");
    expect(rows[0].title).toBe("Persisted epic");
  });

  it("invalidates the epic caches", async () => {
    await POST(postRequest({ title: "Cache epic" }));
    expect(mockCache.invalidate).toHaveBeenCalledWith("/api/epics");
  });

  it("returns 400 when the title is missing or empty", async () => {
    const res = await POST(postRequest({ title: "   " }));
    expect(res.status).toBe(400);
    expect(jiraClient.createIssue).not.toHaveBeenCalled();
  });

  it("returns 502 when the Jira create fails", async () => {
    (jiraClient.createIssue as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Jira down"));
    const res = await POST(postRequest({ title: "Boom" }));
    expect(res.status).toBe(502);
    const rows = testDb.select().from(ticket).all();
    expect(rows).toHaveLength(0);
  });
});
