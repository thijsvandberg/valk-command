import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRefinementFilters } from "./useRefinementFilters";

const pinnedIds = new Set(["s1", "s2"]);
const sprintNameMap: Record<string, string> = { s1: "Sprint 1", s2: "Sprint 2", s3: "Sprint 3" };

describe("useRefinementFilters", () => {
  it("initial state: hideEstimated is true", () => {
    const { result } = renderHook(() => useRefinementFilters(pinnedIds, sprintNameMap));
    expect(result.current.hideEstimated).toBe(true);
  });

  it("initial state: activeFilterCount is 0", () => {
    const { result } = renderHook(() => useRefinementFilters(pinnedIds, sprintNameMap));
    expect(result.current.activeFilterCount).toBe(0);
  });

  it("initial sprintFilterLabel is 'Pinned' when matching pinned IDs", () => {
    const { result } = renderHook(() => useRefinementFilters(pinnedIds, sprintNameMap));
    expect(result.current.sprintFilterLabel).toBe("Pinned");
  });

  it("sprintFilterLabel is 'All' when effective filter is empty", () => {
    const { result } = renderHook(() => useRefinementFilters(new Set(), sprintNameMap));
    expect(result.current.sprintFilterLabel).toBe("All");
  });

  it("toggleSprintInFilter adds a sprint to filter", () => {
    const { result } = renderHook(() => useRefinementFilters(pinnedIds, sprintNameMap));
    act(() => { result.current.toggleSprintInFilter("s3"); });
    expect(result.current.effectiveSprintFilter.has("s3")).toBe(true);
    expect(result.current.activeFilterCount).toBe(1);
  });

  it("toggleSprintInFilter removes a sprint already in filter", () => {
    const { result } = renderHook(() => useRefinementFilters(pinnedIds, sprintNameMap));
    act(() => { result.current.toggleSprintInFilter("s1"); });
    expect(result.current.effectiveSprintFilter.has("s1")).toBe(false);
  });

  it("sprintFilterLabel shows sprint name when only one selected", () => {
    const { result } = renderHook(() => useRefinementFilters(pinnedIds, sprintNameMap));
    act(() => { result.current.toggleSprintInFilter("s2"); });
    expect(result.current.sprintFilterLabel).toBe("Sprint 1");
  });

  it("sprintFilterLabel shows count when multiple non-pinned selected", () => {
    const { result } = renderHook(() => useRefinementFilters(pinnedIds, sprintNameMap));
    act(() => { result.current.toggleSprintInFilter("s3"); });
    expect(result.current.sprintFilterLabel).toBe("3 sprints");
  });

  it("lastUpdatedLabel defaults to '4 weeks'", () => {
    const { result } = renderHook(() => useRefinementFilters(pinnedIds, sprintNameMap));
    expect(result.current.lastUpdatedLabel).toBe("4 weeks");
  });

  it("lastUpdatedLabel updates when filter changes", () => {
    const { result } = renderHook(() => useRefinementFilters(pinnedIds, sprintNameMap));
    act(() => { result.current.setLastUpdatedFilter("1w"); });
    expect(result.current.lastUpdatedLabel).toBe("1 week");
  });

  it("activeFilterCount increments for each non-default filter", () => {
    const { result } = renderHook(() => useRefinementFilters(pinnedIds, sprintNameMap));
    act(() => { result.current.setHideEstimated(false); });
    expect(result.current.activeFilterCount).toBe(1);

    act(() => { result.current.setEpicFilter(new Set(["EPIC-1"])); });
    expect(result.current.activeFilterCount).toBe(2);

    act(() => { result.current.setLastUpdatedFilter("1w"); });
    expect(result.current.activeFilterCount).toBe(3);

    act(() => { result.current.toggleSprintInFilter("s3"); });
    expect(result.current.activeFilterCount).toBe(4);
  });
});
