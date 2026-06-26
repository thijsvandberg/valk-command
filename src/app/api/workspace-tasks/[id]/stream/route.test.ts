// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/agent-fetch", () => ({
  agentFetchStream: vi.fn(),
}));

const loggerWarn = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: (...a: unknown[]) => loggerWarn(...a), error: vi.fn() },
}));

import { agentFetchStream } from "@/lib/agent-fetch";
import { GET } from "./route";

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });

// Drains a ReadableStream to completion so a pipeTo() in the route runs to its
// terminal state (success or error) deterministically within the test.
async function drain(stream: ReadableStream<Uint8Array>): Promise<void> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
  } catch {
    /* the consumer side erroring is expected in the pipe-failure test */
  } finally {
    reader.releaseLock();
  }
}

describe("GET /api/workspace-tasks/[id]/stream", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    loggerWarn.mockReset();
  });

  it("rejects a path-bearing task id with 400 and never calls the agent", async () => {
    const request = new Request("http://localhost:3100/api/workspace-tasks/x/stream");
    const response = await GET(request, makeParams("task/../secret"));
    expect(response.status).toBe(400);
    expect(agentFetchStream).not.toHaveBeenCalled();
  });

  it("rejects a query-bearing task id with 400 and never calls the agent", async () => {
    const request = new Request("http://localhost:3100/api/workspace-tasks/x/stream");
    const response = await GET(request, makeParams("task-1?foo=bar"));
    expect(response.status).toBe(400);
    expect(agentFetchStream).not.toHaveBeenCalled();
  });

  it("forwards a valid task id to the agent stream path", async () => {
    vi.mocked(agentFetchStream).mockResolvedValue({
      ok: false,
      error: { error: "Agent unreachable", code: "UNREACHABLE" },
      status: 502,
      retryCount: 0,
    });
    const request = new Request("http://localhost:3100/api/workspace-tasks/task-1/stream");
    await GET(request, makeParams("task-1"));
    expect(agentFetchStream).toHaveBeenCalledWith("/api/tasks/task-1/stream");
  });

  it("returns error response when agentFetchStream returns error", async () => {
    vi.mocked(agentFetchStream).mockResolvedValue({
      ok: false,
      error: { error: "Agent unreachable", code: "UNREACHABLE" },
      status: 502,
      retryCount: 0,
    });

    const controller = new AbortController();
    const request = new Request("http://localhost:3100/api/workspace-tasks/task-1/stream", {
      signal: controller.signal,
    });
    const response = await GET(request, makeParams("task-1"));
    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.code).toBe("UNREACHABLE");
  });

  it("returns SSE headers on success with a body stream", async () => {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    writer.close();

    vi.mocked(agentFetchStream).mockResolvedValue({
      ok: true,
      data: new Response(readable),
      status: 200,
      retryCount: 0,
    });

    const controller = new AbortController();
    const request = new Request("http://localhost:3100/api/workspace-tasks/task-1/stream", {
      signal: controller.signal,
    });
    const response = await GET(request, makeParams("task-1"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("returns 502 when agent response has no body", async () => {
    vi.mocked(agentFetchStream).mockResolvedValue({
      ok: true,
      data: new Response(null),
      status: 200,
      retryCount: 0,
    });

    const controller = new AbortController();
    const request = new Request("http://localhost:3100/api/workspace-tasks/task-1/stream", {
      signal: controller.signal,
    });
    const response = await GET(request, makeParams("task-1"));
    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.code).toBe("INVALID_RESPONSE");
  });

  // BRDG-402: a genuine upstream failure mid-stream used to be swallowed by the
  // pipeTo().catch, leaving no trace of a half-finished proxied task.
  it("logs a warn with the task id when the upstream pipe fails for a non-abort reason", async () => {
    const upstream = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error("upstream exploded");
      },
    });
    vi.mocked(agentFetchStream).mockResolvedValue({
      ok: true,
      data: new Response(upstream),
      status: 200,
      retryCount: 0,
    });

    const controller = new AbortController();
    const request = new Request("http://localhost:3100/api/workspace-tasks/task-err/stream", {
      signal: controller.signal,
    });
    const response = await GET(request, makeParams("task-err"));
    // Draining the proxied body lets the route's pipeTo reach its failure state.
    await drain(response.body!);
    // Flush the microtask queue so the route's pipeTo().catch has run.
    await new Promise((r) => setTimeout(r, 0));

    const call = loggerWarn.mock.calls.find((c) => c[1] === "pipe failed");
    expect(call).toBeDefined();
    const ctx = call![2] as Record<string, unknown>;
    expect(ctx.taskId).toBe("task-err");
    expect(ctx.cause).toContain("upstream exploded");
  });

  // An expected client abort (navigation, EventSource close) must stay silent —
  // it is routine for SSE and is not a server fault.
  it("does NOT log an error when the client aborts the request", async () => {
    // A stream that never completes, so the only way it ends is the client abort.
    const upstream = new ReadableStream<Uint8Array>({});
    vi.mocked(agentFetchStream).mockResolvedValue({
      ok: true,
      data: new Response(upstream),
      status: 200,
      retryCount: 0,
    });

    const controller = new AbortController();
    const request = new Request("http://localhost:3100/api/workspace-tasks/task-abort/stream", {
      signal: controller.signal,
    });
    await GET(request, makeParams("task-abort"));

    // Simulate the browser disconnecting; the route aborts the upstream pipe.
    controller.abort();
    // Let the microtask queue flush so the pipeTo().catch has run.
    await new Promise((r) => setTimeout(r, 0));

    const pipeWarns = loggerWarn.mock.calls.filter((c) => c[1] === "pipe failed");
    expect(pipeWarns).toHaveLength(0);
  });
});
