// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { enqueue, dequeue, markChecked, remove, stats, _reset } from "./revalidation-queue";

describe("revalidation-queue", () => {
  beforeEach(() => {
    _reset();
  });

  it("enqueues keys and reports correct stats", () => {
    enqueue(["VPL-1", "VPL-2", "VPL-3"]);
    expect(stats()).toMatchObject({ queueSize: 3 });
  });

  it("does not enqueue duplicate keys", () => {
    enqueue(["VPL-1", "VPL-2"]);
    enqueue(["VPL-2", "VPL-3"]);
    expect(stats()).toMatchObject({ queueSize: 3 });
  });

  it("dequeues oldest entries first", () => {
    vi.useFakeTimers();
    enqueue(["VPL-1"]);
    vi.advanceTimersByTime(100);
    enqueue(["VPL-2"]);
    vi.advanceTimersByTime(100);
    enqueue(["VPL-3"]);

    const batch = dequeue(2);
    expect(batch).toEqual(["VPL-1", "VPL-2"]);
    expect(stats()).toMatchObject({ queueSize: 1 });

    vi.useRealTimers();
  });

  it("dequeue removes entries from queue", () => {
    enqueue(["VPL-1", "VPL-2"]);
    dequeue(2);
    expect(stats()).toMatchObject({ queueSize: 0 });
  });

  it("respects 24h cooldown after markChecked", () => {
    enqueue(["VPL-1", "VPL-2"]);
    const batch = dequeue(2);
    markChecked(batch);

    // Re-enqueue same keys: should be skipped due to cooldown
    enqueue(["VPL-1", "VPL-2"]);
    expect(stats()).toMatchObject({ queueSize: 0, cooldownSize: 2 });
  });

  it("allows re-enqueue after cooldown expires", () => {
    vi.useFakeTimers();
    enqueue(["VPL-1"]);
    markChecked(dequeue(1));

    // Advance past 24h cooldown
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);

    enqueue(["VPL-1"]);
    expect(stats()).toMatchObject({ queueSize: 1 });

    vi.useRealTimers();
  });

  it("remove clears from both queue and cooldown", () => {
    enqueue(["VPL-1", "VPL-2"]);
    markChecked(["VPL-2"]);
    remove(["VPL-1", "VPL-2"]);

    expect(stats()).toMatchObject({ queueSize: 0, cooldownSize: 0 });
  });

  it("returns empty array when queue is empty", () => {
    expect(dequeue(10)).toEqual([]);
  });

  it("prunes lastChecked entries past the cooldown so cooldownSize stays bounded", () => {
    vi.useFakeTimers();

    // Check 50 distinct keys; all sit in the cooldown map.
    for (let i = 0; i < 50; i++) markChecked([`VPL-${i}`]);
    expect(stats().cooldownSize).toBe(50);

    // Advance past the 24h cooldown; the next markChecked prunes the expired batch
    // (those keys are re-checkable again, so dropping them changes nothing).
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    markChecked(["VPL-new"]);
    expect(stats().cooldownSize).toBe(1);

    vi.useRealTimers();
  });

  it("stays bounded across many markChecked cycles spanning past the cooldown", () => {
    vi.useFakeTimers();

    // 20 cycles of 100 distinct keys, each a full cooldown apart. Without pruning
    // this Map would hold 2000 permanent entries; with age-based prune only the
    // most recent batch survives.
    for (let cycle = 0; cycle < 20; cycle++) {
      const keys = Array.from({ length: 100 }, (_, i) => `C${cycle}-${i}`);
      markChecked(keys);
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    }

    expect(stats().cooldownSize).toBeLessThanOrEqual(100);

    vi.useRealTimers();
  });
});
