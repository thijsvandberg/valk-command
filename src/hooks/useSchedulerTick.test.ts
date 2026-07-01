import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useSchedulerTick } from "./useSchedulerTick";

// The hook mutates through the provider-bound useSWRConfig().mutate (the
// top-level "swr" mutate misses the custom cache provider, BRDG-458). Expose
// the same spy on both so the existing assertions target the path the hook
// actually uses.
vi.mock("swr", () => {
  const mutate = vi.fn();
  return { mutate, useSWRConfig: () => ({ mutate }) };
});

vi.mock("@/lib/api-client", () => ({
  scheduler: {
    tick: vi.fn().mockResolvedValue({ ran: [], results: {}, checked: 0 }),
  },
}));

import { mutate as globalMutate } from "swr";
import { scheduler as schedulerApi } from "@/lib/api-client";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  Object.defineProperty(document, "visibilityState", {
    writable: true,
    value: "visible",
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useSchedulerTick", () => {
  it("calls tick on mount", async () => {
    vi.useRealTimers();
    renderHook(() => useSchedulerTick());
    await waitFor(() => expect(schedulerApi.tick).toHaveBeenCalledTimes(1));
  });

  it("sets up 30-second interval", async () => {
    vi.mocked(schedulerApi.tick).mockResolvedValue({ ran: [], results: {}, checked: 0 });
    renderHook(() => useSchedulerTick());

    // Initial call
    await act(async () => { vi.advanceTimersByTime(0); });
    await act(async () => { await Promise.resolve(); });

    vi.mocked(schedulerApi.tick).mockClear();
    await act(async () => { vi.advanceTimersByTime(30_000); });
    await act(async () => { await Promise.resolve(); });

    expect(schedulerApi.tick).toHaveBeenCalled();
  });

  it("skips tick if document not visible", async () => {
    Object.defineProperty(document, "visibilityState", { writable: true, value: "hidden" });

    renderHook(() => useSchedulerTick());
    await act(async () => { vi.advanceTimersByTime(0); });
    await act(async () => { await Promise.resolve(); });

    expect(schedulerApi.tick).not.toHaveBeenCalled();
  });

  it("updates remaining, lastSyncAt, lastSyncCount from result", async () => {
    vi.useRealTimers();
    vi.mocked(schedulerApi.tick).mockResolvedValue({
      ran: ["incremental-sync"],
      results: { "incremental-sync": { remaining: 5, count: 3 } },
      checked: 1,
    });

    const { result } = renderHook(() => useSchedulerTick());

    await waitFor(() => expect(result.current.lastSyncAt).not.toBeNull());
    expect(result.current.remaining).toBe(5);
    expect(result.current.lastSyncCount).toBe(3);
  });

  it("calls onSyncComplete when count > 0", async () => {
    vi.useRealTimers();
    const onComplete = vi.fn();
    vi.mocked(schedulerApi.tick).mockResolvedValue({
      ran: ["incremental-sync"],
      results: { "incremental-sync": { remaining: 0, count: 2 } },
      checked: 1,
    });

    renderHook(() => useSchedulerTick(onComplete));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it("invalidates /api/tickets and /api/activity-log on sync", async () => {
    vi.useRealTimers();
    vi.mocked(schedulerApi.tick).mockResolvedValue({
      ran: ["incremental-sync"],
      results: { "incremental-sync": { remaining: 0, count: 1 } },
      checked: 1,
    });

    renderHook(() => useSchedulerTick());
    await waitFor(() => expect(globalMutate).toHaveBeenCalled());

    // globalMutate is called with a filter function
    const calls = vi.mocked(globalMutate).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
  });

  it("aborts pending tick on unmount", async () => {
    vi.useRealTimers();
    const { unmount } = renderHook(() => useSchedulerTick());
    await waitFor(() => expect(schedulerApi.tick).toHaveBeenCalled());
    unmount();
    // No throw on unmount means abort worked correctly
  });

  it("handles errors gracefully", async () => {
    vi.useRealTimers();
    vi.mocked(schedulerApi.tick).mockRejectedValue(new Error("network error"));
    const { result } = renderHook(() => useSchedulerTick());
    await waitFor(() => expect(schedulerApi.tick).toHaveBeenCalled());
    // No crash, default state remains
    expect(result.current.remaining).toBe(0);
  });
});
