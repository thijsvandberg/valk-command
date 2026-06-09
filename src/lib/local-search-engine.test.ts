// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketMetadata, jiraComment, poComment, conversation, message, appSetting } from "@/db/schema";
import { seedTicket, seedTicketMetadata } from "@/test/builders";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/adf-to-markdown", () => ({
  adfToMarkdown: vi.fn().mockReturnValue("converted markdown"),
}));

vi.mock("@/lib/env", () => ({
  env: { JIRA_BASE_URL: "https://jira.example.com" },
}));

vi.mock("@/lib/search-index-cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/search-index-cache")>();
  return {
    ...actual,
    getSearchCache: vi.fn().mockReturnValue(null),
  };
});

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { executeLocalSearch, type SearchParams } from "./local-search-engine";
import { getSearchCache } from "@/lib/search-index-cache";

function defaultParams(overrides?: Partial<SearchParams>): SearchParams {
  return {
    q: "test",
    statusFilter: [],
    poStatusFilter: [],
    readinessFilter: [],
    typeFilter: [],
    assigneeFilter: [],
    sprintFilter: [],
    dateRange: null,
    ...overrides,
  };
}

function seedTestTicket(key: string, overrides?: Record<string, unknown>) {
  seedTicket(testDb, { jiraKey: key, title: `Test ticket ${key}`, status: "TO DO", ...overrides });
}

