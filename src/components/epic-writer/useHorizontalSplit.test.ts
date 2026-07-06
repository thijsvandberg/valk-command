import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHorizontalSplit } from "./useHorizontalSplit";

describe("useHorizontalSplit (BRDG-484)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to the given left percentage", () => {
    const { result } = renderHook(() => useHorizontalSplit("ew:X:split", 60));
    expect(result.current.leftPct).toBe(60);
    expect(result.current.dragging).toBe(false);
  });

  it("persists the ratio to localStorage under the storage key", () => {
    renderHook(() => useHorizontalSplit("ew:VPL-1:split", 55));
    expect(localStorage.getItem("ew:VPL-1:split")).toBe("55");
  });

  it("reads a persisted ratio back on mount, clamped to bounds", () => {
    localStorage.setItem("ew:VPL-2:split", "40");
    const { result } = renderHook(() => useHorizontalSplit("ew:VPL-2:split", 55));
    expect(result.current.leftPct).toBe(40);
  });

  it("clamps an out-of-range persisted ratio into [25, 75]", () => {
    localStorage.setItem("ew:VPL-3:split", "95");
    const { result } = renderHook(() => useHorizontalSplit("ew:VPL-3:split", 55));
    expect(result.current.leftPct).toBe(75);
  });

  it("enters dragging state on handle mouse down", () => {
    const { result } = renderHook(() => useHorizontalSplit("ew:VPL-4:split", 55));
    act(() => {
      result.current.onHandleMouseDown({ preventDefault() {} } as unknown as React.MouseEvent);
    });
    expect(result.current.dragging).toBe(true);
    // Clean up the global drag state.
    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });
    expect(result.current.dragging).toBe(false);
  });
});
