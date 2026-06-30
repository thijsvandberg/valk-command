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

const mockGetIssue = vi.fn();
const mockSearchIssues = vi.fn();

vi.mock("@/lib/jira-client", () => createJiraClientMock({
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
  epicKey: string | null;
  assignee: string | null;
  jiraUpdatedAt: string | null;
  project: string | null;
  source: "local" | "jira" | "recent";
}

interface SearchFacets {
  types: string[];
  statuses: string[];
  projects: string[];
  assignees: string[];
}

interface SearchResponse {
  results: SearchResult[];
  hasMore: boolean;
  facets?: SearchFacets;
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

  // BRDG-396: server-side filters for the Link issue modal
  function isoDaysAgo(days: number): string {
    return new Date(Date.now() - days * 86_400_000).toISOString();
  }

  function seedFilterFixtures() {
    testDb.insert(ticket).values([
      { jiraKey: "VPL-100", title: "Login marker bug", status: "TO DO", type: "bug", sprintName: "10", epicKey: "VPL-1", assignee: "Ada", jiraUpdatedAt: isoDaysAgo(1) },
      { jiraKey: "VPL-101", title: "Login marker story", status: "IN PROGRESS", type: "story", sprintName: "20", epicKey: "VPL-2", assignee: "Bob", jiraUpdatedAt: isoDaysAgo(10) },
      { jiraKey: "VPL-102", title: "Login marker subtask", status: "TO DO", type: "Subtask", sprintName: "10", epicKey: "VPL-1", assignee: "Ada", jiraUpdatedAt: isoDaysAgo(2) },
      { jiraKey: "VPL-103", title: "Login marker task", status: "DONE", type: "task", sprintName: "10", epicKey: "VPL-1", assignee: "Bob", jiraUpdatedAt: isoDaysAgo(40) },
      { jiraKey: "ABC-200", title: "Login marker other project", status: "TO DO", type: "story", sprintName: "30", epicKey: "ABC-1", assignee: "Cleo", jiraUpdatedAt: isoDaysAgo(1) },
    ]).run();
  }

  describe("issue type filtering (BRDG-396)", () => {
    it("hides Subtask-typed tickets by default", async () => {
      seedFilterFixtures();
      const res = await GET(makeRequest({ q: "marker", jira: "0" }));
      const data: SearchResponse = await res.json();
      const keys = data.results.map((r) => r.key);
      expect(keys).not.toContain("VPL-102");
      expect(keys).toContain("VPL-100");
    });

    it("includes subtasks when types opts them in", async () => {
      seedFilterFixtures();
      const res = await GET(makeRequest({ q: "marker", jira: "0", types: "subtask" }));
      const data: SearchResponse = await res.json();
      expect(data.results.map((r) => r.key)).toEqual(["VPL-102"]);
    });

    it("key search bypasses the default subtask exclusion", async () => {
      seedFilterFixtures();
      const res = await GET(makeRequest({ q: "VPL-102", jira: "0" }));
      const data: SearchResponse = await res.json();
      expect(data.results.map((r) => r.key)).toEqual(["VPL-102"]);
    });

    it("filters to the requested types", async () => {
      seedFilterFixtures();
      const res = await GET(makeRequest({ q: "marker", jira: "0", types: "bug,task" }));
      const data: SearchResponse = await res.json();
      expect(data.results.map((r) => r.key).sort()).toEqual(["VPL-100", "VPL-103"]);
    });
  });

  describe("scalar filters (BRDG-396)", () => {
    it("filters by sprint", async () => {
      seedFilterFixtures();
      const res = await GET(makeRequest({ q: "marker", jira: "0", sprint: "10" }));
      const data: SearchResponse = await res.json();
      // sprint 10 has VPL-100, VPL-103 (VPL-102 is a hidden subtask)
      expect(data.results.map((r) => r.key).sort()).toEqual(["VPL-100", "VPL-103"]);
    });

    it("filters by epic", async () => {
      seedFilterFixtures();
      const res = await GET(makeRequest({ q: "marker", jira: "0", epic: "VPL-2" }));
      const data: SearchResponse = await res.json();
      expect(data.results.map((r) => r.key)).toEqual(["VPL-101"]);
    });

    it("filters by assignee", async () => {
      seedFilterFixtures();
      const res = await GET(makeRequest({ q: "marker", jira: "0", assignee: "Bob" }));
      const data: SearchResponse = await res.json();
      expect(data.results.map((r) => r.key).sort()).toEqual(["VPL-101", "VPL-103"]);
    });

    it("filters by project", async () => {
      seedFilterFixtures();
      const res = await GET(makeRequest({ q: "marker", jira: "0", project: "ABC" }));
      const data: SearchResponse = await res.json();
      expect(data.results.map((r) => r.key)).toEqual(["ABC-200"]);
    });

    it("filters by last-updated window", async () => {
      seedFilterFixtures();
      const res = await GET(makeRequest({ q: "marker", jira: "0", updatedWithin: "7d" }));
      const data: SearchResponse = await res.json();
      // within 7 days: VPL-100 (1d), VPL-102 (2d, but subtask hidden), ABC-200 (1d)
      expect(data.results.map((r) => r.key).sort()).toEqual(["ABC-200", "VPL-100"]);
    });

    it("treats updatedWithin=any as no constraint", async () => {
      seedFilterFixtures();
      const res = await GET(makeRequest({ q: "marker", jira: "0", updatedWithin: "any" }));
      const data: SearchResponse = await res.json();
      // all non-subtask matches regardless of age
      expect(data.results.map((r) => r.key).sort()).toEqual(["ABC-200", "VPL-100", "VPL-101", "VPL-103"]);
    });

    it("composes filters with the text query", async () => {
      seedFilterFixtures();
      const res = await GET(makeRequest({ q: "marker", jira: "0", sprint: "10", assignee: "Ada" }));
      const data: SearchResponse = await res.json();
      expect(data.results.map((r) => r.key)).toEqual(["VPL-100"]);
    });
  });

  describe("browse without query (BRDG-396)", () => {
    it("returns filtered results when a filter is set but there is no query", async () => {
      seedFilterFixtures();
      const res = await GET(makeRequest({ sprint: "10" }));
      const data: SearchResponse = await res.json();
      expect(data.results.map((r) => r.key).sort()).toEqual(["VPL-100", "VPL-103"]);
    });

    it("paginates browse results", async () => {
      // 30 tickets in one sprint, all recent
      const values = Array.from({ length: 30 }, (_, i) => ({
        jiraKey: `VPL-${200 + i}`,
        title: `Browse ${200 + i}`,
        status: "TO DO",
        type: "story",
        sprintName: "55",
        jiraUpdatedAt: isoDaysAgo(1),
      }));
      testDb.insert(ticket).values(values).run();

      const first: SearchResponse = await (await GET(makeRequest({ sprint: "55" }))).json();
      expect(first.results).toHaveLength(25);
      expect(first.hasMore).toBe(true);

      const second: SearchResponse = await (await GET(makeRequest({ sprint: "55", offset: "25" }))).json();
      expect(second.results).toHaveLength(5);
      expect(second.hasMore).toBe(false);
    });

    it("returns empty when there is neither a query nor a filter", async () => {
      seedFilterFixtures();
      const res = await GET(makeRequest({}));
      const data: SearchResponse = await res.json();
      expect(data.results).toEqual([]);
    });
  });

  describe("presets (BRDG-396)", () => {
    it("same-epic returns only candidates sharing the current ticket's epic", async () => {
      seedFilterFixtures();
      // VPL-101 is in epic VPL-2; nothing else shares it -> empty (it is excluded)
      const res = await GET(makeRequest({ preset: "epic", exclude: "VPL-100" }));
      const data: SearchResponse = await res.json();
      // VPL-100's epic is VPL-1: shared by VPL-103 (VPL-102 is a hidden subtask)
      expect(data.results.map((r) => r.key)).toEqual(["VPL-103"]);
    });

    it("same-sprint returns only candidates in the current ticket's sprint", async () => {
      seedFilterFixtures();
      const res = await GET(makeRequest({ preset: "sprint", exclude: "VPL-100" }));
      const data: SearchResponse = await res.json();
      // VPL-100's sprint is 10: shared by VPL-103 (VPL-102 hidden as subtask)
      expect(data.results.map((r) => r.key)).toEqual(["VPL-103"]);
    });

    it("same-epic returns empty when the current ticket has no epic", async () => {
      testDb.insert(ticket).values([
        { jiraKey: "VPL-500", title: "No epic", status: "TO DO", type: "story" },
        { jiraKey: "VPL-501", title: "Other", status: "TO DO", type: "story", epicKey: "VPL-9" },
      ]).run();
      const res = await GET(makeRequest({ preset: "epic", exclude: "VPL-500" }));
      const data: SearchResponse = await res.json();
      expect(data.results).toEqual([]);
    });
  });

  describe("payload + facets (BRDG-396)", () => {
    it("returns the extended payload fields", async () => {
      seedFilterFixtures();
      const res = await GET(makeRequest({ q: "marker", jira: "0", sprint: "20" }));
      const data: SearchResponse = await res.json();
      const row = data.results.find((r) => r.key === "VPL-101")!;
      expect(row.epicKey).toBe("VPL-2");
      expect(row.assignee).toBe("Bob");
      expect(row.project).toBe("VPL");
      expect(typeof row.jiraUpdatedAt).toBe("string");
    });

    it("returns facets covering the whole pool on the first page", async () => {
      seedFilterFixtures();
      const res = await GET(makeRequest({ q: "marker", jira: "0" }));
      const data: SearchResponse = await res.json();
      expect(data.facets).toBeDefined();
      expect(data.facets!.projects.sort()).toEqual(["ABC", "VPL"]);
      expect(data.facets!.assignees.sort()).toEqual(["Ada", "Bob", "Cleo"]);
      expect(data.facets!.types).toContain("bug");
      expect(data.facets!.types).toContain("Subtask");
    });

    it("omits facets on paginated requests", async () => {
      seedTickets(30);
      const res = await GET(makeRequest({ q: "Ticket", offset: "25", jira: "0" }));
      const data: SearchResponse = await res.json();
      expect(data.facets).toBeUndefined();
    });
  });

  describe("status filter (BRDG-396)", () => {
    it("filters by status", async () => {
      seedFilterFixtures();
      const res = await GET(makeRequest({ q: "marker", jira: "0", status: "in progress" }));
      const data: SearchResponse = await res.json();
      expect(data.results.map((r) => r.key)).toEqual(["VPL-101"]);
    });

    it("accepts multiple statuses", async () => {
      seedFilterFixtures();
      const res = await GET(makeRequest({ q: "marker", jira: "0", status: "to do,done" }));
      const data: SearchResponse = await res.json();
      // TO DO: VPL-100, ABC-200 (VPL-102 is a hidden subtask); DONE: VPL-103
      expect(data.results.map((r) => r.key).sort()).toEqual(["ABC-200", "VPL-100", "VPL-103"]);
    });

    it("returns status facets covering the pool", async () => {
      seedFilterFixtures();
      const res = await GET(makeRequest({ q: "marker", jira: "0" }));
      const data: SearchResponse = await res.json();
      expect(data.facets!.statuses).toEqual(expect.arrayContaining(["TO DO", "IN PROGRESS", "DONE"]));
    });
  });

  describe("team filter (BRDG-396)", () => {
    function seedTeamFixtures() {
      testDb.insert(sprintNameCache).values([
        { sprintId: "10", displayName: "BT: 138" },
        { sprintId: "20", displayName: "GXP: 42" },
        { sprintId: "30", displayName: "BT 139" },
      ]).run();
      testDb.insert(ticket).values([
        { jiraKey: "VPL-100", title: "team marker a", status: "TO DO", type: "story", sprintName: "10" },
        { jiraKey: "VPL-101", title: "team marker b", status: "TO DO", type: "story", sprintName: "20" },
        { jiraKey: "VPL-102", title: "team marker c", status: "TO DO", type: "story", sprintName: "30" },
        { jiraKey: "VPL-103", title: "team marker d", status: "TO DO", type: "story", sprintName: null },
      ]).run();
    }

    it("filters to a team via the sprint-name prefix (colon and space forms)", async () => {
      seedTeamFixtures();
      const res = await GET(makeRequest({ q: "marker", jira: "0", team: "BT" }));
      const data: SearchResponse = await res.json();
      // BT: 138 (VPL-100) and BT 139 (VPL-102); GXP and no-sprint excluded
      expect(data.results.map((r) => r.key).sort()).toEqual(["VPL-100", "VPL-102"]);
    });

    it("supports multiple teams", async () => {
      seedTeamFixtures();
      const res = await GET(makeRequest({ q: "marker", jira: "0", team: "BT,GXP" }));
      const data: SearchResponse = await res.json();
      expect(data.results.map((r) => r.key).sort()).toEqual(["VPL-100", "VPL-101", "VPL-102"]);
    });

    it("composes team with status", async () => {
      testDb.insert(sprintNameCache).values([{ sprintId: "10", displayName: "BT: 138" }]).run();
      testDb.insert(ticket).values([
        { jiraKey: "VPL-100", title: "team marker a", status: "TO DO", type: "story", sprintName: "10" },
        { jiraKey: "VPL-101", title: "team marker b", status: "DONE", type: "story", sprintName: "10" },
      ]).run();
      const res = await GET(makeRequest({ q: "marker", jira: "0", team: "BT", status: "done" }));
      const data: SearchResponse = await res.json();
      expect(data.results.map((r) => r.key)).toEqual(["VPL-101"]);
    });
  });

  describe("Jira fallback with filters (BRDG-396)", () => {
    it("skips Jira fallback when user filters are active", async () => {
      seedFilterFixtures();
      mockSearchIssues.mockResolvedValue([
        { key: "VPL-900", fields: { summary: "Jira", issuetype: { name: "Bug" }, status: { name: "Open" } } },
      ]);
      const res = await GET(makeRequest({ q: "marker", sprint: "20" }));
      const data: SearchResponse = await res.json();
      expect(mockSearchIssues).not.toHaveBeenCalled();
      expect(data.results.every((r) => r.source === "local")).toBe(true);
    });
  });
});
