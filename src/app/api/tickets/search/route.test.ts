// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketLink } from "@/db/schema";

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
  }));
  testDb.insert(ticket).values(values).run();
}

function seedSpecificTickets() {
  testDb.insert(ticket).values([
    { jiraKey: "VPL-100", title: "Fix login bug", status: "TO DO", type: "bug" },
    { jiraKey: "VPL-101", title: "Add dark mode", status: "IN PROGRESS", type: "story" },
    { jiraKey: "VPL-102", title: "Login page redesign", status: "DONE", type: "task" },
  ]).run();
}

function seedRecentLinks() {
  // Insert tickets first to satisfy FK constraints
  testDb.insert(ticket).values([
    { jiraKey: "VPL-100", title: "Parent 1", status: "TO DO", type: "bug" },
    { jiraKey: "VPL-101", title: "Parent 2", status: "IN PROGRESS", type: "story" },
    { jiraKey: "VPL-102", title: "Parent 3", status: "DONE", type: "task" },
  ]).run();
  testDb.insert(ticketLink).values([
    { id: "link-1", ticketKey: "VPL-100", linkedKey: "VPL-200", relation: "relates to", title: "Recent link 1", type: "story", status: "TO DO" },
    { id: "link-2", ticketKey: "VPL-101", linkedKey: "VPL-201", relation: "blocks", title: "Recent link 2", type: "bug", status: "IN PROGRESS" },
    { id: "link-3", ticketKey: "VPL-102", linkedKey: "VPL-202", relation: "relates to", title: "Recent link 3", type: "task", status: "DONE" },
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
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it("searches by title", async () => {
    seedSpecificTickets();
    const res = await GET(makeRequest({ q: "login" }));
    const data = await res.json();
    expect(data).toHaveLength(2);
    expect(data.map((r: { key: string }) => r.key).sort()).toEqual(["VPL-100", "VPL-102"]);
  });

  it("searches by key", async () => {
    seedSpecificTickets();
    const res = await GET(makeRequest({ q: "VPL-101" }));
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].key).toBe("VPL-101");
  });

  it("excludes specified key", async () => {
    seedSpecificTickets();
    const res = await GET(makeRequest({ q: "login", exclude: "VPL-100" }));
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].key).toBe("VPL-102");
  });

  it("returns empty for no matches", async () => {
    seedSpecificTickets();
    const res = await GET(makeRequest({ q: "zzzzz" }));
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it("includes source field on results", async () => {
    seedTickets(6);
    const res = await GET(makeRequest({ q: "Ticket" }));
    const data = await res.json();
    expect(data.length).toBeGreaterThanOrEqual(5);
    expect(data.every((r: { source: string }) => r.source === "local")).toBe(true);
  });

  describe("Jira fallback", () => {
    it("queries Jira when local results are sparse (< 5)", async () => {
      seedTickets(3);
      mockSearchIssues.mockResolvedValue([
        { key: "VPL-900", fields: { summary: "Jira result 1", issuetype: { name: "Bug" }, status: { name: "Open" } } },
        { key: "VPL-901", fields: { summary: "Jira result 2", issuetype: { name: "Story" }, status: { name: "Done" } } },
      ]);

      const res = await GET(makeRequest({ q: "Ticket" }));
      const data = await res.json();

      expect(data).toHaveLength(5);
      expect(mockSearchIssues).toHaveBeenCalledTimes(1);
      const localResults = data.filter((r: { source: string }) => r.source === "local");
      const jiraResults = data.filter((r: { source: string }) => r.source === "jira");
      expect(localResults).toHaveLength(3);
      expect(jiraResults).toHaveLength(2);
    });

    it("does NOT query Jira when local results >= 5", async () => {
      seedTickets(6);
      const res = await GET(makeRequest({ q: "Ticket" }));
      const data = await res.json();

      expect(data.length).toBe(6);
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
      const data = await res.json();

      // VPL-100 should appear once (local version wins), VPL-950 added from Jira
      const keys = data.map((r: { key: string }) => r.key);
      expect(keys.filter((k: string) => k === "VPL-100")).toHaveLength(1);
      expect(keys).toContain("VPL-950");
      // The VPL-100 should be marked as local
      const vpl100 = data.find((r: { key: string }) => r.key === "VPL-100");
      expect(vpl100.source).toBe("local");
    });

    it("falls back to exact key match via getIssue", async () => {
      mockGetIssue.mockResolvedValue({
        key: "VPL-999",
        fields: { summary: "Found via key", issuetype: { name: "Task" }, status: { name: "In Progress" } },
      });

      const res = await GET(makeRequest({ q: "VPL-999" }));
      const data = await res.json();

      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({ key: "VPL-999", source: "jira" });
      expect(mockGetIssue).toHaveBeenCalledWith("VPL-999");
    });

    it("skips Jira when jira=0 param is set", async () => {
      seedTickets(2);
      const res = await GET(makeRequest({ q: "Ticket", jira: "0" }));
      const data = await res.json();

      expect(data).toHaveLength(2);
      expect(mockSearchIssues).not.toHaveBeenCalled();
      expect(mockGetIssue).not.toHaveBeenCalled();
    });

    it("handles Jira failure gracefully", async () => {
      seedTickets(3);
      mockSearchIssues.mockRejectedValue(new Error("Jira is down"));

      const res = await GET(makeRequest({ q: "Ticket" }));
      const data = await res.json();

      expect(data).toHaveLength(3);
      expect(data.every((r: { source: string }) => r.source === "local")).toBe(true);
    });
  });

  describe("recent links", () => {
    it("returns recent links when recent=1", async () => {
      seedRecentLinks();
      const res = await GET(makeRequest({ recent: "1" }));
      const data = await res.json();

      expect(data).toHaveLength(3);
      expect(data[0].source).toBe("recent");
      expect(data.map((r: { key: string }) => r.key)).toEqual(["VPL-202", "VPL-201", "VPL-200"]);
    });

    it("excludes specified key from recent links", async () => {
      seedRecentLinks();
      const res = await GET(makeRequest({ recent: "1", exclude: "VPL-201" }));
      const data = await res.json();

      expect(data.every((r: { key: string }) => r.key !== "VPL-201")).toBe(true);
    });

    it("returns empty when no recent links exist", async () => {
      const res = await GET(makeRequest({ recent: "1" }));
      const data = await res.json();
      expect(data).toEqual([]);
    });
  });
});
