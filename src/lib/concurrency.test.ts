import { describe, it, expect } from "vitest";
import { mapWithConcurrency } from "./concurrency";

describe("mapWithConcurrency", () => {
  it("preserves input order regardless of completion order", async () => {
    const items = [50, 10, 30, 0, 20];
    const out = await mapWithConcurrency(items, 3, async (ms, i) => {
      // Later items resolve sooner, so completion order differs from input order.
      await new Promise((r) => setTimeout(r, ms));
      return { i, ms };
    });
    expect(out.map((o) => o.i)).toEqual([0, 1, 2, 3, 4]);
    expect(out.map((o) => o.ms)).toEqual(items);
  });

  it("never runs more than `limit` tasks at once", async () => {
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    await mapWithConcurrency(items, 4, async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    });
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it("passes the index to the worker", async () => {
    const out = await mapWithConcurrency(["a", "b", "c"], 2, async (item, i) => `${i}:${item}`);
    expect(out).toEqual(["0:a", "1:b", "2:c"]);
  });

  it("returns an empty array for no items", async () => {
    const out = await mapWithConcurrency([], 5, async (x) => x);
    expect(out).toEqual([]);
  });

  it("treats a limit below 1 as a single worker", async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3], 0, async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
    });
    expect(peak).toBe(1);
  });
});
