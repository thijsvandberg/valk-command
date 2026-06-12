import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useChangeHighlight } from "./useChangeHighlight";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useChangeHighlight", () => {
  it("activates triggered kinds", () => {
    const { result } = renderHook(() => useChangeHighlight());
    act(() => result.current.trigger(["status", "comment"]));
    expect(result.current.activeKinds.has("status")).toBe(true);
    expect(result.current.activeKinds.has("comment")).toBe(true);
    expect(result.current.activeKinds.has("points")).toBe(false);
  });

  it("deactivates kinds after the duration", () => {
    const { result } = renderHook(() => useChangeHighlight(1000));
    act(() => result.current.trigger(["status"]));
    act(() => { vi.advanceTimersByTime(999); });
    expect(result.current.activeKinds.has("status")).toBe(true);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.activeKinds.has("status")).toBe(false);
  });

  it("a re-trigger extends the active window", () => {
    const { result } = renderHook(() => useChangeHighlight(1000));
    act(() => result.current.trigger(["status"]));
    act(() => { vi.advanceTimersByTime(600); });
    act(() => result.current.trigger(["status"]));
    act(() => { vi.advanceTimersByTime(600); });
    expect(result.current.activeKinds.has("status")).toBe(true);
    act(() => { vi.advanceTimersByTime(400); });
    expect(result.current.activeKinds.has("status")).toBe(false);
  });

  it("expires kinds independently", () => {
    const { result } = renderHook(() => useChangeHighlight(1000));
    act(() => result.current.trigger(["status"]));
    act(() => { vi.advanceTimersByTime(500); });
    act(() => result.current.trigger(["comment"]));
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current.activeKinds.has("status")).toBe(false);
    expect(result.current.activeKinds.has("comment")).toBe(true);
  });

  it("an empty trigger is a no-op", () => {
    const { result } = renderHook(() => useChangeHighlight());
    act(() => result.current.trigger([]));
    expect(result.current.activeKinds.size).toBe(0);
  });

  it("clears timers on unmount", () => {
    const { result, unmount } = renderHook(() => useChangeHighlight(1000));
    act(() => result.current.trigger(["status"]));
    unmount();
    expect(() => { vi.advanceTimersByTime(2000); }).not.toThrow();
  });
});
