import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { useGroupBy } from "./useGroupBy";
import type { Ticket, Sprint } from "@/types/ticket";

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    key: "VPL-1",
    title: "Test",
    type: "story",
    jiraStatus: "TO DO",
    storyPoints: null,
    assignee: null,
    epic: null,
    epicKey: null,
    flagged: false,
    readiness: null,
    poStatus: null,
    qualityScore: null,
    editState: "clean",
    notes: "",
    sprintId: "s1",
    businessValue: null,
    ...overrides,
  };
}

function makeSprint(id: string, name: string, state: Sprint["state"] = "future"): Sprint {
  return { id, name, dateRange: "", state, ticketCount: 0, startDate: null, endDate: null, goal: null };
}

const SPRINTS: Sprint[] = [makeSprint("s1", "Sprint One", "active"), makeSprint("s2", "Sprint Two")];
const TICKETS: Ticket[] = [
  makeTicket({ key: "VPL-1", sprintId: "s1" }),
  makeTicket({ key: "VPL-2", sprintId: "s2" }),
];
const NAME_MAP = { s1: "Sprint One", s2: "Sprint Two" };

describe("useGroupBy collapse/expand all", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  function setup() {
    return renderHook(() => useGroupBy(TICKETS, SPRINTS, NAME_MAP, true));
  }

  it("starts with all groups expanded", () => {
    const { result } = setup();
    act(() => result.current.setGroupBy("sprint"));
    expect(result.current.groups.length).toBe(2);
    expect(result.current.allCollapsed).toBe(false);
    expect(result.current.collapsedGroups.size).toBe(0);
  });

  it("collapses every group when toggled from an expanded state", () => {
    const { result } = setup();
    act(() => result.current.setGroupBy("sprint"));
    act(() => result.current.toggleAllGroups());
    expect(result.current.allCollapsed).toBe(true);
    expect(result.current.collapsedGroups.has("s1")).toBe(true);
    expect(result.current.collapsedGroups.has("s2")).toBe(true);
  });

  it("expands every group when toggled from a fully-collapsed state", () => {
    const { result } = setup();
    act(() => result.current.setGroupBy("sprint"));
    act(() => result.current.toggleAllGroups());
    act(() => result.current.toggleAllGroups());
    expect(result.current.allCollapsed).toBe(false);
    expect(result.current.collapsedGroups.size).toBe(0);
  });

  it("collapses all when only some groups are collapsed", () => {
    const { result } = setup();
    act(() => result.current.setGroupBy("sprint"));
    act(() => result.current.toggleCollapse("s1"));
    expect(result.current.allCollapsed).toBe(false);
    act(() => result.current.toggleAllGroups());
    expect(result.current.allCollapsed).toBe(true);
    expect(result.current.collapsedGroups.has("s1")).toBe(true);
    expect(result.current.collapsedGroups.has("s2")).toBe(true);
  });

  it("reports not-all-collapsed when there are no groups", () => {
    const { result } = setup();
    // groupBy stays "none" -> no groups
    expect(result.current.groups.length).toBe(0);
    expect(result.current.allCollapsed).toBe(false);
  });
});
