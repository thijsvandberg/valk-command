import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketLink, relatedSuggestionCache } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() { return testDb; },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_APP_URL: "http://localhost:3100", VALK_AGENT_URL: "http://localhost:3001", VALK_AGENT_KEY: "test-key" },
}));

vi.mock("@/lib/agent-proxy", () => ({
  agentUrl: (path: string) => `http://localhost:3001${path}`,
  agentHeaders: () => ({ Authorization: "Bearer test-key", "Content-Type": "application/json" }),
}));

const mockAgentFetch = vi.fn();
vi.mock("@/lib/agent-fetch", () => ({
  agentFetch: (...args: unknown[]) => mockAgentFetch(...args),
}));

// Mock global fetch for SSE stream reading and background sync
const mockFetch = vi.fn();
const originalFetch = globalThis.fetch;

import { GET, POST, DELETE } from "./route";

function makeParams(key: string) {
  return { params: Promise.resolve({ key }) };
}

function postRequest(key: string): Request {
  return new Request(`http://localhost:3100/api/tickets/${key}/related-suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

function getRequest(key: string): Request {
  return new Request(`http://localhost:3100/api/tickets/${key}/related-suggestions`);
}

function deleteRequest(key: string): Request {
  return new Request(`http://localhost:3100/api/tickets/${key}/related-suggestions`, {
    method: "DELETE",
  });
}

function seedTicket(key: string, title?: string) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title: title ?? `Ticket ${key}`,
    status: "TO DO",
  }).run();
}

function seedLink(ticketKey: string, linkedKey: string) {
  testDb.insert(ticketLink).values({
    id: `link-${ticketKey}-${linkedKey}`,
    ticketKey,
    linkedKey,
    relation: "relates to",
    title: `Linked ${linkedKey}`,
    type: "task",
    status: "TO DO",
  }).run();
}

function seedCache(ticketKey: string, suggestedKey: string, score: number) {
  testDb.insert(relatedSuggestionCache).values({
    id: `cache-${ticketKey}-${suggestedKey}`,
    ticketKey,
    suggestedKey,
    score,
    title: `Cached ${suggestedKey}`,
    status: "TO DO",
    suggestedRelation: "relates to",
    createdAt: new Date().toISOString(),
  }).run();
}

function createSSEStream(output: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const ssePayload = `event:result\ndata:${JSON.stringify({ output })}\n\n`;
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(ssePayload));
      controller.close();
    },
  });
}

describe("GET /api/tickets/[key]/related-suggestions", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("returns empty when no cache exists", async () => {
    const res = await GET(getRequest("VPL-100"), makeParams("VPL-100"));
    const data = await res.json();
    expect(data.suggestions).toEqual([]);
    expect(data.cachedAt).toBeNull();
  });

  it("returns cached suggestions", async () => {
    seedTicket("VPL-100");
    seedCache("VPL-100", "VPL-200", 0.85);
    seedCache("VPL-100", "VPL-300", 0.6);

    const res = await GET(getRequest("VPL-100"), makeParams("VPL-100"));
    const data = await res.json();
    expect(data.suggestions).toHaveLength(2);
    expect(data.cachedAt).toBeTruthy();
  });
});

