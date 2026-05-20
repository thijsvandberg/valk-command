import { describe, it, expect, vi, beforeEach } from "vitest";
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

import { GET, POST, PUT, DELETE } from "./route";

function makeParams(key: string) {
  return { params: Promise.resolve({ key }) };
}

function postRequest(key: string): Request {
  return new Request(`http://localhost:3100/api/tickets/${key}/related-suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

function putRequest(key: string, body: unknown): Request {
  return new Request(`http://localhost:3100/api/tickets/${key}/related-suggestions`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

  it("submits workspace task and returns taskId", async () => {
    seedTicket("VPL-100");

    mockAgentFetch.mockResolvedValueOnce({
      ok: true,
      data: { id: "task-1" },
      status: 200,
      retryCount: 0,
    });

    const res = await POST(postRequest("VPL-100"), makeParams("VPL-100"));
    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data.cached).toBe(false);
    expect(data.taskId).toBe("task-1");
    expect(data.streamUrl).toBe("/api/workspace-tasks/task-1/stream");
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

describe("PUT /api/tickets/[key]/related-suggestions", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("parses output and caches suggestions", async () => {
    seedTicket("VPL-100");

    const output = `<related-stories>[
      {"key":"VPL-200","score":0.9,"title":"Related story","status":"TO DO","reason":"Shared auth module"},
      {"key":"VPL-300","score":0.7,"title":"Another story","status":"IN PROGRESS","type":"bug","reason":"Same component"}
    ]</related-stories>`;

    const res = await PUT(putRequest("VPL-100", { output }), makeParams("VPL-100"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.suggestions).toHaveLength(2);
    expect(data.suggestions[0].suggestedKey).toBe("VPL-200");
    expect(data.suggestions[0].score).toBe(0.9);
    expect(data.suggestions[0].reason).toBe("Shared auth module");

    const cached = testDb.select().from(relatedSuggestionCache)
      .where(eq(relatedSuggestionCache.ticketKey, "VPL-100")).all();
    expect(cached).toHaveLength(2);
  });

  it("deduplicates against existing links", async () => {
    seedTicket("VPL-100");
    seedLink("VPL-100", "VPL-200");

    const output = `<related-stories>[
      {"key":"VPL-200","score":0.9,"title":"Already linked","status":"TO DO"},
      {"key":"VPL-300","score":0.7,"title":"New suggestion","status":"IN PROGRESS"}
    ]</related-stories>`;

    const res = await PUT(putRequest("VPL-100", { output }), makeParams("VPL-100"));
    const data = await res.json();
    expect(data.suggestions).toHaveLength(1);
    expect(data.suggestions[0].suggestedKey).toBe("VPL-300");
  });

  it("excludes the ticket itself from results", async () => {
    seedTicket("VPL-100");

    const output = `<related-stories>[
      {"key":"VPL-100","score":1.0,"title":"Self-reference","status":"TO DO"},
      {"key":"VPL-200","score":0.8,"title":"Actual match","status":"TO DO"}
    ]</related-stories>`;

    const res = await PUT(putRequest("VPL-100", { output }), makeParams("VPL-100"));
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
    const output = `<related-stories>${JSON.stringify(items)}</related-stories>`;

    const res = await PUT(putRequest("VPL-100", { output }), makeParams("VPL-100"));
    const data = await res.json();
    expect(data.suggestions).toHaveLength(10);
  });

  it("returns 400 when output is missing", async () => {
    const res = await PUT(putRequest("VPL-100", {}), makeParams("VPL-100"));
    expect(res.status).toBe(400);
  });

  it("returns empty suggestions for output without related-stories block", async () => {
    seedTicket("VPL-100");

    const res = await PUT(
      putRequest("VPL-100", { output: "No related stories found" }),
      makeParams("VPL-100"),
    );
    const data = await res.json();
    expect(data.suggestions).toHaveLength(0);
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
