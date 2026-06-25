// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    BITBUCKET_WORKSPACE: "ws",
    BITBUCKET_REPO_SLUG: "valk-repo",
    BITBUCKET_EMAIL: "ci@example.com",
    BITBUCKET_APP_PASSWORD: "token",
    BITBUCKET_API_TOKEN: "",
    JIRA_EMAIL: "ci@example.com",
  },
}));

vi.mock("@/lib/rate-limiter", () => ({ trackOutboundCall: vi.fn() }));

const loggerWarn = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: (...a: unknown[]) => loggerWarn(...a), error: vi.fn() },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { bbFetch, bbFetchUrl, bbFetchStatus, isBitbucketConfigured } from "./bitbucket-fetch";
import { trackOutboundCall } from "@/lib/rate-limiter";

function ok(body: unknown) {
  return { ok: true, status: 200, headers: { get: () => null }, json: async () => body };
}
function httpError(status: number, body = "") {
  return { ok: false, status, headers: { get: () => null }, text: async () => body, json: async () => null };
}

describe("bitbucket-fetch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("isBitbucketConfigured reflects env", () => {
    expect(isBitbucketConfigured()).toBe(true);
  });

  it("bbFetch returns parsed data and tracks the outbound call", async () => {
    mockFetch.mockResolvedValue(ok({ values: [1] }));
    const data = await bbFetch<{ values: number[] }>("valk-repo", "/x");
    expect(data).toEqual({ values: [1] });
    expect(trackOutboundCall).toHaveBeenCalledWith("bitbucket");
  });

  it("bbFetch returns null on an HTTP error", async () => {
    mockFetch.mockResolvedValue(httpError(404));
    expect(await bbFetch("valk-repo", "/missing")).toBeNull();
  });

  it("bbFetch throws (does not hang) on a timeout", async () => {
    mockFetch.mockRejectedValue(new DOMException("aborted", "AbortError"));
    await expect(bbFetch("valk-repo", "/hung")).rejects.toThrow();
  });

  it("bbFetchUrl throws on a network error", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNRESET"));
    await expect(bbFetchUrl("https://api.bitbucket.org/x")).rejects.toThrow();
  });

  it("bbFetchStatus reports status 0 on a timeout instead of hanging", async () => {
    mockFetch.mockRejectedValue(new DOMException("aborted", "AbortError"));
    const res = await bbFetchStatus("valk-repo", "/hung");
    expect(res).toEqual({ status: 0, data: null });
  });

  it("bbFetchStatus preserves a 404 status", async () => {
    mockFetch.mockResolvedValue(httpError(404));
    const res = await bbFetchStatus("valk-repo", "/gone");
    expect(res.status).toBe(404);
    expect(res.data).toBeNull();
  });

  // BRDG-402: Bitbucket failures were silent or only info-level, so an expired
  // app-password looked identical to a transient blip. Now non-2xx is warned with
  // a code (AUTH vs other) and a truncated body, and secrets never appear.
  describe("non-2xx logging (BRDG-402)", () => {
    it("bbFetch warns on a non-2xx with the AUTH code and a truncated body", async () => {
      mockFetch.mockResolvedValue(httpError(403, "x".repeat(500)));
      await bbFetch("valk-repo", "/protected");

      const call = loggerWarn.mock.calls.find((c) => String(c[1]).startsWith("bbFetch "));
      expect(call).toBeDefined();
      const ctx = call![2] as Record<string, unknown>;
      expect(ctx.code).toBe("AUTH");
      expect((ctx.body as string).length).toBeLessThanOrEqual(303); // 300 + "..."
    });

    it("bbFetch stays silent on a silenced 404", async () => {
      mockFetch.mockResolvedValue(httpError(404));
      await bbFetch("valk-repo", "/maybe-gone", true);
      const call = loggerWarn.mock.calls.find((c) => String(c[1]).startsWith("bbFetch "));
      expect(call).toBeUndefined();
    });

    it("bbFetchUrl warns on a non-2xx", async () => {
      mockFetch.mockResolvedValue(httpError(500, "server boom"));
      await bbFetchUrl("https://api.bitbucket.org/2.0/x?page=2");

      const call = loggerWarn.mock.calls.find((c) => String(c[1]).startsWith("bbFetchUrl "));
      expect(call).toBeDefined();
      expect((call![2] as Record<string, unknown>).code).toBe("SERVER_ERROR");
    });

    it("bbFetchStatus warns on a non-2xx and flags transient classification", async () => {
      mockFetch.mockResolvedValue(httpError(429, "rate limited"));
      await bbFetchStatus("valk-repo", "/busy");

      const call = loggerWarn.mock.calls.find((c) => String(c[1]).startsWith("bbFetchStatus "));
      expect(call).toBeDefined();
      const ctx = call![2] as Record<string, unknown>;
      expect(ctx.transient).toBe(true);
    });

    it("never logs the Authorization header or the app-password token", async () => {
      mockFetch.mockResolvedValue(httpError(401, "denied"));
      await bbFetch("valk-repo", "/protected");
      await bbFetchUrl("https://api.bitbucket.org/2.0/y");

      const serialized = JSON.stringify(loggerWarn.mock.calls);
      // "token" is the BITBUCKET_APP_PASSWORD value in this test's env mock.
      expect(serialized).not.toContain("token");
      expect(serialized).not.toContain("Authorization");
      expect(serialized).not.toContain("Basic ");
    });
  });
});
