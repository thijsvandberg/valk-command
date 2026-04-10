import { describe, it, expect, beforeEach } from "vitest";
import { cache } from "./cache";

beforeEach(() => {
  cache.flush();
});

describe("cache", () => {
  it("stores and retrieves values", () => {
    cache.set("key1", { data: "hello" }, 60_000);
    expect(cache.get("key1")).toEqual({ data: "hello" });
  });

  it("returns undefined for missing keys", () => {
    expect(cache.get("missing")).toBeUndefined();
  });

  it("expires entries after TTL", async () => {
    cache.set("short", "value", 50);
    expect(cache.get("short")).toBe("value");
    await new Promise((r) => setTimeout(r, 60));
    expect(cache.get("short")).toBeUndefined();
  });

  it("invalidates by prefix", () => {
    cache.set("/api/tickets?sprintId=1", "a", 60_000);
    cache.set("/api/tickets?sprintId=2", "b", 60_000);
    cache.set("/api/jira/sprints", "c", 60_000);

    const removed = cache.invalidate("/api/tickets");
    expect(removed).toBe(2);
    expect(cache.get("/api/tickets?sprintId=1")).toBeUndefined();
    expect(cache.get("/api/jira/sprints")).toBe("c");
  });

  it("invalidates by regex", () => {
    cache.set("/api/tickets/ABC-1", "a", 60_000);
    cache.set("/api/tickets/ABC-2", "b", 60_000);
    const removed = cache.invalidate(/\/api\/tickets\/ABC-1/);
    expect(removed).toBe(1);
    expect(cache.get("/api/tickets/ABC-2")).toBe("b");
  });

  it("flush clears everything and resets stats", () => {
    cache.set("a", 1, 60_000);
    cache.get("a");
    cache.flush();
    expect(cache.get("a")).toBeUndefined();
    expect(cache.stats().hits).toBe(0);
  });

  it("tracks hit and miss stats", () => {
    cache.set("hit-me", "yes", 60_000);
    cache.get("hit-me");
    cache.get("miss-me");
    const stats = cache.stats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.entries).toBe(1);
  });

  it("evicts LRU entry when exceeding max size", () => {
    for (let i = 0; i < 201; i++) {
      cache.set(`key-${i}`, i, 60_000);
    }
    // Should have evicted the least recently accessed entry
    expect(cache.stats().entries).toBeLessThanOrEqual(200);
  });
});
