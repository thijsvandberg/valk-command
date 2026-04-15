import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/agent-fetch", () => ({
  agentFetchStream: vi.fn(),
}));

import { agentFetchStream } from "@/lib/agent-fetch";
import { GET } from "./route";

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/workspace-tasks/[id]/stream", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns error response when agentFetchStream returns error", async () => {
    vi.mocked(agentFetchStream).mockResolvedValue({
      ok: false,
      error: { error: "Agent unreachable", code: "NETWORK_ERROR" },
      status: 502,
    });

    const controller = new AbortController();
    const request = new Request("http://localhost:3100/api/workspace-tasks/task-1/stream", {
      signal: controller.signal,
    });
    const response = await GET(request, makeParams("task-1"));
    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.code).toBe("NETWORK_ERROR");
  });

  it("returns SSE headers on success with a body stream", async () => {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    writer.close();

    vi.mocked(agentFetchStream).mockResolvedValue({
      ok: true,
      data: new Response(readable),
      status: 200,
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
});
