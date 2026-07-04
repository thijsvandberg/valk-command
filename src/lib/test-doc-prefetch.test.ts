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
  revalidateTestDocViews,
} from "./test-doc-prefetch";
import { registerScopedMutate, __resetScopedMutateForTests } from "./swr-scoped-mutate";
import type { ScopedMutator } from "swr";

const RESPONSE = {
  storyUpdatedAt: null,
  notNeeded: false,
  notNeededAt: null,
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

  it("revalidateTestDocViews sweeps board lists, detail caches and sprint bundles only", () => {
    const mutate = vi.fn();
    registerScopedMutate(mutate as unknown as ScopedMutator);
    try {
      revalidateTestDocViews();
      const [matcher] = mutate.mock.calls[0] as [(k: unknown) => boolean];
      expect(matcher("/api/tickets")).toBe(true);
      expect(matcher("/api/tickets?sprint=6361")).toBe(true);
      expect(matcher("/api/tickets/VPL-1")).toBe(true);
      expect(matcher("/api/sprints/9/test-docs")).toBe(true);
      expect(matcher("/api/sprints/9/details")).toBe(false);
      expect(matcher("/api/settings/sprint-board-filters")).toBe(false);
      expect(matcher(42)).toBe(false);
    } finally {
      __resetScopedMutateForTests();
    }
  });
});
