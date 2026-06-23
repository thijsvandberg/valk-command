// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetcher } from "./SWRProvider";
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
