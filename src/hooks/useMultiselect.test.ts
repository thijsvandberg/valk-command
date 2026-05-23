import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMultiselect } from "./useMultiselect";

describe("useMultiselect", () => {
  it("starts inactive with empty selection", () => {
    const { result } = renderHook(() => useMultiselect());
    expect(result.current.active).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("activates and deactivates", () => {
    const { result } = renderHook(() => useMultiselect());
    act(() => result.current.activate());
    expect(result.current.active).toBe(true);
    act(() => result.current.deactivate());
    expect(result.current.active).toBe(false);
  });

  it("toggles selection", () => {
    const { result } = renderHook(() => useMultiselect());
    act(() => result.current.activate());
    act(() => result.current.toggle("a"));
    expect(result.current.selectedIds.has("a")).toBe(true);
    act(() => result.current.toggle("a"));
    expect(result.current.selectedIds.has("a")).toBe(false);
  });

  it("selects all and deselects all", () => {
    const { result } = renderHook(() => useMultiselect());
    act(() => result.current.activate());
    act(() => result.current.selectAll(["a", "b", "c"]));
    expect(result.current.selectedIds.size).toBe(3);
    act(() => result.current.deselectAll());
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("clears selection when deactivating", () => {
    const { result } = renderHook(() => useMultiselect());
    act(() => result.current.activate());
    act(() => result.current.toggle("a"));
    act(() => result.current.deactivate());
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.active).toBe(false);
  });

  it("exits on Escape key", () => {
    const { result } = renderHook(() => useMultiselect());
    act(() => result.current.activate());
    act(() => result.current.toggle("a"));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(result.current.active).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
  });
});