describe("POST /api/tickets/[key]/related-suggestions", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns 404 for non-existent ticket", async () => {
    const res = await POST(postRequest("VPL-999"), makeParams("VPL-999"));
    expect(res.status).toBe(404);
  });

  it("returns cached results if fresh", async () => {
    seedTicket("VPL-100");
    seedCache("VPL-100", "VPL-200", 0.85);

    const res = await POST(postRequest("VPL-100"), makeParams("VPL-100"));
    const data = await res.json();
    expect(data.cached).toBe(true);
    expect(data.suggestions).toHaveLength(1);
    expect(mockAgentFetch).not.toHaveBeenCalled();
  });

  it("calls workspace and parses results", async () => {
    seedTicket("VPL-100");

    const workspaceOutput = `<related-stories>[
      {"key":"VPL-200","score":0.9,"title":"Related story","status":"TO DO","reason":"Shared auth module"},
      {"key":"VPL-300","score":0.7,"title":"Another story","status":"IN PROGRESS","type":"bug","reason":"Same component"}
    ]</related-stories>`;

    mockAgentFetch.mockResolvedValueOnce({
      ok: true,
      data: { id: "task-1" },
      status: 200,
      retryCount: 0,
    });

    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/tasks/task-1/stream")) {
        return Promise.resolve({
          ok: true,
          body: createSSEStream(workspaceOutput),
        });
      }
      // Background sync call
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const res = await POST(postRequest("VPL-100"), makeParams("VPL-100"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.cached).toBe(false);
    expect(data.suggestions).toHaveLength(2);
    expect(data.suggestions[0].suggestedKey).toBe("VPL-200");
    expect(data.suggestions[0].score).toBe(0.9);
    expect(data.suggestions[0].reason).toBe("Shared auth module");
    expect(data.suggestions[1].suggestedKey).toBe("VPL-300");

    // Verify results are cached
    const cached = testDb.select().from(relatedSuggestionCache)
      .where(eq(relatedSuggestionCache.ticketKey, "VPL-100")).all();
    expect(cached).toHaveLength(2);
  });

  it("deduplicates against existing links", async () => {
    seedTicket("VPL-100");
    seedLink("VPL-100", "VPL-200");

    const workspaceOutput = `<related-stories>[
      {"key":"VPL-200","score":0.9,"title":"Already linked","status":"TO DO"},
      {"key":"VPL-300","score":0.7,"title":"New suggestion","status":"IN PROGRESS"}
    ]</related-stories>`;

    mockAgentFetch.mockResolvedValueOnce({
      ok: true,
      data: { id: "task-2" },
      status: 200,
      retryCount: 0,
    });

    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/tasks/task-2/stream")) {
        return Promise.resolve({
          ok: true,
          body: createSSEStream(workspaceOutput),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const res = await POST(postRequest("VPL-100"), makeParams("VPL-100"));
    const data = await res.json();
    expect(data.suggestions).toHaveLength(1);
    expect(data.suggestions[0].suggestedKey).toBe("VPL-300");
  });

  it("excludes the ticket itself from results", async () => {
    seedTicket("VPL-100");

    const workspaceOutput = `<related-stories>[
      {"key":"VPL-100","score":1.0,"title":"Self-reference","status":"TO DO"},
      {"key":"VPL-200","score":0.8,"title":"Actual match","status":"TO DO"}
    ]</related-stories>`;

    mockAgentFetch.mockResolvedValueOnce({
      ok: true,
      data: { id: "task-3" },
      status: 200,
      retryCount: 0,
    });

    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/tasks/task-3/stream")) {
        return Promise.resolve({
          ok: true,
          body: createSSEStream(workspaceOutput),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const res = await POST(postRequest("VPL-100"), makeParams("VPL-100"));
    const data = await res.json();
    expect(data.suggestions).toHaveLength(1);
    expect(data.suggestions[0].suggestedKey).toBe("VPL-200");
  });

  it("caps results at 10", async () => {
    seedTicket("VPL-100");

    const items = Array.from({ length: 15 }, (_, i) => ({
      key: `VPL-${200 + i}`,
      score: 0.9 - i * 0.05,
      title: `Story ${i}`,
      status: "TO DO",
    }));
    const workspaceOutput = `<related-stories>${JSON.stringify(items)}</related-stories>`;

    mockAgentFetch.mockResolvedValueOnce({
      ok: true,
      data: { id: "task-4" },
      status: 200,
      retryCount: 0,
    });

    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/tasks/task-4/stream")) {
        return Promise.resolve({
          ok: true,
          body: createSSEStream(workspaceOutput),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const res = await POST(postRequest("VPL-100"), makeParams("VPL-100"));
    const data = await res.json();
    expect(data.suggestions).toHaveLength(10);
  });

  it("returns 502 when workspace task submission fails", async () => {
    seedTicket("VPL-100");

    mockAgentFetch.mockResolvedValueOnce({
      ok: false,
      error: { error: "Connection refused", code: "UNREACHABLE" },
      status: 502,
      retryCount: 2,
    });

    const res = await POST(postRequest("VPL-100"), makeParams("VPL-100"));
    expect(res.status).toBe(502);
  });
});

describe("DELETE /api/tickets/[key]/related-suggestions", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("clears cached suggestions", async () => {
    seedTicket("VPL-100");
    seedCache("VPL-100", "VPL-200", 0.85);

    const res = await DELETE(deleteRequest("VPL-100"), makeParams("VPL-100"));
    expect(res.status).toBe(204);

    const rows = testDb.select().from(relatedSuggestionCache)
      .where(eq(relatedSuggestionCache.ticketKey, "VPL-100")).all();
    expect(rows).toHaveLength(0);
  });
});
