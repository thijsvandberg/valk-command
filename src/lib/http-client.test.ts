// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const loggerWarn = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: (...a: unknown[]) => loggerWarn(...a), error: vi.fn() },
}));

import { httpFetch } from "./http-client";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown, ok = true, status = 200, headers: Record<string, string> = {}) {
  return {
    ok,
    status,
    headers: { get: (k: string) => headers[k] ?? null },
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

describe("httpFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok with parsed data on success", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ hello: "world" }));
    const result = await httpFetch<{ hello: string }>("https://x.test/a");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ hello: "world" });
      expect(result.retryCount).toBe(0);
    }
  });

  it("classifies a timeout (AbortError) as TIMEOUT with status 0", async () => {
    mockFetch.mockRejectedValue(new DOMException("aborted", "AbortError"));
    const result = await httpFetch("https://x.test/hung");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TIMEOUT");
      expect(result.status).toBe(0);
    }
  });

  it("classifies a generic network throw as UNREACHABLE", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await httpFetch("https://x.test/down");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNREACHABLE");
  });

  it("retries configured statuses with backoff, then succeeds", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse("busy", false, 503))
      .mockResolvedValueOnce(jsonResponse({ ok: 1 }));
    const sleep = vi.fn(async () => {});
    const result = await httpFetch("https://x.test/retry", {
      maxRetries: 2,
      sleep,
      jitter: () => 0,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.retryCount).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // jitter()=0 → 500 * (0.5 + 0) = 250ms backoff on the first retry.
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it("honors Retry-After over computed backoff", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse("slow down", false, 429, { "Retry-After": "2" }))
      .mockResolvedValueOnce(jsonResponse({ ok: 1 }));
    const sleep = vi.fn(async () => {});
    await httpFetch("https://x.test/ra", { maxRetries: 1, sleep });
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("does not retry non-retryable statuses", async () => {
    mockFetch.mockResolvedValue(jsonResponse("nope", false, 404));
    const result = await httpFetch("https://x.test/missing", { maxRetries: 3 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CLIENT_ERROR");
  });

  it("classifies 401/403 as AUTH and 5xx as SERVER_ERROR", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse("", false, 401));
    const auth = await httpFetch("https://x.test/auth");
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.error.code).toBe("AUTH");

    mockFetch.mockResolvedValueOnce(jsonResponse("boom", false, 500));
    const server = await httpFetch("https://x.test/err");
    expect(server.ok).toBe(false);
    if (!server.ok) expect(server.error.code).toBe("SERVER_ERROR");
  });

  it("surfaces INVALID_RESPONSE when the body is not JSON", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => {
        throw new Error("not json");
      },
      text: async () => "<html>",
    });
    const result = await httpFetch("https://x.test/html");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_RESPONSE");
  });

  it("includes the raw body on HTTP-error results", async () => {
    mockFetch.mockResolvedValue(jsonResponse("forbidden detail", false, 403));
    const result = await httpFetch("https://x.test/body");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.body).toBe("forbidden detail");
  });

  it("fires onRequest once per attempt", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse("busy", false, 503))
      .mockResolvedValueOnce(jsonResponse({ ok: 1 }));
    const onRequest = vi.fn();
    await httpFetch("https://x.test/track", { maxRetries: 2, sleep: async () => {}, onRequest });
    expect(onRequest).toHaveBeenCalledTimes(2);
  });

  // BRDG-402: every client built on httpFetch inherits one warn on the final
  // non-ok outcome — host + classification only, never the URL query or headers.
  describe("non-ok logging (BRDG-402)", () => {
    it("warns the final non-ok outcome with host, status, code and retryCount", async () => {
      mockFetch.mockResolvedValue(jsonResponse("boom", false, 500));
      await httpFetch("https://api.example.test/v2/things?secret=abc", {
        maxRetries: 1,
        sleep: async () => {},
      });

      const call = loggerWarn.mock.calls.find((c) => c[1] === "request failed");
      expect(call).toBeDefined();
      const ctx = call![2] as Record<string, unknown>;
      expect(ctx.host).toBe("api.example.test");
      expect(ctx.status).toBe(500);
      expect(ctx.code).toBe("SERVER_ERROR");
      expect(typeof ctx.retryCount).toBe("number");
    });

    it("does NOT warn on a successful response", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ ok: 1 }));
      await httpFetch("https://x.test/ok");
      expect(loggerWarn.mock.calls.find((c) => c[1] === "request failed")).toBeUndefined();
    });

    it("logs only the host — never the query string or any auth header", async () => {
      mockFetch.mockResolvedValue(jsonResponse("no", false, 401));
      await httpFetch("https://x.test/secure?token=topsecret123", {
        headers: { Authorization: "Bearer topsecret123" },
      });

      const serialized = JSON.stringify(loggerWarn.mock.calls);
      expect(serialized).not.toContain("topsecret123");
      expect(serialized).not.toContain("Authorization");
      expect(serialized).not.toContain("token=");
    });

    it("warns once with a network timeout (status 0, TIMEOUT)", async () => {
      mockFetch.mockRejectedValue(new DOMException("aborted", "AbortError"));
      await httpFetch("https://x.test/hung");

      const call = loggerWarn.mock.calls.find((c) => c[1] === "request failed");
      expect(call).toBeDefined();
      const ctx = call![2] as Record<string, unknown>;
      expect(ctx.status).toBe(0);
      expect(ctx.code).toBe("TIMEOUT");
    });
  });
});
