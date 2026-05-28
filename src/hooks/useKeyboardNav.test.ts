import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKeyboardNav } from "./useKeyboardNav";

function fireKey(handler: (e: React.KeyboardEvent) => void, key: string) {
  const prevented = { current: false };
  handler({
    key,
    preventDefault: () => { prevented.current = true; },
  } as unknown as React.KeyboardEvent);
  return prevented.current;
}

describe("useKeyboardNav", () => {
  it("ArrowDown advances from -1 to 0", () => {
    const { result } = renderHook(() => useKeyboardNav(5));

    act(() => {
      fireKey(result.current.handlers.onKeyDown, "ArrowDown");
    });

    expect(result.current.activeIndex).toBe(0);
  });

  it("ArrowDown advances sequentially", () => {
    const { result } = renderHook(() => useKeyboardNav(5));

    act(() => { fireKey(result.current.handlers.onKeyDown, "ArrowDown"); });
    act(() => { fireKey(result.current.handlers.onKeyDown, "ArrowDown"); });

    expect(result.current.activeIndex).toBe(1);
  });

  it("ArrowDown wraps from last to first when loop is true", () => {
    const { result } = renderHook(() => useKeyboardNav(3));

    act(() => {
      // Navigate to index 2
      fireKey(result.current.handlers.onKeyDown, "ArrowDown");
      fireKey(result.current.handlers.onKeyDown, "ArrowDown");
      fireKey(result.current.handlers.onKeyDown, "ArrowDown");
      // Wrap to 0
      fireKey(result.current.handlers.onKeyDown, "ArrowDown");
    });

    expect(result.current.activeIndex).toBe(0);
  });

  it("ArrowUp wraps from first to last when loop is true", () => {
    const { result } = renderHook(() => useKeyboardNav(3));

    act(() => {
      // Go to 0 first
      fireKey(result.current.handlers.onKeyDown, "ArrowDown");
      // ArrowUp should wrap to last (2)
      fireKey(result.current.handlers.onKeyDown, "ArrowUp");
    });

    expect(result.current.activeIndex).toBe(2);
  });

  it("Home goes to first enabled index", () => {
    const disabled = new Set([0]);
    const { result } = renderHook(() => useKeyboardNav(5, disabled));

    act(() => {
      fireKey(result.current.handlers.onKeyDown, "Home");
    });

    expect(result.current.activeIndex).toBe(1);
  });

  it("End goes to last enabled index", () => {
    const disabled = new Set([4]);
    const { result } = renderHook(() => useKeyboardNav(5, disabled));

    act(() => {
      fireKey(result.current.handlers.onKeyDown, "End");
    });

    expect(result.current.activeIndex).toBe(3);
  });

  it("skips disabled indices when navigating", () => {
    const disabled = new Set([1]);
    const { result } = renderHook(() => useKeyboardNav(4, disabled));

    act(() => { fireKey(result.current.handlers.onKeyDown, "ArrowDown"); }); // -> 0
    act(() => { fireKey(result.current.handlers.onKeyDown, "ArrowDown"); }); // -> 2 (skips 1)

    expect(result.current.activeIndex).toBe(2);
  });

  it("Enter calls onSelect with current activeIndex", () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() =>
      useKeyboardNav(5, undefined, { onSelect }),
    );

    act(() => { fireKey(result.current.handlers.onKeyDown, "ArrowDown"); }); // -> 0
    act(() => { fireKey(result.current.handlers.onKeyDown, "Enter"); });

    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it("Enter does nothing when activeIndex is -1", () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() =>
      useKeyboardNav(5, undefined, { onSelect }),
    );

    act(() => {
      fireKey(result.current.handlers.onKeyDown, "Enter");
    });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("Escape calls onEscape", () => {
    const onEscape = vi.fn();
    const { result } = renderHook(() =>
      useKeyboardNav(5, undefined, { onEscape }),
    );

    act(() => {
      fireKey(result.current.handlers.onKeyDown, "Escape");
    });

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("setActiveIndex works for mouse hover sync", () => {
    const { result } = renderHook(() => useKeyboardNav(5));

    act(() => {
      result.current.setActiveIndex(3);
    });

    expect(result.current.activeIndex).toBe(3);
  });

  it("does nothing when enabled is false", () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() =>
      useKeyboardNav(5, undefined, { onSelect, enabled: false }),
    );

    act(() => {
      fireKey(result.current.handlers.onKeyDown, "ArrowDown");
      fireKey(result.current.handlers.onKeyDown, "Enter");
    });

    expect(result.current.activeIndex).toBe(-1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("resets activeIndex when enabled becomes false", () => {
    let enabled = true;
    const { result, rerender } = renderHook(() =>
      useKeyboardNav(5, undefined, { enabled }),
    );

    act(() => {
      fireKey(result.current.handlers.onKeyDown, "ArrowDown");
    });
    expect(result.current.activeIndex).toBe(0);

    enabled = false;
    rerender();
    expect(result.current.activeIndex).toBe(-1);
  });

  it("handles empty item count", () => {
    const { result } = renderHook(() => useKeyboardNav(0));

    act(() => {
      fireKey(result.current.handlers.onKeyDown, "ArrowDown");
    });

    expect(result.current.activeIndex).toBe(-1);
  });
});
