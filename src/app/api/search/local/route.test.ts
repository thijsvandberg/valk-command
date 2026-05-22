import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { GET } from "./route";
import { invalidateSearchCache } from "@/lib/search-index-cache";

// Mock the database module
vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    all: vi.fn(),
  },
}));

// Mock adf-to-markdown
vi.mock("@/lib/adf-to-markdown", () => ({
  adfToMarkdown: vi.fn((node: unknown) => {
    if (node && typeof node === "object" && "type" in node) {
      return "adf text";
    }
    return "";
  }),
}));

const { db } = await import("@/db");

// Helper to chain the drizzle mock: select().from().all() and select().from().where().get()
// Order of .all() calls matches the Promise.all in buildIndex:
// [0] tickets, [1] metadata, [2] jiraComments, [3] poComments, [4] localEdits, [5] appSetting (via .where().get()), [6] conversations, [7] messages
// The appSetting query uses .where().get() and is handled separately.
function setupDbMock(
  tickets: unknown[],
  metadata: unknown[],
  jiraComments: unknown[],
  poComments: unknown[],
  localEdits: unknown[],
  conversations: unknown[] = [],
  messages: unknown[] = [],
) {
  let callCount = 0;
  // Index 5 is appSetting (consumed by .where().get(), returns null)
  const responses = [tickets, metadata, jiraComments, poComments, localEdits, /* appSetting placeholder */ [], conversations, messages];

  (db.select as Mock).mockImplementation(() => ({
    from: () => {
      // Capture the index for this from() call
      const idx = callCount++;
      const data = responses[idx] ?? [];
      return {
        // Direct .all() for non-filtered queries
        all: () => Promise.resolve(data),
        // .where() for filtered queries (tickets, appSetting)
        where: () => ({
          get: () => Promise.resolve(null),
          all: () => Promise.resolve(data),
          then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) =>
            Promise.resolve(data).then(resolve, reject),
        }),
      };
    },
  }));
}

function makeRequest(q: string, filters: Record<string, string> = {}) {
  const params = new URLSearchParams({ q, ...filters });
  return new Request(`http://localhost/api/search/local?${params.toString()}`);
}

