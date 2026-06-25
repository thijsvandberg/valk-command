// @vitest-environment node
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

// Capture forwarded errors so we can assert the SWR onError handler routes
// fetch failures (with key + status) to the client-error sink (BRDG-398).
const reportSpy = vi.fn();
vi.mock("@/lib/client-error", () => ({
  reportClientError: (...args: unknown[]) => reportSpy(...args),
}));

import { fetcher, handleSwrError } from "./SWRProvider";
import { ApiError } from "@/lib/api-client";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SWRProvider default fetcher", () => {
  it("throws ApiError on a non-ok response (so SWR surfaces error, not null)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "boom" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(fetcher("/api/anything")).rejects.toBeInstanceOf(ApiError);
  });

  it("resolves with the parsed JSON body on a 200 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, value: 42 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(fetcher("/api/anything")).resolves.toEqual({ ok: true, value: 42 });
  });
});

describe("SWRProvider onError forwarding", () => {
  beforeEach(() => {
    reportSpy.mockClear();
  });

  it("forwards an ApiError with the SWR key and HTTP status", () => {
    handleSwrError(new ApiError(503, { error: "down" }), "/api/tickets");

    expect(reportSpy).toHaveBeenCalledTimes(1);
    const [context, error, extra] = reportSpy.mock.calls[0];
    expect(context).toContain("/api/tickets");
    expect(context).toContain("status=503");
    expect(error).toBeInstanceOf(ApiError);
    expect(extra).toMatchObject({ source: "swr" });
  });

  it("forwards a non-ApiError (network failure) with the key but no status", () => {
    handleSwrError(new Error("network down"), "/api/sprints");

    const [context] = reportSpy.mock.calls[0];
    expect(context).toContain("/api/sprints");
    expect(context).not.toContain("status=");
  });
});
