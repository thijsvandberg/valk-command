import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useToast } from "./useToast";

describe("useToast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts with no toast", () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toast).toBeNull();
    expect(result.current.toastLoading).toBe(false);
  });

  it("shows a toast and auto-dismisses after the default duration", () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast("hi"));
    expect(result.current.toast).toBe("hi");
    act(() => vi.advanceTimersByTime(2999));
    expect(result.current.toast).toBe("hi");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.toast).toBeNull();
  });

  it("honors a custom duration", () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast("hi", 5000));
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.toast).toBe("hi");
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.toast).toBeNull();
  });

  it("keeps the toast indefinitely when durationMs <= 0", () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast("persist", 0));
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.toast).toBe("persist");
  });

  it("sets loading and resets it on the next non-loading toast", () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast("loading...", 0, { loading: true }));
    expect(result.current.toastLoading).toBe(true);
    act(() => result.current.showToast("done"));
    expect(result.current.toastLoading).toBe(false);
  });

  it("dismissToast hides immediately and resets loading", () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast("loading...", 0, { loading: true }));
    act(() => result.current.dismissToast());
    expect(result.current.toast).toBeNull();
    expect(result.current.toastLoading).toBe(false);
  });

  it("resets the timer when a new toast replaces an old one", () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast("first"));
    act(() => vi.advanceTimersByTime(2000));
    act(() => result.current.showToast("second"));
    // The original 3000ms timer would have fired at +1000ms here; assert it did not.
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.toast).toBe("second");
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.toast).toBeNull();
  });

  it("clears the pending timer on unmount", () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const { result, unmount } = renderHook(() => useToast());
    act(() => result.current.showToast("hi"));
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });

  it("keeps stable showToast/dismissToast references across rerenders", () => {
    const { result, rerender } = renderHook(() => useToast());
    const firstShow = result.current.showToast;
    const firstDismiss = result.current.dismissToast;
    rerender();
    expect(result.current.showToast).toBe(firstShow);
    expect(result.current.dismissToast).toBe(firstDismiss);
  });
});
