import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock server-only before importing agent-fetch
vi.mock("server-only", () => ({}));

// Mock agent-proxy
vi.mock("@/lib/agent-proxy", () => ({
  agentUrl: (path: string) => `http://agent:3001${path}`,
  agentHeaders: () => ({
    Authorization: "Bearer test-key",
    "Content-Type": "application/json",
  }),
}));

import { agentFetch, agentFetchStream } from "./agent-fetch";

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("agentFetch", () => {
  it("returns ok result for successful JSON response", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "task_1" }));

    const result = await agentFetch<{ id: string }>("/api/tasks");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.id).toBe("task_1");
      expect(result.status).toBe(200);
    }
  });

  it("sends correct method, headers, and body", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "task_2" }, 201));

    await agentFetch("/api/tasks", {
      method: "POST",
      body: { skill: "test" },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://agent:3001/api/tasks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ skill: "test" }),
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
      }),
    );
  });

  it("classifies 401 as AUTH error", async () => {
    mockFetch.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));

    const result = await agentFetch("/api/tasks");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AUTH");
      expect(result.status).toBe(401);
    }
  });

  it("classifies 403 as AUTH error", async () => {
    mockFetch.mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));

    const result = await agentFetch("/api/tasks");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AUTH");
    }
  });

  it("classifies 500 as SERVER_ERROR with parsed message", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "Internal explosion" }, 500),
    );

    const result = await agentFetch("/api/tasks");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SERVER_ERROR");
      expect(result.error.error).toBe("Internal explosion");
      expect(result.status).toBe(500);
    }
  });

  it("classifies 4xx (non-auth) as SERVER_ERROR with parsed message", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "Not found" }, 404),
    );

    const result = await agentFetch("/api/tasks/missing");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SERVER_ERROR");
      expect(result.error.error).toBe("Not found");
      expect(result.status).toBe(404);
    }
  });

  it("classifies non-JSON response as INVALID_RESPONSE", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("<html>error</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const result = await agentFetch("/api/tasks");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_RESPONSE");
    }
  });

  it("classifies network error as UNREACHABLE", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

    const result = await agentFetch("/api/tasks");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNREACHABLE");
    }
  });

  it("classifies AbortError as TIMEOUT", async () => {
    const abort = new DOMException("The operation was aborted", "AbortError");
    mockFetch.mockRejectedValueOnce(abort);

    const result = await agentFetch("/api/tasks");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TIMEOUT");
    }
  });

  describe("retry logic", () => {
    it("retries on 502 and succeeds on second attempt", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ error: "Bad Gateway" }, 502))
        .mockResolvedValueOnce(jsonResponse({ id: "task_ok" }));

      const result = await agentFetch<{ id: string }>("/api/tasks", {
        method: "POST",
        retries: 1,
      });

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.id).toBe("task_ok");
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(console.warn).toHaveBeenCalledTimes(1);
    });

    it("retries on network error and succeeds", async () => {
      mockFetch
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockResolvedValueOnce(jsonResponse({ id: "recovered" }));

      const result = await agentFetch<{ id: string }>("/api/tasks", { retries: 1 });

      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("does NOT retry on 404", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: "Not found" }, 404));

      const result = await agentFetch("/api/tasks/missing", { retries: 2 });

      expect(result.ok).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("does NOT retry on 401", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));

      const result = await agentFetch("/api/tasks", { retries: 2 });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("AUTH");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("does NOT retry on 400", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: "Bad request" }, 400));

      const result = await agentFetch("/api/tasks", { retries: 2 });

      expect(result.ok).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("returns last error after all retries exhausted", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ error: "Bad Gateway" }, 502))
        .mockResolvedValueOnce(jsonResponse({ error: "Bad Gateway" }, 503))
        .mockResolvedValueOnce(jsonResponse({ error: "Service Unavailable" }, 503));

      const result = await agentFetch("/api/tasks", { retries: 2 });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("SERVER_ERROR");
      }
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(console.warn).toHaveBeenCalledTimes(2);
    });
  });
});

describe("agentFetchStream", () => {
  it("returns raw Response on success", async () => {
    const body = new ReadableStream();
    mockFetch.mockResolvedValueOnce(new Response(body, { status: 200 }));

    const result = await agentFetchStream("/api/tasks/1/stream");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBeInstanceOf(Response);
    }
  });

  it("removes Content-Type header for stream requests", async () => {
    const body = new ReadableStream();
    mockFetch.mockResolvedValueOnce(new Response(body, { status: 200 }));

    await agentFetchStream("/api/tasks/1/stream");

    const calledHeaders = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(calledHeaders.Authorization).toBe("Bearer test-key");
    expect("Content-Type" in calledHeaders).toBe(false);
  });

  it("classifies stream error as appropriate code", async () => {
    mockFetch.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

    const result = await agentFetchStream("/api/tasks/1/stream");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });

  it("classifies network error as UNREACHABLE", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

    const result = await agentFetchStream("/api/tasks/1/stream");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNREACHABLE");
    }
  });
});
