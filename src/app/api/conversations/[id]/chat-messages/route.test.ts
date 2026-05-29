// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/agent-fetch", () => ({
  agentFetch: vi.fn(),
}));

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/task-stream-handler", () => ({
  captureTaskStream: vi.fn(),
}));

vi.mock("@/db/next-sequence", () => ({
  nextSequence: vi.fn().mockReturnValue(1),
}));

const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    query: {
      conversation: {
        findFirst: vi.fn().mockResolvedValue({ id: "conv-1", title: "Chat: hello", relatedTicket: null }),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue(Promise.resolve()),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(Promise.resolve()),
      }),
    }),
  };
  return { mockDb };
});

vi.mock("@/db", () => ({
  db: mockDb,
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn((cb: () => unknown) => cb()),
  };
});

import { agentFetch } from "@/lib/agent-fetch";
import { applyRateLimit } from "@/lib/rate-limiter";
import { POST } from "./route";

function makeRequest(conversationId: string, body: Record<string, unknown>) {
  return new Request(`http://localhost:3100/api/conversations/${conversationId}/chat-messages`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/conversations/[id]/chat-messages", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(applyRateLimit).mockResolvedValue(null);
    mockDb.query.conversation.findFirst.mockResolvedValue({
      id: "conv-1",
      title: "Chat: hello",
      relatedTicket: null,
    });
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue(Promise.resolve()),
    });
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(Promise.resolve()),
      }),
    });
  });

  it("resumes session and returns task data", async () => {
    vi.mocked(agentFetch).mockResolvedValue({
      ok: true,
      data: { id: "task-followup", status: "queued", streamUrl: "/api/tasks/task-followup/stream" },
      status: 201,
      retryCount: 0,
    });

    const response = await POST(makeRequest("conv-1", { content: "follow-up question" }), makeParams("conv-1"));
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.id).toBe("task-followup");
    expect(data.conversationId).toBe("conv-1");

    // Should have called VRW conversation messages endpoint
    expect(vi.mocked(agentFetch)).toHaveBeenCalledWith(
      "/api/conversations/conv-1/messages",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("falls back to fresh chat task on 410 (session lost)", async () => {
    // First call: session lost
    vi.mocked(agentFetch).mockResolvedValueOnce({
      ok: false,
      error: { error: "Session not found", code: "SERVER_ERROR" },
      status: 410,
      retryCount: 0,
    });
    // Fallback call: fresh task
    vi.mocked(agentFetch).mockResolvedValueOnce({
      ok: true,
      data: { id: "task-recovered", status: "queued" },
      status: 201,
      retryCount: 0,
    });

    const response = await POST(makeRequest("conv-1", { content: "retry message" }), makeParams("conv-1"));
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.id).toBe("task-recovered");

    // Second call should be to /api/tasks (fresh skill invocation)
    expect(vi.mocked(agentFetch)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(agentFetch)).toHaveBeenLastCalledWith(
      "/api/tasks",
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({ skill: "chat" }),
      }),
    );
  });

  it("returns 404 when conversation not found", async () => {
    mockDb.query.conversation.findFirst.mockResolvedValue(null);

    const response = await POST(makeRequest("missing", { content: "hello" }), makeParams("missing"));
    expect(response.status).toBe(404);
  });

  it("returns 400 when content is empty", async () => {
    const response = await POST(makeRequest("conv-1", { content: "" }), makeParams("conv-1"));
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    const request = new Request("http://localhost:3100/api/conversations/conv-1/chat-messages", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request, makeParams("conv-1"));
    expect(response.status).toBe(400);
  });

  it("returns agent error when both resume and fallback fail", async () => {
    // Session lost
    vi.mocked(agentFetch).mockResolvedValueOnce({
      ok: false,
      error: { error: "Session not found", code: "SERVER_ERROR" },
      status: 410,
      retryCount: 0,
    });
    // Fallback also fails
    vi.mocked(agentFetch).mockResolvedValueOnce({
      ok: false,
      error: { error: "Agent down", code: "UNREACHABLE" },
      status: 502,
      retryCount: 2,
    });

    const response = await POST(makeRequest("conv-1", { content: "message" }), makeParams("conv-1"));
    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toBe("Agent down");
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(applyRateLimit).mockResolvedValue(
      new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 })
    );

    const response = await POST(makeRequest("conv-1", { content: "hello" }), makeParams("conv-1"));
    expect(response.status).toBe(429);
  });
});
