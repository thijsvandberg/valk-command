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
});
