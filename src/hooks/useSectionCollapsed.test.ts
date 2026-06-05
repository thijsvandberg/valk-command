import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSectionCollapsed } from "./useSectionCollapsed";
import {
  __resetSectionCollapseStore,
  isSectionCollapsed,
} from "@/lib/section-collapse-store";

// The store is module-level, so reset both it and localStorage between cases.
afterEach(() => {
  __resetSectionCollapseStore();
});

describe("useSectionCollapsed", () => {
  it("defaults every section to expanded (not collapsed)", () => {
    const { result } = renderHook(() => useSectionCollapsed());
    expect(result.current.isCollapsed("attachments")).toBe(false);
    expect(result.current.isCollapsed("anything")).toBe(false);
  });

  it("toggle collapses then expands a section", () => {
    const { result } = renderHook(() => useSectionCollapsed());
    act(() => result.current.toggle("attachments"));
    expect(result.current.isCollapsed("attachments")).toBe(true);
    act(() => result.current.toggle("attachments"));
    expect(result.current.isCollapsed("attachments")).toBe(false);
  });

  it("persists collapse state to localStorage", () => {
    const { result } = renderHook(() => useSectionCollapsed());
    act(() => result.current.toggle("jira-comments"));
    const raw = window.localStorage.getItem("bridge:section-collapsed");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string)).toEqual({ "jira-comments": true });
  });

  it("does not persist a section once it is expanded again", () => {
    const { result } = renderHook(() => useSectionCollapsed());
    act(() => result.current.toggle("confluence"));
    act(() => result.current.toggle("confluence"));
    const raw = window.localStorage.getItem("bridge:section-collapsed");
    expect(JSON.parse(raw as string)).toEqual({});
  });

  it("shares state across separate hook instances (same document)", () => {
    const a = renderHook(() => useSectionCollapsed());
    const b = renderHook(() => useSectionCollapsed());

    act(() => a.result.current.toggle("po-comments"));

    // The second, independent consumer reflects the first one's toggle.
    expect(b.result.current.isCollapsed("po-comments")).toBe(true);
  });

  it("keeps sections independent from each other", () => {
    const { result } = renderHook(() => useSectionCollapsed());
    act(() => result.current.toggle("subtasks"));
    expect(result.current.isCollapsed("subtasks")).toBe(true);
    expect(result.current.isCollapsed("linked-issues")).toBe(false);
  });

  it("reset clears in-memory and persisted state", () => {
    const { result } = renderHook(() => useSectionCollapsed());
    act(() => result.current.toggle("attachments"));
    __resetSectionCollapseStore();
    expect(isSectionCollapsed("attachments")).toBe(false);
    expect(window.localStorage.getItem("bridge:section-collapsed")).toBeNull();
  });
});
