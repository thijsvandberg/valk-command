import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSearchHistory } from "./useSearchHistory";

// Minimal localStorage mock
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
};

vi.stubGlobal("localStorage", localStorageMock);

describe("useSearchHistory", () => {
  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k]);
  });

  it("starts with empty history", () => {
    const { result } = renderHook(() => useSearchHistory());
    expect(result.current.history).toEqual([]);
  });

  it("adds a search query to history", () => {
    const { result } = renderHook(() => useSearchHistory());
    act(() => result.current.addSearch("auth flow"));
    expect(result.current.history).toContain("auth flow");
  });

  it("does not add queries shorter than 2 chars", () => {
    const { result } = renderHook(() => useSearchHistory());
    act(() => result.current.addSearch("a"));
    expect(result.current.history).toHaveLength(0);
  });

  it("deduplicates — moves existing query to front", () => {
    const { result } = renderHook(() => useSearchHistory());
    act(() => result.current.addSearch("auth"));
    act(() => result.current.addSearch("payment"));
    act(() => result.current.addSearch("auth"));
    expect(result.current.history[0]).toBe("auth");
    expect(result.current.history.filter((q) => q === "auth")).toHaveLength(1);
  });

  it("caps history at 5 entries", () => {
    const { result } = renderHook(() => useSearchHistory());
    for (let i = 0; i < 7; i++) {
      act(() => result.current.addSearch(`query ${i}`));
    }
    expect(result.current.history).toHaveLength(5);
  });

  it("most recent query is first", () => {
    const { result } = renderHook(() => useSearchHistory());
    act(() => result.current.addSearch("first"));
    act(() => result.current.addSearch("second"));
    expect(result.current.history[0]).toBe("second");
  });

  it("clearHistory empties the list", () => {
    const { result } = renderHook(() => useSearchHistory());
    act(() => result.current.addSearch("auth"));
    act(() => result.current.clearHistory());
    expect(result.current.history).toHaveLength(0);
  });
});
