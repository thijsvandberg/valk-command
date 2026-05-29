import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFocusMode } from "./useFocusMode";

describe("useFocusMode", () => {
  it("starts with focusMode false", () => {
    const { result } = renderHook(() => useFocusMode());
    expect(result.current.focusMode).toBe(false);
  });

  it("toggleFocusMode flips state", () => {
    const { result } = renderHook(() => useFocusMode());
    act(() => result.current.toggleFocusMode());
    expect(result.current.focusMode).toBe(true);
    act(() => result.current.toggleFocusMode());
    expect(result.current.focusMode).toBe(false);
  });

  it("exitFocusMode sets state to false", () => {
    const { result } = renderHook(() => useFocusMode());
    act(() => result.current.toggleFocusMode());
    expect(result.current.focusMode).toBe(true);
    act(() => result.current.exitFocusMode());
    expect(result.current.focusMode).toBe(false);
  });

  it("exitFocusMode is a no-op when already false", () => {
    const { result } = renderHook(() => useFocusMode());
    act(() => result.current.exitFocusMode());
    expect(result.current.focusMode).toBe(false);
  });

  it("responds to Cmd+. keyboard shortcut", () => {
    const { result } = renderHook(() => useFocusMode());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: ".", metaKey: true }));
    });
    expect(result.current.focusMode).toBe(true);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: ".", metaKey: true }));
    });
    expect(result.current.focusMode).toBe(false);
  });

  it("responds to Ctrl+. keyboard shortcut", () => {
    const { result } = renderHook(() => useFocusMode());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: ".", ctrlKey: true }));
    });
    expect(result.current.focusMode).toBe(true);
  });

  it("ignores . without modifier key", () => {
    const { result } = renderHook(() => useFocusMode());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "." }));
    });
    expect(result.current.focusMode).toBe(false);
  });
});