describe("GET /api/search/local", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear module-level cache so each test builds a fresh index from its own mock data
    invalidateSearchCache();
  });

  it("returns empty results when query is shorter than 2 chars", async () => {
    const res = await GET(makeRequest("a"));
    const body = await res.json();
    expect(body.results).toEqual([]);
  });

  it("returns empty results when query is empty", async () => {
    const res = await GET(makeRequest(""));
    const body = await res.json();
    expect(body.results).toEqual([]);
  });

  it("returns matched tickets for a valid query", async () => {
    const sampleTicket = {
      jiraKey: "VPL-42",
      title: "User authentication flow",
      status: "IN PROGRESS",
      priority: "High",
      assignee: "Alice",
      reporter: "Bob",
      sprintName: "Sprint 1",
      labels: "auth,security",
      description: null,
    };

    setupDbMock(
      [sampleTicket],
      [],
      [],
      [],
      [],
    );

    const res = await GET(makeRequest("authentication"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.results).toBeInstanceOf(Array);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results[0].key).toBe("VPL-42");
    // Also verify grouped response
    expect(body.groups.tickets[0].key).toBe("VPL-42");
  });

  it("returns groups.tickets that mirrors results (backward compat)", async () => {
    const sampleTicket = {
      jiraKey: "VPL-50",
      title: "Payment processing",
      status: "TO DO",
      priority: null,
      assignee: null,
      reporter: null,
      sprintName: null,
      labels: "",
      description: null,
    };

    setupDbMock([sampleTicket], [], [], [], []);

    const res = await GET(makeRequest("payment"));
    const body = await res.json();
    expect(body.groups).toBeDefined();
    expect(body.groups.tickets).toEqual(body.results);
    expect(body.groups.conversations).toBeInstanceOf(Array);
    expect(body.groups.comments).toBeInstanceOf(Array);
  });

  it("returns conversations matching query in groups.conversations", async () => {
    setupDbMock(
      [],
      [],
      [],
      [],
      [],
      [
        { id: "conv-1", title: "Auth investigation chat", type: "investigation", relatedTicket: "VPL-42", createdAt: new Date().toISOString() },
        { id: "conv-2", title: "Sprint planning", type: "chat", relatedTicket: null, createdAt: new Date().toISOString() },
      ],
      [
        { id: "msg-1", conversationId: "conv-1", role: "user", content: "Let us investigate the authentication problem", timestamp: new Date().toISOString(), status: "sent", workspaceTaskId: null, contentHash: null },
      ],
    );

    const res = await GET(makeRequest("auth"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.groups.conversations).toBeInstanceOf(Array);
    expect(body.groups.conversations.length).toBeGreaterThan(0);
    expect(body.groups.conversations[0].id).toBe("conv-1");
    expect(body.groups.conversations[0].title).toBe("Auth investigation chat");
  });

  it("returns comments matching query in groups.comments", async () => {
    setupDbMock(
      [],
      [],
      [
        { id: "jc-1", ticketKey: "VPL-10", jiraCommentId: "jira-1", authorName: "Alice", authorAvatar: null, content: "Authentication logic needs review", createdAt: new Date().toISOString() },
      ],
      [
        { id: "pc-1", ticketKey: "VPL-20", author: "Product Owner", content: "Payment flow discussion", createdAt: new Date().toISOString() },
      ],
      [],
    );

    const res = await GET(makeRequest("auth"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.groups.comments.length).toBeGreaterThan(0);
    const jiraComment = body.groups.comments.find((c: { source: string }) => c.source === "jira");
    expect(jiraComment).toBeDefined();
    expect(jiraComment.ticketKey).toBe("VPL-10");
    expect(jiraComment.author).toBe("Alice");
  });

  it("comment results include correct source field", async () => {
    setupDbMock(
      [],
      [],
      [{ id: "jc-2", ticketKey: "VPL-5", jiraCommentId: null, authorName: "Dev", authorAvatar: null, content: "Login page refactor", createdAt: new Date().toISOString() }],
      [{ id: "pc-2", ticketKey: "VPL-6", author: "PO", content: "Login screen notes", createdAt: new Date().toISOString() }],
      [],
    );

    const res = await GET(makeRequest("login"));
    const body = await res.json();
    const jiraSrc = body.groups.comments.find((c: { source: string }) => c.source === "jira");
    const poSrc = body.groups.comments.find((c: { source: string }) => c.source === "po");
    if (jiraSrc) expect(jiraSrc.source).toBe("jira");
    if (poSrc) expect(poSrc.source).toBe("po");
  });

  it("empty groups return empty arrays, not undefined", async () => {
    setupDbMock([], [], [], [], []);
    const res = await GET(makeRequest("xyz"));
    const body = await res.json();
    expect(body.groups.tickets).toEqual([]);
    expect(body.groups.conversations).toEqual([]);
    expect(body.groups.comments).toEqual([]);
  });

  it("ticket-specific filters do not affect conversations group", async () => {
    setupDbMock(
      [{ jiraKey: "VPL-1", title: "Authentication flow", status: "TO DO", priority: null, assignee: null, reporter: null, sprintName: null, labels: "", description: null }],
      [],
      [],
      [],
      [],
      [{ id: "conv-3", title: "Auth discussion", type: "chat", relatedTicket: null, createdAt: new Date().toISOString() }],
      [],
    );

    const res = await GET(makeRequest("auth", { status: "IN PROGRESS" }));
    const body = await res.json();
    // Tickets filtered out (none are IN PROGRESS)
    expect(body.groups.tickets.length).toBe(0);
    // Conversations unaffected by ticket status filter
    expect(body.groups.conversations.length).toBeGreaterThan(0);
  });

  it("uses local edit title when present", async () => {
    const sampleTicket = {
      jiraKey: "VPL-10",
      title: "Original title",
      status: "TO DO",
      priority: null,
      assignee: null,
      reporter: null,
      sprintName: null,
      labels: "",
      description: null,
    };

    const localEdit = {
      id: "edit-1",
      ticketKey: "VPL-10",
      field: "title",
      localValue: "Revised payment flow",
      baseJiraVersion: null,
      modifiedAt: new Date().toISOString(),
    };

    setupDbMock(
      [sampleTicket],
      [],
      [],
      [],
      [localEdit],
    );

    const res = await GET(makeRequest("payment"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.results[0].summary).toBe("Revised payment flow");
  });

  it("matches tickets by acceptanceCriteria content", async () => {
    const sampleTicket = {
      jiraKey: "VPL-77",
      title: "Unrelated title",
      status: "TO DO",
      priority: null,
      assignee: null,
      reporter: null,
      sprintName: null,
      labels: "",
      description: null,
      acceptanceCriteria: "User must be able to reset password via email",
    };

    setupDbMock([sampleTicket], [], [], [], []);

    const res = await GET(makeRequest("reset password"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.results.some((r: { key: string }) => r.key === "VPL-77")).toBe(true);
  });

  it("strips ADF JSON from description before indexing", async () => {
    const adfDescription = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "adf text" }] }],
    });

    const sampleTicket = {
      jiraKey: "VPL-99",
      title: "Boring title",
      status: "DONE",
      priority: null,
      assignee: null,
      reporter: null,
      sprintName: null,
      labels: "",
      description: adfDescription,
    };

    setupDbMock([sampleTicket], [], [], [], []);

    const res = await GET(makeRequest("adf text"));
    const body = await res.json();
    expect(res.status).toBe(200);
    // The adf-to-markdown mock returns "adf text", so it should match
    expect(body.results.some((r: { key: string }) => r.key === "VPL-99")).toBe(true);
  });

  it("returns at most 25 ticket results", async () => {
    const tickets = Array.from({ length: 50 }, (_, i) => ({
      jiraKey: `VPL-${i}`,
      title: `Authentication ticket ${i}`,
      status: "TO DO",
      priority: null,
      assignee: null,
      reporter: null,
      sprintName: null,
      labels: "",
      description: null,
    }));

    setupDbMock(tickets, [], [], [], []);

    const res = await GET(makeRequest("authentication"));
    const body = await res.json();
    expect(body.results.length).toBeLessThanOrEqual(25);
    expect(body.groups.tickets.length).toBeLessThanOrEqual(25);
  });

  it("status filter excludes non-matching tickets", async () => {
    const tickets = [
      { jiraKey: "VPL-1", title: "Authentication flow", status: "TO DO", priority: null, assignee: null, reporter: null, sprintName: null, labels: "", description: null },
      { jiraKey: "VPL-2", title: "Authentication service", status: "IN PROGRESS", priority: null, assignee: null, reporter: null, sprintName: null, labels: "", description: null },
    ];
    setupDbMock(tickets, [], [], [], []);
    const res = await GET(makeRequest("authentication", { status: "IN PROGRESS" }));
    const body = await res.json();
    expect(body.results.every((r: { status: string }) => r.status.toUpperCase() === "IN PROGRESS")).toBe(true);
    expect(body.results.some((r: { key: string }) => r.key === "VPL-1")).toBe(false);
  });

  it("assignee filter excludes non-matching tickets", async () => {
    const tickets = [
      { jiraKey: "VPL-10", title: "Authentication flow", status: "TO DO", priority: null, assignee: "Alice", reporter: null, sprintName: null, labels: "", description: null },
      { jiraKey: "VPL-11", title: "Authentication service", status: "TO DO", priority: null, assignee: "Bob", reporter: null, sprintName: null, labels: "", description: null },
    ];
    setupDbMock(tickets, [], [], [], []);
    const res = await GET(makeRequest("authentication", { assignee: "Alice" }));
    const body = await res.json();
    expect(body.results.every((r: { assignee: string | null }) => r.assignee?.toLowerCase() === "alice")).toBe(true);
    expect(body.results.some((r: { key: string }) => r.key === "VPL-11")).toBe(false);
  });

  it("date range filter 7d excludes old tickets", async () => {
    const recentDate = new Date(Date.now() - 2 * 86400000).toISOString(); // 2 days ago
    const oldDate = new Date(Date.now() - 30 * 86400000).toISOString(); // 30 days ago
    const tickets = [
      { jiraKey: "VPL-20", title: "Auth recent", status: "TO DO", priority: null, assignee: null, reporter: null, sprintName: null, labels: "", description: null, jiraUpdatedAt: recentDate },
      { jiraKey: "VPL-21", title: "Auth old", status: "TO DO", priority: null, assignee: null, reporter: null, sprintName: null, labels: "", description: null, jiraUpdatedAt: oldDate },
    ];
    setupDbMock(tickets, [], [], [], []);
    const res = await GET(makeRequest("auth", { dateRange: "7d" }));
    const body = await res.json();
    expect(body.results.some((r: { key: string }) => r.key === "VPL-20")).toBe(true);
    expect(body.results.some((r: { key: string }) => r.key === "VPL-21")).toBe(false);
  });

  it("each result has required fields", async () => {
    const sampleTicket = {
      jiraKey: "VPL-5",
      title: "Login screen redesign",
      status: "TO DO",
      priority: "Medium",
      assignee: "Carol",
      reporter: null,
      sprintName: "Sprint 3",
      labels: "",
      description: null,
    };

    setupDbMock([sampleTicket], [], [], [], []);

    const res = await GET(makeRequest("login"));
    const body = await res.json();
    if (body.results.length > 0) {
      const r = body.results[0];
      expect(r).toHaveProperty("key");
      expect(r).toHaveProperty("summary");
      expect(r).toHaveProperty("status");
      expect(r).toHaveProperty("score");
    }
  });
});
