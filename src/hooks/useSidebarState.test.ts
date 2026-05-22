import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSidebarState, MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH, COLLAPSED_WIDTH } from "./useSidebarState";

const mockStorage: Record<string, string> = {};
beforeEach(() => {
  Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => { mockStorage[key] = val; },
      removeItem: (key: string) => { delete mockStorage[key]; },
      clear: () => Object.keys(mockStorage).forEach((k) => delete mockStorage[k]),
    },
    writable: true,
  });
  vi.restoreAllMocks();
});

describe("useSidebarState", () => {
  it("starts with default values", () => {
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.collapsed).toBe(false);
    expect(result.current.width).toBe(DEFAULT_WIDTH);
    expect(result.current.effectiveWidth).toBe(DEFAULT_WIDTH);
  });

  it("toggleCollapsed flips the state", () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => result.current.toggleCollapsed());
    expect(result.current.collapsed).toBe(true);
    expect(result.current.effectiveWidth).toBe(COLLAPSED_WIDTH);
  });

  it("persists collapsed state to localStorage", () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => result.current.toggleCollapsed());
    expect(JSON.parse(mockStorage["bridge:sidebar-collapsed"])).toBe(true);
  });

  it("setWidth clamps to min", () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => result.current.setWidth(100));
    expect(result.current.width).toBe(MIN_WIDTH);
  });

  it("setWidth clamps to max", () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => result.current.setWidth(999));
    expect(result.current.width).toBe(MAX_WIDTH);
  });

  it("persists width to localStorage", () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => result.current.setWidth(350));
    expect(JSON.parse(mockStorage["bridge:sidebar-width"])).toBe(350);
  });

  it("resetWidth restores default", () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => result.current.setWidth(400));
    act(() => result.current.resetWidth());
    expect(result.current.width).toBe(DEFAULT_WIDTH);
  });

  it("reads persisted collapsed state on mount", () => {
    mockStorage["bridge:sidebar-collapsed"] = "true";
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.collapsed).toBe(true);
  });

  it("reads persisted width on mount", () => {
    mockStorage["bridge:sidebar-width"] = "400";
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.width).toBe(400);
  });

  it("responds to Cmd+B keyboard shortcut", () => {
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.collapsed).toBe(false);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", metaKey: true }));
    });
    expect(result.current.collapsed).toBe(true);
  });

  it("responds to Ctrl+B keyboard shortcut", () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true }));
    });
    expect(result.current.collapsed).toBe(true);
  });

  it("ignores B without modifier", () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "b" }));
    });
    expect(result.current.collapsed).toBe(false);
  });
});
