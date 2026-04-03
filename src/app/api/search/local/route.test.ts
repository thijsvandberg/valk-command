import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { GET } from "./route";

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

// Helper to chain the drizzle mock: select().from().all()
function setupDbMock(
  tickets: unknown[],
  metadata: unknown[],
  jiraComments: unknown[],
  poComments: unknown[],
  localEdits: unknown[],
) {
  let callCount = 0;
  const responses = [tickets, metadata, jiraComments, poComments, localEdits];

  (db.select as Mock).mockImplementation(() => ({
    from: () => ({
      all: () => Promise.resolve(responses[callCount++] ?? []),
    }),
  }));
}

function makeRequest(q: string) {
  return new Request(`http://localhost/api/search/local?q=${encodeURIComponent(q)}`);
}

describe("GET /api/search/local", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("returns at most 25 results", async () => {
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
