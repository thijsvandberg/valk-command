import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePersistedSplit } from "./usePersistedSplit";

const KEY = "test:split";

describe("usePersistedSplit", () => {
  afterEach(() => localStorage.clear());

  it("defaults to the initial value when nothing is stored", () => {
    const { result } = renderHook(() => usePersistedSplit(KEY, { min: 30, max: 70, initial: 55 }));
    expect(result.current.splitPct).toBe(55);
  });

  it("reads a stored value inside the allowed range", () => {
    localStorage.setItem(KEY, "42");
    const { result } = renderHook(() => usePersistedSplit(KEY, { min: 30, max: 70 }));
    expect(result.current.splitPct).toBe(42);
  });

  it("ignores a stored value outside the allowed range", () => {
    localStorage.setItem(KEY, "90");
    const { result } = renderHook(() => usePersistedSplit(KEY, { min: 30, max: 70, initial: 50 }));
    expect(result.current.splitPct).toBe(50);
  });

  it("exposes a ref and a drag handler", () => {
    const { result } = renderHook(() => usePersistedSplit(KEY, { min: 30, max: 70 }));
    expect(result.current.splitRef).toBeDefined();
    expect(typeof result.current.handleSplitDrag).toBe("function");
  });
});
