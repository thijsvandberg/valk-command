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
});