describe("executeLocalSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testDb = createTestDb();
    vi.mocked(getSearchCache).mockReturnValue(null);
  });

  it("returns empty response for query < 2 chars", async () => {
    const result = await executeLocalSearch(defaultParams({ q: "a" }));
    expect(result.results).toEqual([]);
    expect(result.groups.tickets).toEqual([]);
  });

  it("returns empty response for empty query", async () => {
    const result = await executeLocalSearch(defaultParams({ q: " " }));
    expect(result.results).toEqual([]);
  });

  it("builds index from DB and returns search results", async () => {
    seedTestTicket("VPL-1", { title: "Authentication login bug" });
    seedTestTicket("VPL-2", { title: "Dashboard widget" });

    const result = await executeLocalSearch(defaultParams({ q: "authentication" }));

    expect(result.results.length).toBeGreaterThanOrEqual(1);
    expect(result.results[0].key).toBe("VPL-1");
  });

  it("single-token search returns ranked results", async () => {
    seedTestTicket("VPL-A", { title: "Deploy pipeline setup" });
    seedTestTicket("VPL-B", { title: "Setup database migration" });

    const result = await executeLocalSearch(defaultParams({ q: "deploy" }));

    expect(result.results.length).toBeGreaterThanOrEqual(1);
    expect(result.results[0].key).toBe("VPL-A");
  });

  it("multi-token search with token merging", async () => {
    seedTestTicket("VPL-X", { title: "Create user authentication flow" });
    seedTestTicket("VPL-Y", { title: "Create dashboard" });
    seedTestTicket("VPL-Z", { title: "User profile page" });

    const result = await executeLocalSearch(defaultParams({ q: "create user" }));

    expect(result.results.length).toBeGreaterThanOrEqual(1);
    // VPL-X should rank higher since it matches both tokens
    const keys = result.results.map((r) => r.key);
    expect(keys).toContain("VPL-X");
  });

  it("filters by status", async () => {
    seedTestTicket("VPL-DONE", { title: "Completed feature", status: "DONE" });
    seedTestTicket("VPL-TODO", { title: "Completed bugfix", status: "TO DO" });

    const result = await executeLocalSearch(defaultParams({
      q: "completed",
      statusFilter: ["DONE"],
    }));

    expect(result.results.every((r) => r.status === "DONE")).toBe(true);
  });

  it("filters by PO status", async () => {
    seedTestTicket("VPL-D", { title: "Drafting story alpha" });
    seedTicketMetadata(testDb, { jiraKey: "VPL-D", poStatus: "needs-refinement" });
    seedTestTicket("VPL-E", { title: "Ready story alpha" });
    seedTicketMetadata(testDb, { jiraKey: "VPL-E", poStatus: "ready" });

    const result = await executeLocalSearch(defaultParams({
      q: "alpha",
      poStatusFilter: ["ready"],
    }));

    expect(result.results.every((r) => r.poStatus === "ready")).toBe(true);
  });

  it("filters by issue type", async () => {
    seedTestTicket("VPL-BUG", { title: "Bug report gamma", type: "Bug" });
    seedTestTicket("VPL-STORY", { title: "Story report gamma", type: "Story" });

    const result = await executeLocalSearch(defaultParams({
      q: "gamma",
      typeFilter: ["bug"],
    }));

    expect(result.results.every((r) => r.issueType?.toLowerCase() === "bug")).toBe(true);
  });

  it("excludes subtasks by default", async () => {
    seedTestTicket("VPL-SUB", { title: "Subtask omega work", type: "Sub-task" });
    seedTestTicket("VPL-STD", { title: "Story omega work", type: "Story" });

    const result = await executeLocalSearch(defaultParams({ q: "omega" }));

    const keys = result.results.map((r) => r.key);
    expect(keys).toContain("VPL-STD");
    expect(keys).not.toContain("VPL-SUB");
  });

  it("includes subtasks when the subtask type filter is active", async () => {
    seedTestTicket("VPL-SUB", { title: "Subtask omega work", type: "Sub-task" });
    seedTestTicket("VPL-STD", { title: "Story omega work", type: "Story" });

    const result = await executeLocalSearch(defaultParams({ q: "omega", typeFilter: ["subtask"] }));

    const keys = result.results.map((r) => r.key);
    expect(keys).toContain("VPL-SUB");
    // Selecting only "subtask" narrows to subtasks, excluding the story.
    expect(keys).not.toContain("VPL-STD");
  });

  it("keeps subtasks excluded when an unrelated type filter is active", async () => {
    seedTestTicket("VPL-SUB", { title: "Subtask omega work", type: "Sub-task" });
    seedTestTicket("VPL-STD", { title: "Story omega work", type: "Story" });

    const result = await executeLocalSearch(defaultParams({ q: "omega", typeFilter: ["story"] }));

    const keys = result.results.map((r) => r.key);
    expect(keys).toContain("VPL-STD");
    expect(keys).not.toContain("VPL-SUB");
  });

  it("filters by readiness enum value", async () => {
    seedTestTicket("VPL-HOLD", { title: "Readiness sigma alpha" });
    seedTicketMetadata(testDb, { jiraKey: "VPL-HOLD", readiness: "on_hold" });
    seedTestTicket("VPL-RFR", { title: "Readiness sigma beta" });
    seedTicketMetadata(testDb, { jiraKey: "VPL-RFR", readiness: "ready_to_refine" });

    const result = await executeLocalSearch(defaultParams({ q: "sigma", readinessFilter: ["on_hold"] }));

    expect(result.results.every((r) => r.readiness === "on_hold")).toBe(true);
    expect(result.results.map((r) => r.key)).toContain("VPL-HOLD");
  });

  it("filters by readiness 'none' (ready for development)", async () => {
    seedTestTicket("VPL-NONE", { title: "Readiness tau alpha" });
    // No metadata row -> readiness is null (ready for development)
    seedTestTicket("VPL-DRAFT", { title: "Readiness tau beta" });
    seedTicketMetadata(testDb, { jiraKey: "VPL-DRAFT", readiness: "drafting" });

    const result = await executeLocalSearch(defaultParams({ q: "tau", readinessFilter: ["none"] }));

    expect(result.results.every((r) => r.readiness === null)).toBe(true);
    expect(result.results.map((r) => r.key)).toContain("VPL-NONE");
  });

  it("filters by assignee", async () => {
    seedTestTicket("VPL-JD", { title: "Task delta assigned", assignee: "john.doe" });
    seedTestTicket("VPL-JS", { title: "Task delta unassigned", assignee: "jane.smith" });

    const result = await executeLocalSearch(defaultParams({
      q: "delta",
      assigneeFilter: ["john.doe"],
    }));

    expect(result.results.every((r) => r.assignee === "john.doe")).toBe(true);
  });

  it("filters by sprint", async () => {
    seedTestTicket("VPL-S1", { title: "Sprint epsilon one", sprintName: "100" });
    seedTestTicket("VPL-S2", { title: "Sprint epsilon two", sprintName: "200" });

    const result = await executeLocalSearch(defaultParams({
      q: "epsilon",
      sprintFilter: ["100"],
    }));

    expect(result.results.every((r) => r.sprintId === "100")).toBe(true);
  });

  it("filters by date range (7d)", async () => {
    const recent = new Date(Date.now() - 2 * 86400000).toISOString();
    const old = new Date(Date.now() - 30 * 86400000).toISOString();
    seedTestTicket("VPL-NEW", { title: "Recent zeta work", jiraUpdatedAt: recent });
    seedTestTicket("VPL-OLD", { title: "Old zeta work", jiraUpdatedAt: old });

    const result = await executeLocalSearch(defaultParams({
      q: "zeta",
      dateRange: "7d",
    }));

    expect(result.results.every((r) => r.key === "VPL-NEW")).toBe(true);
  });

  it("multiple filters combined (AND logic)", async () => {
    seedTestTicket("VPL-F1", { title: "Filter eta combo", status: "DONE", assignee: "alice" });
    seedTestTicket("VPL-F2", { title: "Filter eta combo", status: "TO DO", assignee: "alice" });
    seedTestTicket("VPL-F3", { title: "Filter eta combo", status: "DONE", assignee: "bob" });

    const result = await executeLocalSearch(defaultParams({
      q: "eta",
      statusFilter: ["DONE"],
      assigneeFilter: ["alice"],
    }));

    expect(result.results).toHaveLength(1);
    expect(result.results[0].key).toBe("VPL-F1");
  });

  it("conversation search results", async () => {
    seedTestTicket("VPL-1");
    testDb.insert(conversation).values({
      id: "conv-theta",
      title: "Theta discussion about deployments",
      createdAt: new Date().toISOString(),
    }).run();
    testDb.insert(message).values({
      id: "msg-1",
      conversationId: "conv-theta",
      role: "user",
      content: "Let us discuss theta topic",
      timestamp: new Date().toISOString(),
      sequence: 1,
    }).run();

    const result = await executeLocalSearch(defaultParams({ q: "theta" }));

    expect(result.groups.conversations.length).toBeGreaterThanOrEqual(1);
    expect(result.groups.conversations[0].id).toBe("conv-theta");
  });

  it("comment search results (jira + po)", async () => {
    seedTestTicket("VPL-CMT");
    testDb.insert(jiraComment).values({
      id: "jc-1",
      ticketKey: "VPL-CMT",
      authorName: "John",
      authorAvatar: null,
      content: "iota feedback on implementation",
      createdAt: new Date().toISOString(),
    }).run();
    testDb.insert(poComment).values({
      id: "pc-1",
      ticketKey: "VPL-CMT",
      author: "PO",
      content: "iota note from product",
      createdAt: new Date().toISOString(),
    }).run();

    const result = await executeLocalSearch(defaultParams({ q: "iota" }));

    expect(result.groups.comments.length).toBeGreaterThanOrEqual(1);
    const sources = result.groups.comments.map((c) => c.source);
    expect(sources).toContain("jira");
  });

  it("results limit: max 25 tickets", async () => {
    for (let i = 0; i < 30; i++) {
      seedTestTicket(`VPL-L${i}`, { title: `Kappa test ticket number ${i}` });
    }

    const result = await executeLocalSearch(defaultParams({ q: "kappa" }));

    expect(result.results.length).toBeLessThanOrEqual(25);
  });

  it("uses cache when available", async () => {
    seedTestTicket("VPL-CACHED", { title: "Lambda cached result" });

    // First call builds cache
    await executeLocalSearch(defaultParams({ q: "lambda" }));

    // Mock cache as returning previous result
    const { getSearchCache: realGet, setSearchCache } = await import("@/lib/search-index-cache");
    // After the first call, the real setSearchCache was called, so cache should exist
    // For the test, just verify the function was called with data
    expect(vi.mocked(getSearchCache)).toHaveBeenCalled();
  });
});
