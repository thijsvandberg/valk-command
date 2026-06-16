import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInboxGroupBy } from "./useInboxGroupBy";
import type { NewStoryRow } from "@/lib/new-stories-types";

function row(partial: Partial<NewStoryRow> & { key: string }): NewStoryRow {
  return {
    title: partial.key,
    type: "story",
    jiraStatus: "TO DO",
    epic: partial.epic ?? null,
    epicKey: null,
    storyPoints: null,
    assignee: null,
    reporter: partial.reporter ?? null,
    sprintName: partial.sprintName ?? null,
    jiraCreatedAt: partial.jiraCreatedAt ?? "2026-06-16T08:00:00Z",
    key: partial.key,
  };
}

describe("useInboxGroupBy", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("defaults to date grouping", () => {
    const { result } = renderHook(() => useInboxGroupBy([row({ key: "A-1" })]));
    expect(result.current.groupBy).toBe("date");
    expect(result.current.groups[0].key).toBe("today");
  });

  it("persists group-by under its own key without touching the board's key", () => {
    sessionStorage.setItem("sprint-board-group-by", JSON.stringify("sprint"));
    const { result } = renderHook(() => useInboxGroupBy([row({ key: "A-1", epic: "Auth" })]));

    act(() => result.current.setGroupBy("epic"));

    expect(JSON.parse(sessionStorage.getItem("inbox-group-by")!)).toBe("epic");
    // The board's grouping choice is untouched.
    expect(JSON.parse(sessionStorage.getItem("sprint-board-group-by")!)).toBe("sprint");
    expect(result.current.groupBy).toBe("epic");
    expect(result.current.groups[0].label).toBe("Auth");
  });

  it("persists collapsed groups independently of the board", () => {
    const { result } = renderHook(() => useInboxGroupBy([row({ key: "A-1" })]));

    act(() => result.current.toggleCollapse("today"));
    expect(result.current.collapsedGroups.has("today")).toBe(true);
    expect(JSON.parse(sessionStorage.getItem("inbox-collapsed-groups")!)).toEqual(["today"]);
    expect(sessionStorage.getItem("sprint-board-collapsed-groups")).toBeNull();

    act(() => result.current.toggleCollapse("today"));
    expect(result.current.collapsedGroups.has("today")).toBe(false);
  });
});
