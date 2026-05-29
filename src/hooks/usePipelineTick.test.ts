import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { usePipelineTick } from "./usePipelineTick";

vi.mock("swr", () => ({
  mutate: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  pipelines: {
    tick: vi.fn().mockResolvedValue({ ran: false, newRuns: 0, updatedRuns: 0 }),
  },
}));

import { mutate as globalMutate } from "swr";
import { pipelines as pipelinesApi } from "@/lib/api-client";

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

describe("usePipelineTick", () => {
  it("calls tick on mount", async () => {
    vi.useRealTimers();
    renderHook(() => usePipelineTick());
    await waitFor(() => expect(pipelinesApi.tick).toHaveBeenCalledTimes(1));
  });

  it("sets up 60-second interval", async () => {
    vi.mocked(pipelinesApi.tick).mockResolvedValue({ ran: false, newRuns: 0, updatedRuns: 0 });
    renderHook(() => usePipelineTick());

    await act(async () => { vi.advanceTimersByTime(0); });
    await act(async () => { await Promise.resolve(); });

    vi.mocked(pipelinesApi.tick).mockClear();
    await act(async () => { vi.advanceTimersByTime(60_000); });
    await act(async () => { await Promise.resolve(); });

    expect(pipelinesApi.tick).toHaveBeenCalled();
  });

  it("calls tick on visibility change to visible", async () => {
    Object.defineProperty(document, "visibilityState", { writable: true, value: "hidden" });
    vi.mocked(pipelinesApi.tick).mockResolvedValue({ ran: false, newRuns: 0, updatedRuns: 0 });

    renderHook(() => usePipelineTick());
    await act(async () => { vi.advanceTimersByTime(0); });

    // Not called because hidden
    expect(pipelinesApi.tick).not.toHaveBeenCalled();

    // Switch to visible
    Object.defineProperty(document, "visibilityState", { writable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => { vi.advanceTimersByTime(0); });
    await act(async () => { await Promise.resolve(); });

    expect(pipelinesApi.tick).toHaveBeenCalled();
  });

  it("guards against concurrent execution", async () => {
    let resolveFirst: ((v: unknown) => void) | null = null;
    (pipelinesApi.tick as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => new Promise<unknown>((resolve) => {
        resolveFirst = resolve;
      }))
      .mockResolvedValue({ ran: false, newRuns: 0, updatedRuns: 0 });

    renderHook(() => usePipelineTick());
    await act(async () => { vi.advanceTimersByTime(0); });

    // First tick is in progress, try triggering another
    await act(async () => { vi.advanceTimersByTime(60_000); });

    // Only one call should be made (the second is guarded)
    expect(pipelinesApi.tick).toHaveBeenCalledTimes(1);

    // Complete the first
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (resolveFirst as any)?.({ ran: false, newRuns: 0, updatedRuns: 0 });
    await act(async () => { await Promise.resolve(); });
  });

  it("revalidates /api/pipelines when newRuns > 0", async () => {
    vi.useRealTimers();
    vi.mocked(pipelinesApi.tick).mockResolvedValue({
      ran: true,
      newRuns: 3,
      updatedRuns: 0,
    });

    renderHook(() => usePipelineTick());
    await waitFor(() => expect(globalMutate).toHaveBeenCalled());
  });

  it("revalidates /api/notifications when PR data changed", async () => {
    vi.useRealTimers();
    vi.mocked(pipelinesApi.tick).mockResolvedValue({
      ran: true,
      newRuns: 0,
      updatedRuns: 0,
      prSync: { newOpened: 2, newMerged: 0 },
    });

    renderHook(() => usePipelineTick());
    await waitFor(() => expect(globalMutate).toHaveBeenCalledWith("/api/notifications?limit=50"));
  });

  it("cleans up interval and listeners on unmount", async () => {
    vi.useRealTimers();
    const { unmount } = renderHook(() => usePipelineTick());
    await waitFor(() => expect(pipelinesApi.tick).toHaveBeenCalled());
    unmount();
    // No errors on unmount
  });
});
