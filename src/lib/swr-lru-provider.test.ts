import { describe, it, expect, afterEach, vi } from "vitest";
import type { Cache, State } from "swr";
import { createLruProvider, DEFAULT_MAX_ENTRIES, DEFAULT_FRESHNESS_MS } from "./swr-lru-provider";
import {
  applyPendingEdits,
  registerPendingEdit,
  __resetPendingEdits,
  __getPendingEdits,
} from "@/components/sprint-board/pendingTicketEdits";
import type { Ticket } from "@/types/ticket";

// SWR cache values are opaque State objects; the LRU stores them verbatim.
const v = (data: unknown): State<unknown, unknown> => ({ data });
const dataKeys = (cache: Cache): string[] => [...cache.keys()].filter((k) => !k.startsWith("$"));

describe("createLruProvider", () => {
  it("exposes sane defaults", () => {
    expect(DEFAULT_MAX_ENTRIES).toBe(300);
    expect(DEFAULT_FRESHNESS_MS).toBe(60_000);
  });

  it("moves a read key to most-recently-used so a colder key is evicted first", () => {
    const cache = createLruProvider({ maxEntries: 2, freshnessMs: 0 })();
    cache.set("a", v(1));
    cache.set("b", v(2));
    cache.get("a"); // touch a -> b is now the coldest

    cache.set("c", v(3)); // over cap -> evict the coldest (b)

    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toEqual(v(1));
    expect(cache.get("c")).toEqual(v(3));
  });

  it("keeps the evictable count at or below the cap", () => {
    const cache = createLruProvider({ maxEntries: 3, freshnessMs: 0 })();
    for (let i = 0; i < 100; i++) cache.set(`k${i}`, v(i));

    expect(dataKeys(cache).length).toBeLessThanOrEqual(3);
    // The most-recently-set keys survive.
    expect(cache.get("k99")).toEqual(v(99));
    expect(cache.get("k0")).toBeUndefined();
  });

  it("never counts or evicts $-prefixed (SWR-internal) keys", () => {
    const cache = createLruProvider({ maxEntries: 1, freshnessMs: 0 })();
    cache.set("$inf$page", v("infinite-bookkeeping"));
    cache.set("a", v(1));
    cache.set("b", v(2)); // only a/b count toward the cap of 1 -> a evicted

    expect(cache.get("$inf$page")).toEqual(v("infinite-bookkeeping"));
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toEqual(v(2));
    expect(dataKeys(cache).length).toBe(1);
  });

  it("respects the freshness window: a recently touched key is not evicted even over cap", () => {
    let clock = 0;
    const cache = createLruProvider({ maxEntries: 1, freshnessMs: 1000, now: () => clock })();

    clock = 0;
    cache.set("a", v(1));
    clock = 500;
    cache.set("b", v(2)); // both within 1000ms freshness -> soft cap exceeded, nothing evicted

    expect(cache.get("a")).toEqual(v(1));
    expect(cache.get("b")).toEqual(v(2));

    clock = 2000; // a and b are now stale (>1000ms)
    cache.set("c", v(3));

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toEqual(v(3));
  });

  it("keys() returns every live data key so matcher-based mutate still sees them", () => {
    const cache = createLruProvider({ maxEntries: 100 })();
    cache.set("/api/tickets?sprintId=s1", v([]));
    cache.set("/api/tickets/VPL-1", v({}));
    cache.set("$inf$x", v("internal"));

    const keys = [...cache.keys()];
    expect(keys).toContain("/api/tickets?sprintId=s1");
    expect(keys).toContain("/api/tickets/VPL-1");
    expect(keys).toContain("$inf$x");
  });

  it("seeds from the cache SWR passes in at install time", () => {
    const seed = new Map<string, State<unknown, unknown>>([["pre-existing", v(42)]]);
    const cache = createLruProvider()(seed as unknown as Cache);
    expect(cache.get("pre-existing")).toEqual(v(42));
  });
});

describe("pending-edit overlay survives cache eviction (BRDG-387 checkbox 2)", () => {
  afterEach(() => {
    __resetPendingEdits();
    vi.useRealTimers();
  });

  it("keeps an optimistic edit after a stale refetch AND after the list key is evicted", () => {
    vi.useFakeTimers(); // park registerPendingEdit's TTL timeout
    const NOW = 1_000_000;

    // User flips status to "Done"; the server list still lags at "To Do".
    registerPendingEdit("VPL-1", "jiraStatus", "Done", NOW);

    const staleList = [{ key: "VPL-1", jiraStatus: "To Do" } as unknown as Ticket];

    // 1) A stale refetch: the render-time overlay wins.
    const overlaid = applyPendingEdits(staleList, __getPendingEdits(), NOW);
    expect(overlaid?.[0].jiraStatus).toBe("Done");

    // 2) The bounded cache evicts the list key (a colder key forces it out).
    let clock = NOW;
    const cache = createLruProvider({ maxEntries: 1, freshnessMs: 0, now: () => clock })();
    cache.set("/api/tickets?sprintId=s1", v(staleList));
    clock = NOW + 1;
    cache.set("/api/tickets?sprintId=s2", v([])); // evicts s1
    expect(cache.get("/api/tickets?sprintId=s1")).toBeUndefined(); // -> SWR will refetch on next read

    // 3) The refetch returns fresh server data that STILL lags; the overlay
    //    (which lives outside the cache) re-applies regardless, so no snap-back.
    const refetched = [{ key: "VPL-1", jiraStatus: "To Do" } as unknown as Ticket];
    const afterEviction = applyPendingEdits(refetched, __getPendingEdits(), NOW);
    expect(afterEviction?.[0].jiraStatus).toBe("Done");
  });
});
