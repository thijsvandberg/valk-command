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

const mockGetIssue = vi.fn();
const mockSearchIssues = vi.fn();

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    getIssue: (...args: unknown[]) => mockGetIssue(...args),
    searchIssues: (...args: unknown[]) => mockSearchIssues(...args),
  },
}));

import { GET } from "./route";

interface SearchResult {
  key: string;
  title: string;
  type: string;
  status: string;
  sprintName: string | null;
  source: "local" | "jira" | "recent";
}

interface SearchResponse {
  results: SearchResult[];
  hasMore: boolean;
}

function makeRequest(params: Record<string, string>): Request {
  const sp = new URLSearchParams(params);
  return new Request(`http://localhost:3100/api/tickets/search?${sp}`);
}

function seedTickets(count: number) {
  const values = Array.from({ length: count }, (_, i) => ({
    jiraKey: `VPL-${100 + i}`,
    title: `Ticket number ${100 + i}`,
    status: "TO DO",
    type: "story",
    sprintName: `Sprint ${Math.floor(i / 5) + 1}`,
  }));
  testDb.insert(ticket).values(values).run();
}

function seedSpecificTickets() {
  testDb.insert(ticket).values([
    { jiraKey: "VPL-100", title: "Fix login bug", status: "TO DO", type: "bug", sprintName: "Sprint 1" },
    { jiraKey: "VPL-101", title: "Add dark mode", status: "IN PROGRESS", type: "story", sprintName: "Sprint 2" },
    { jiraKey: "VPL-102", title: "Login page redesign", status: "DONE", type: "task", sprintName: null },
  ]).run();
}

