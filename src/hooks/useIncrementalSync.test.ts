import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useIncrementalSync } from "./useIncrementalSync";

vi.mock("swr", () => ({
  mutate: vi.fn(),
}));

import { mutate as globalMutate } from "swr";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(globalMutate).mockClear();
  Object.defineProperty(document, "visibilityState", {
    writable: true,
    value: "visible",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useIncrementalSync", () => {
  it("calls sync endpoint on mount when tab is visible", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, count: 0, remaining: 5 }),
    } as Response);

    const { result } = renderHook(() => useIncrementalSync());

    await waitFor(() => expect(result.current.lastSyncAt).not.toBeNull());

    expect(fetch).toHaveBeenCalledWith("/api/jira/sync-incremental", {
      method: "POST",
      signal: expect.any(AbortSignal),
    });
    expect(result.current.remaining).toBe(5);
    expect(result.current.lastSyncCount).toBe(0);
  });

  it("does not call sync when tab is hidden", async () => {
    Object.defineProperty(document, "visibilityState", {
      writable: true,
      value: "hidden",
    });

    vi.spyOn(global, "fetch");

    renderHook(() => useIncrementalSync());

    // Give it a tick to attempt
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it("triggers SWR mutate and callback when count > 0", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, count: 3, remaining: 2, tickets: ["VPL-1"] }),
    } as Response);

    const onSyncComplete = vi.fn();
    const { result } = renderHook(() => useIncrementalSync(onSyncComplete));

    await waitFor(() => expect(result.current.lastSyncAt).not.toBeNull());

    expect(result.current.lastSyncCount).toBe(3);
    expect(result.current.remaining).toBe(2);
    expect(globalMutate).toHaveBeenCalled();
    expect(onSyncComplete).toHaveBeenCalledTimes(1);
  });

  it("handles skipped response without triggering mutate", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, skipped: true, count: 0, remaining: 10 }),
    } as Response);

    const onSyncComplete = vi.fn();
    const { result } = renderHook(() => useIncrementalSync(onSyncComplete));

    await waitFor(() => expect(result.current.lastSyncAt).not.toBeNull());

    expect(result.current.remaining).toBe(10);
    expect(result.current.lastSyncCount).toBe(0);
    expect(globalMutate).not.toHaveBeenCalled();
    expect(onSyncComplete).not.toHaveBeenCalled();
  });

  it("does not mutate when count is 0", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, count: 0, remaining: 0 }),
    } as Response);

    const onSyncComplete = vi.fn();
    const { result } = renderHook(() => useIncrementalSync(onSyncComplete));

    await waitFor(() => expect(result.current.lastSyncAt).not.toBeNull());

    expect(globalMutate).not.toHaveBeenCalled();
    expect(onSyncComplete).not.toHaveBeenCalled();
  });

  it("handles non-ok response silently", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const { result } = renderHook(() => useIncrementalSync());

    // Wait a tick for the async call to resolve
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // State should remain at defaults since a non-ok response is silently ignored
    expect(result.current.lastSyncAt).toBeNull();
    expect(result.current.remaining).toBe(0);
    expect(result.current.lastSyncCount).toBe(0);
  });

  it("handles fetch rejection silently", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useIncrementalSync());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.lastSyncAt).toBeNull();
    expect(result.current.remaining).toBe(0);
  });

  it("fires sync on visibility change to visible", async () => {
    // First mount call
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, count: 0, remaining: 5 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, count: 2, remaining: 3 }),
      } as Response);

    const { result } = renderHook(() => useIncrementalSync());

    await waitFor(() => expect(result.current.lastSyncAt).not.toBeNull());
    expect(fetch).toHaveBeenCalledTimes(1);

    // Simulate tab becoming visible
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await new Promise((r) => setTimeout(r, 50));
    });

    await waitFor(() => expect(result.current.lastSyncCount).toBe(2));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("prevents concurrent sync runs", async () => {
    let resolveFirst: (v: Response) => void;
    const firstCall = new Promise<Response>((r) => { resolveFirst = r; });

    vi.spyOn(global, "fetch")
      .mockReturnValueOnce(firstCall as Promise<Response>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, count: 1, remaining: 0 }),
      } as Response);

    const { result } = renderHook(() => useIncrementalSync());

    // First call is in-flight, fire visibility change to trigger a second attempt
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await new Promise((r) => setTimeout(r, 50));
    });

    // Only 1 call should have been made because runningRef prevents concurrent runs
    expect(fetch).toHaveBeenCalledTimes(1);

    // Resolve the first call
    await act(async () => {
      resolveFirst!({
        ok: true,
        json: async () => ({ ok: true, count: 0, remaining: 0 }),
      } as Response);
      await new Promise((r) => setTimeout(r, 50));
    });

    await waitFor(() => expect(result.current.lastSyncAt).not.toBeNull());
  });
});
