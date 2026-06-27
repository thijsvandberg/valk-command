import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInboxGroupBy } from "./useInboxGroupBy";
import { buildTeamMap, type RelevanceOptions } from "@/lib/new-stories-grouping";
import type { Team } from "@/lib/sprint-utils";
import type { NewStoryRow } from "@/lib/new-stories-types";

function relevanceOpts(myTeam: Team | null): RelevanceOptions {
  return {
    myTeam,
    teamMap: buildTeamMap([{ displayName: "Alice", teams: ["BT"] as Team[] }]),
    poAccountIds: new Set<string>(),
    poNames: new Set<string>(),
  };
}

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
    // Relative to the current day so the "today" date bucket assertion holds on
    // any run date (bucketing is day-granular UTC). A fixed string would rot.
    jiraCreatedAt: partial.jiraCreatedAt ?? new Date().toISOString(),
    key: partial.key,
  };
}

describe("useInboxGroupBy", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("defaults to relevance grouping when a default team is set (BRDG-413)", () => {
    const rows = [row({ key: "BT-1", sprintName: "BT: 138", reporter: { name: "Bob", initials: "B", color: "#000" } })];
    const { result } = renderHook(() => useInboxGroupBy(rows, relevanceOpts("BT" as Team)));
    expect(result.current.groupBy).toBe("relevance");
    expect(result.current.groups[0].label).toBe("On your team's board");
  });

  it("renders date grouping by default when no team is set (relevance fallback, BRDG-413)", () => {
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

  it("groups by relevance and persists the choice when a team is set (BRDG-372)", () => {
    const rows = [row({ key: "BT-1", sprintName: "BT: 138", reporter: { name: "Bob", initials: "B", color: "#000" } })];
    const { result } = renderHook(() => useInboxGroupBy(rows, relevanceOpts("BT" as Team)));

    act(() => result.current.setGroupBy("relevance"));

    expect(result.current.groupBy).toBe("relevance");
    expect(JSON.parse(sessionStorage.getItem("inbox-group-by")!)).toBe("relevance");
    expect(result.current.groups[0].label).toBe("On your team's board");
  });

  it("falls back to date when relevance is persisted but no team is set, leaving storage intact", () => {
    sessionStorage.setItem("inbox-group-by", JSON.stringify("relevance"));
    const { result } = renderHook(() => useInboxGroupBy([row({ key: "A-1" })], relevanceOpts(null)));

    // Effective mode is date, but the stored choice is preserved so re-adding a
    // team restores Relevance.
    expect(result.current.groupBy).toBe("date");
    expect(result.current.groups[0].key).toBe("today");
    expect(JSON.parse(sessionStorage.getItem("inbox-group-by")!)).toBe("relevance");
  });
});