describe("GET /api/tickets/search", () => {
  beforeEach(() => {
    testDb = createTestDb();
    mockGetIssue.mockReset();
    mockSearchIssues.mockReset();
  });

  it("returns empty for short queries", async () => {
    seedSpecificTickets();
    const res = await GET(makeRequest({ q: "a" }));
    const data: SearchResponse = await res.json();
    expect(data.results).toEqual([]);
    expect(data.hasMore).toBe(false);
  });

  it("searches by title", async () => {
    seedSpecificTickets();
    const res = await GET(makeRequest({ q: "login" }));
    const data: SearchResponse = await res.json();
    expect(data.results).toHaveLength(2);
    expect(data.results.map((r) => r.key).sort()).toEqual(["VPL-100", "VPL-102"]);
  });

  it("searches by key", async () => {
    seedSpecificTickets();
    const res = await GET(makeRequest({ q: "VPL-101" }));
    const data: SearchResponse = await res.json();
    expect(data.results).toHaveLength(1);
    expect(data.results[0].key).toBe("VPL-101");
  });

  it("excludes specified key", async () => {
    seedSpecificTickets();
    const res = await GET(makeRequest({ q: "login", exclude: "VPL-100" }));
    const data: SearchResponse = await res.json();
    expect(data.results).toHaveLength(1);
    expect(data.results[0].key).toBe("VPL-102");
  });

  it("returns empty for no matches", async () => {
    seedSpecificTickets();
    const res = await GET(makeRequest({ q: "zzzzz" }));
    const data: SearchResponse = await res.json();
    expect(data.results).toEqual([]);
  });

  it("includes source field on results", async () => {
    seedTickets(6);
    const res = await GET(makeRequest({ q: "Ticket" }));
    const data: SearchResponse = await res.json();
    expect(data.results.length).toBeGreaterThanOrEqual(5);
    expect(data.results.every((r) => r.source === "local")).toBe(true);
  });

  it("includes sprintName in results", async () => {
    seedSpecificTickets();
    const res = await GET(makeRequest({ q: "login" }));
    const data: SearchResponse = await res.json();
    const loginBug = data.results.find((r) => r.key === "VPL-100");
    expect(loginBug?.sprintName).toBe("Sprint 1");
    const redesign = data.results.find((r) => r.key === "VPL-102");
    expect(redesign?.sprintName).toBeNull();
  });

  describe("deleted ticket filtering", () => {
    it("excludes tickets with status Deleted (case-insensitive)", async () => {
      testDb.insert(ticket).values([
        { jiraKey: "VPL-100", title: "Active ticket", status: "TO DO", type: "bug" },
        { jiraKey: "VPL-101", title: "Deleted ticket lower", status: "deleted", type: "story" },
        { jiraKey: "VPL-102", title: "Deleted ticket upper", status: "DELETED", type: "task" },
        { jiraKey: "VPL-103", title: "Deleted ticket mixed", status: "Deleted", type: "bug" },
      ]).run();

      const res = await GET(makeRequest({ q: "ticket" }));
      const data: SearchResponse = await res.json();
      expect(data.results).toHaveLength(1);
      expect(data.results[0].key).toBe("VPL-100");
    });

    it("excludes tickets with removedFromJiraAt set", async () => {
      testDb.insert(ticket).values([
        { jiraKey: "VPL-100", title: "Active ticket", status: "TO DO", type: "bug" },
        { jiraKey: "VPL-101", title: "Removed ticket", status: "TO DO", type: "story", removedFromJiraAt: "2026-01-01T00:00:00Z" },
      ]).run();

      const res = await GET(makeRequest({ q: "ticket" }));
      const data: SearchResponse = await res.json();
      expect(data.results).toHaveLength(1);
      expect(data.results[0].key).toBe("VPL-100");
    });
  });

  describe("pagination", () => {
    it("returns hasMore=true when more results exist", async () => {
      seedTickets(30);
      const res = await GET(makeRequest({ q: "Ticket" }));
      const data: SearchResponse = await res.json();
      expect(data.results).toHaveLength(25);
      expect(data.hasMore).toBe(true);
    });

    it("returns remaining results with offset", async () => {
      seedTickets(30);
      const res = await GET(makeRequest({ q: "Ticket", offset: "25" }));
      const data: SearchResponse = await res.json();
      expect(data.results).toHaveLength(5);
      expect(data.hasMore).toBe(false);
    });

    it("skips Jira fallback on paginated requests", async () => {
      seedTickets(2);
      mockSearchIssues.mockResolvedValue([]);
      const res = await GET(makeRequest({ q: "Ticket", offset: "25" }));
      const data: SearchResponse = await res.json();
      expect(data.results).toHaveLength(0);
      expect(mockSearchIssues).not.toHaveBeenCalled();
    });
  });

  describe("recently updated (empty state)", () => {
    it("returns recently updated tickets ordered by jiraUpdatedAt", async () => {
      testDb.insert(ticket).values([
        { jiraKey: "VPL-100", title: "Old ticket", status: "DONE", type: "bug", jiraUpdatedAt: "2026-01-01T00:00:00Z" },
        { jiraKey: "VPL-101", title: "New ticket", status: "TO DO", type: "story", jiraUpdatedAt: "2026-05-01T00:00:00Z" },
        { jiraKey: "VPL-102", title: "Mid ticket", status: "IN PROGRESS", type: "task", jiraUpdatedAt: "2026-03-01T00:00:00Z" },
      ]).run();

      const res = await GET(makeRequest({ recent: "1" }));
      const data: SearchResponse = await res.json();
      expect(data.results).toHaveLength(3);
      expect(data.results.map((r) => r.key)).toEqual(["VPL-101", "VPL-102", "VPL-100"]);
      expect(data.results[0].source).toBe("recent");
      expect(data.hasMore).toBe(false);
    });

    it("excludes deleted tickets from recently updated", async () => {
      testDb.insert(ticket).values([
        { jiraKey: "VPL-100", title: "Active", status: "TO DO", type: "bug", jiraUpdatedAt: "2026-05-01T00:00:00Z" },
        { jiraKey: "VPL-101", title: "Deleted", status: "Deleted", type: "story", jiraUpdatedAt: "2026-05-02T00:00:00Z" },
        { jiraKey: "VPL-102", title: "Removed", status: "TO DO", type: "task", jiraUpdatedAt: "2026-05-03T00:00:00Z", removedFromJiraAt: "2026-05-03T00:00:00Z" },
      ]).run();

      const res = await GET(makeRequest({ recent: "1" }));
      const data: SearchResponse = await res.json();
      expect(data.results).toHaveLength(1);
      expect(data.results[0].key).toBe("VPL-100");
    });

    it("excludes specified key from recently updated", async () => {
      testDb.insert(ticket).values([
        { jiraKey: "VPL-100", title: "Ticket A", status: "TO DO", type: "bug", jiraUpdatedAt: "2026-05-01T00:00:00Z" },
        { jiraKey: "VPL-101", title: "Ticket B", status: "TO DO", type: "story", jiraUpdatedAt: "2026-05-02T00:00:00Z" },
      ]).run();

      const res = await GET(makeRequest({ recent: "1", exclude: "VPL-101" }));
      const data: SearchResponse = await res.json();
      expect(data.results).toHaveLength(1);
      expect(data.results[0].key).toBe("VPL-100");
    });

    it("includes sprintName in recently updated results", async () => {
      testDb.insert(ticket).values([
        { jiraKey: "VPL-100", title: "Sprint ticket", status: "TO DO", type: "bug", sprintName: "Sprint 42", jiraUpdatedAt: "2026-05-01T00:00:00Z" },
      ]).run();

      const res = await GET(makeRequest({ recent: "1" }));
      const data: SearchResponse = await res.json();
      expect(data.results[0].sprintName).toBe("Sprint 42");
    });
  });

  describe("LIKE wildcard escaping", () => {
    it("treats % in the query as a literal, not a wildcard", async () => {
      testDb.insert(ticket).values([
        { jiraKey: "VPL-200", title: "100% complete", status: "TO DO", type: "story" },
        { jiraKey: "VPL-201", title: "1009 done", status: "TO DO", type: "story" },
      ]).run();

      const res = await GET(makeRequest({ q: "100%", jira: "0" }));
      const data: SearchResponse = await res.json();
      expect(data.results.map((r) => r.key)).toEqual(["VPL-200"]);
    });

    it("treats _ in the query as a literal, not a single-char wildcard", async () => {
      testDb.insert(ticket).values([
        { jiraKey: "VPL-300", title: "a_b marker", status: "TO DO", type: "story" },
        { jiraKey: "VPL-301", title: "axb marker", status: "TO DO", type: "story" },
      ]).run();

      const res = await GET(makeRequest({ q: "a_b", jira: "0" }));
      const data: SearchResponse = await res.json();
      expect(data.results.map((r) => r.key)).toEqual(["VPL-300"]);
    });

    it("matches a literal backslash without raising a SQL error", async () => {
      testDb.insert(ticket).values([
        { jiraKey: "VPL-400", title: "path a\\b here", status: "TO DO", type: "story" },
      ]).run();

      const res = await GET(makeRequest({ q: "a\\b", jira: "0" }));
      const data: SearchResponse = await res.json();
      expect(data.results.map((r) => r.key)).toEqual(["VPL-400"]);
    });
  });

  describe("Jira fallback", () => {
    it("queries Jira when local results are sparse (< 5)", async () => {
      seedTickets(3);
      mockSearchIssues.mockResolvedValue([
        { key: "VPL-900", fields: { summary: "Jira result 1", issuetype: { name: "Bug" }, status: { name: "Open" } } },
        { key: "VPL-901", fields: { summary: "Jira result 2", issuetype: { name: "Story" }, status: { name: "Done" } } },
      ]);

      const res = await GET(makeRequest({ q: "Ticket" }));
      const data: SearchResponse = await res.json();

      expect(data.results).toHaveLength(5);
      expect(mockSearchIssues).toHaveBeenCalledTimes(1);
      const localResults = data.results.filter((r) => r.source === "local");
      const jiraResults = data.results.filter((r) => r.source === "jira");
      expect(localResults).toHaveLength(3);
      expect(jiraResults).toHaveLength(2);
    });

    it("does NOT query Jira when local results >= 5", async () => {
      seedTickets(6);
      const res = await GET(makeRequest({ q: "Ticket" }));
      const data: SearchResponse = await res.json();

      expect(data.results.length).toBe(6);
      expect(mockSearchIssues).not.toHaveBeenCalled();
      expect(mockGetIssue).not.toHaveBeenCalled();
    });

    it("deduplicates Jira results that overlap with local", async () => {
      seedTickets(2);
      mockSearchIssues.mockResolvedValue([
        { key: "VPL-100", fields: { summary: "Duplicate from Jira", issuetype: { name: "Story" }, status: { name: "Open" } } },
        { key: "VPL-950", fields: { summary: "Unique Jira result", issuetype: { name: "Bug" }, status: { name: "Done" } } },
      ]);

      const res = await GET(makeRequest({ q: "Ticket" }));
      const data: SearchResponse = await res.json();

      const keys = data.results.map((r) => r.key);
      expect(keys.filter((k) => k === "VPL-100")).toHaveLength(1);
      expect(keys).toContain("VPL-950");
      const vpl100 = data.results.find((r) => r.key === "VPL-100");
      expect(vpl100!.source).toBe("local");
    });

    it("falls back to exact key match via getIssue", async () => {
      mockGetIssue.mockResolvedValue({
        key: "VPL-999",
        fields: { summary: "Found via key", issuetype: { name: "Task" }, status: { name: "In Progress" } },
      });

      const res = await GET(makeRequest({ q: "VPL-999" }));
      const data: SearchResponse = await res.json();

      expect(data.results).toHaveLength(1);
      expect(data.results[0]).toMatchObject({ key: "VPL-999", source: "jira" });
      expect(mockGetIssue).toHaveBeenCalledWith("VPL-999");
    });

    it("skips Jira when jira=0 param is set", async () => {
      seedTickets(2);
      const res = await GET(makeRequest({ q: "Ticket", jira: "0" }));
      const data: SearchResponse = await res.json();

      expect(data.results).toHaveLength(2);
      expect(mockSearchIssues).not.toHaveBeenCalled();
      expect(mockGetIssue).not.toHaveBeenCalled();
    });

    it("handles Jira failure gracefully", async () => {
      seedTickets(3);
      mockSearchIssues.mockRejectedValue(new Error("Jira is down"));

      const res = await GET(makeRequest({ q: "Ticket" }));
      const data: SearchResponse = await res.json();

      expect(data.results).toHaveLength(3);
      expect(data.results.every((r) => r.source === "local")).toBe(true);
    });

    it("Jira results include null sprintName", async () => {
      mockGetIssue.mockResolvedValue({
        key: "VPL-999",
        fields: { summary: "Jira ticket", issuetype: { name: "Task" }, status: { name: "Done" } },
      });

      const res = await GET(makeRequest({ q: "VPL-999" }));
      const data: SearchResponse = await res.json();
      expect(data.results[0].sprintName).toBeNull();
    });
  });
});
