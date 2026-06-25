// @vitest-environment node
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

const loggerWarn = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: (...a: unknown[]) => loggerWarn(...a), error: vi.fn() },
}));

import { agentFetch, agentFetchStream } from "./agent-fetch";

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  loggerWarn.mockReset();
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
      // The retry warning now goes through the structured logger, not console.
      const retryWarns = loggerWarn.mock.calls.filter((c) => c[1] === "retry");
      expect(retryWarns).toHaveLength(1);
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
      const retryWarns = loggerWarn.mock.calls.filter((c) => c[1] === "retry");
      expect(retryWarns).toHaveLength(2);
    });
  });

  // BRDG-402: a failed agent call kept only a generic code; the transport cause
  // (and a 4xx agent explanation) was discarded. These lock in that it is logged
  // and retained without changing the returned discriminated-union shape.
  describe("terminal failure logging (BRDG-402)", () => {
    it("logs the transport cause before returning the classified network error", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("ECONNREFUSED 127.0.0.1:3001"));

      const result = await agentFetch("/api/tasks");

      // Shape unchanged: still the same { ok:false, error, status, retryCount } union.
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNREACHABLE");
        expect(result.status).toBe(0);
        expect(result.retryCount).toBe(0);
      }

      const call = loggerWarn.mock.calls.find((c) => c[1] === "terminal failure");
      expect(call).toBeDefined();
      const ctx = call![2] as Record<string, unknown>;
      expect(ctx.path).toBe("/api/tasks");
      expect(ctx.code).toBe("UNREACHABLE");
      expect(ctx.cause).toContain("ECONNREFUSED");
    });

    it("retains a truncated 4xx body in the classified error message", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("missing required arg: ticketKey", {
          status: 422,
          headers: { "Content-Type": "text/plain" },
        }),
      );

      const result = await agentFetch("/api/tasks");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("SERVER_ERROR");
        expect(result.status).toBe(422);
        // The agent's explanation now survives, not just "Workspace returned 422".
        expect(result.error.error).toContain("missing required arg: ticketKey");
      }
    });

    it("prefers a JSON {error} message for a 4xx over the raw body", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: "bad skill arg" }, 422));

      const result = await agentFetch("/api/tasks");

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.error).toBe("bad skill arg");
    });

    it("never logs the Authorization header or bearer token value", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

      await agentFetch("/api/tasks");

      const serialized = JSON.stringify(loggerWarn.mock.calls);
      expect(serialized).not.toContain("test-key");
      expect(serialized).not.toContain("Authorization");
      expect(serialized.toLowerCase()).not.toContain("bearer");
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

  it("logs the transport cause on a stream network failure (BRDG-402)", async () => {
    loggerWarn.mockReset();
    mockFetch.mockRejectedValueOnce(new TypeError("socket hang up"));

    await agentFetchStream("/api/tasks/1/stream");

    const call = loggerWarn.mock.calls.find((c) => c[1] === "terminal failure");
    expect(call).toBeDefined();
    expect((call![2] as Record<string, unknown>).cause).toContain("socket hang up");
  });
});
