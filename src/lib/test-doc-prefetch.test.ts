import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getTestDoc = vi.fn();

vi.mock("@/lib/api-client", () => ({
  tickets: {
    getTestDoc: (key: string) => getTestDoc(key),
  },
}));

import {
  prefetchTestDoc,
  getCachedTestDoc,
  primeTestDocCache,
  invalidateTestDocCache,
} from "./test-doc-prefetch";

const RESPONSE = {
  storyUpdatedAt: null,
  saved: null,
  draft: { markdown: "doc", classification: "ok" as const, generatedAt: "2026-07-03T00:00:00Z" },
};

describe("test-doc-prefetch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-03T12:00:00Z"));
    getTestDoc.mockReset();
    // Clear any state a previous test primed for these keys.
    ["A-1", "A-2", "A-3", "A-4"].forEach(invalidateTestDocCache);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("prefetches once and serves the cached response without a second call", async () => {
    getTestDoc.mockResolvedValue(RESPONSE);
    prefetchTestDoc("A-1");
    await vi.runAllTimersAsync();
    expect(getTestDoc).toHaveBeenCalledTimes(1);
    expect(getCachedTestDoc("A-1")).toEqual(RESPONSE);

    // A second prefetch inside the TTL is a no-op.
    prefetchTestDoc("A-1");
    await vi.runAllTimersAsync();
    expect(getTestDoc).toHaveBeenCalledTimes(1);
  });

  it("expires the cache after the TTL", async () => {
    getTestDoc.mockResolvedValue(RESPONSE);
    prefetchTestDoc("A-2");
    await vi.runAllTimersAsync();
    expect(getCachedTestDoc("A-2")).toEqual(RESPONSE);

    vi.advanceTimersByTime(20_001);
    expect(getCachedTestDoc("A-2")).toBeNull();
  });

  it("primeTestDocCache seeds the cache without a fetch", () => {
    primeTestDocCache("A-3", RESPONSE);
    expect(getTestDoc).not.toHaveBeenCalled();
    expect(getCachedTestDoc("A-3")).toEqual(RESPONSE);
  });

  it("invalidateTestDocCache drops a cached entry", () => {
    primeTestDocCache("A-4", RESPONSE);
    invalidateTestDocCache("A-4");
    expect(getCachedTestDoc("A-4")).toBeNull();
  });

  it("swallows fetch failures and leaves the cache empty", async () => {
    getTestDoc.mockRejectedValue(new Error("boom"));
    prefetchTestDoc("A-1");
    await vi.runAllTimersAsync();
    expect(getCachedTestDoc("A-1")).toBeNull();
  });
});
