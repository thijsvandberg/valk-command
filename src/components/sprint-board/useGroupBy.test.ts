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

  it("does not duplicate the backlog group, and hoists it above the sprint groups (BRDG-239)", () => {
    const sprintsWithBacklog = [...SPRINTS, makeSprint("__backlog__", "Backlog", "backlog")];
    const ticketsWithBacklog = [...TICKETS, makeTicket({ key: "VPL-3", sprintId: "" })];
    const { result } = renderHook(() => useGroupBy(ticketsWithBacklog, sprintsWithBacklog, NAME_MAP, true));
    act(() => result.current.setGroupBy("sprint"));
    const keys = result.current.groups.map((g) => g.key);
    expect(keys.filter((k) => k === "__backlog__")).toHaveLength(1);
    expect(new Set(keys).size).toBe(keys.length); // all group keys unique
    // With nothing pinned, the fixed Backlog group leads, ahead of the sprint groups.
    expect(keys[0]).toBe("__backlog__");
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
    act(() => result.current.setGroupBy("none"));
    expect(result.current.groups.length).toBe(0);
    expect(result.current.allCollapsed).toBe(false);
  });

  it("defaults to grouping by sprint in the All view", () => {
    const { result } = setup();
    expect(result.current.groupBy).toBe("sprint");
    expect(result.current.groups.length).toBe(2);
  });
});

describe("useGroupBy pinned sprints (BRDG-239)", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("hoists pinned sprints to the top, ahead of the status sort order", () => {
    // s1 is active (natural order 0), s2 is future. Pinning s2 should put it first.
    const { result } = renderHook(() => useGroupBy(TICKETS, SPRINTS, NAME_MAP, true, ["s2"]));
    act(() => result.current.setGroupBy("sprint"));
    expect(result.current.groups.map((g) => g.key)).toEqual(["s2", "s1"]);
  });

  it("keeps multiple pinned sprints in sprint-bar order", () => {
    const sprints = [
      makeSprint("s1", "Sprint One", "active"),
      makeSprint("s2", "Sprint Two", "future"),
      makeSprint("s3", "Sprint Three", "future"),
    ];
    const tickets = [
      makeTicket({ key: "VPL-1", sprintId: "s1" }),
      makeTicket({ key: "VPL-2", sprintId: "s2" }),
      makeTicket({ key: "VPL-3", sprintId: "s3" }),
    ];
    const { result } = renderHook(() => useGroupBy(tickets, sprints, NAME_MAP, true, ["s3", "s1"]));
    act(() => result.current.setGroupBy("sprint"));
    // Pinned first in bar order (s3, s1), then the remaining unpinned (s2).
    expect(result.current.groups.map((g) => g.key)).toEqual(["s3", "s1", "s2"]);
  });

  it("keeps the Backlog group directly after the pinned block", () => {
    const sprints = [...SPRINTS, makeSprint("__backlog__", "Backlog", "backlog")];
    const tickets = [...TICKETS, makeTicket({ key: "VPL-3", sprintId: "" })];
    // s2 pinned -> pinned block, then fixed Backlog, then the remaining s1.
    const { result } = renderHook(() => useGroupBy(tickets, sprints, NAME_MAP, true, ["s2"]));
    act(() => result.current.setGroupBy("sprint"));
    expect(result.current.groups.map((g) => g.key)).toEqual(["s2", "__backlog__", "s1"]);
  });
});

describe("useGroupBy closed-sprint filtering (BRDG-259)", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  // s1 active, s2 future, s3 closed; each has a ticket.
  const sprints = [
    makeSprint("s1", "Sprint One", "active"),
    makeSprint("s2", "Sprint Two", "future"),
    makeSprint("s3", "Sprint Three", "closed"),
  ];
  const tickets = [
    makeTicket({ key: "VPL-1", sprintId: "s1" }),
    makeTicket({ key: "VPL-2", sprintId: "s2" }),
    makeTicket({ key: "VPL-3", sprintId: "s3" }),
  ];
  const nameMap = { s1: "Sprint One", s2: "Sprint Two", s3: "Sprint Three" };

  it("hides closed sprint groups by default", () => {
    const { result } = renderHook(() => useGroupBy(tickets, sprints, nameMap, true));
    act(() => result.current.setGroupBy("sprint"));
    const keys = result.current.groups.map((g) => g.key);
    expect(keys).toEqual(["s1", "s2"]);
    expect(keys).not.toContain("s3");
  });

  it("reveals closed sprint groups when includeClosedSprints is true", () => {
    const { result } = renderHook(() => useGroupBy(tickets, sprints, nameMap, true, [], true));
    act(() => result.current.setGroupBy("sprint"));
    expect(result.current.groups.map((g) => g.key)).toContain("s3");
  });

  it("always shows a closed sprint that is pinned, even when closed sprints are hidden", () => {
    const { result } = renderHook(() => useGroupBy(tickets, sprints, nameMap, true, ["s3"], false));
    act(() => result.current.setGroupBy("sprint"));
    const keys = result.current.groups.map((g) => g.key);
    // Pinned closed sprint is hoisted to the front and remains visible.
    expect(keys[0]).toBe("s3");
  });

  it("hides tickets whose sprint is unknown (dropped from the cache) by default", () => {
    const ticketsWithUnknown = [...tickets, makeTicket({ key: "VPL-9", sprintId: "old-99" })];
    const { result } = renderHook(() => useGroupBy(ticketsWithUnknown, sprints, nameMap, true));
    act(() => result.current.setGroupBy("sprint"));
    expect(result.current.groups.map((g) => g.key)).not.toContain("old-99");
  });

  it("reveals unknown-sprint tickets when includeClosedSprints is true", () => {
    const ticketsWithUnknown = [...tickets, makeTicket({ key: "VPL-9", sprintId: "old-99" })];
    const { result } = renderHook(() => useGroupBy(ticketsWithUnknown, sprints, nameMap, true, [], true));
    act(() => result.current.setGroupBy("sprint"));
    expect(result.current.groups.map((g) => g.key)).toContain("old-99");
  });

  it("keeps the Backlog group regardless of the closed-sprint setting", () => {
    const sprintsWithBacklog = [...sprints, makeSprint("__backlog__", "Backlog", "backlog")];
    const ticketsWithBacklog = [...tickets, makeTicket({ key: "VPL-4", sprintId: "" })];
    const { result } = renderHook(() => useGroupBy(ticketsWithBacklog, sprintsWithBacklog, nameMap, true));
    act(() => result.current.setGroupBy("sprint"));
    expect(result.current.groups.map((g) => g.key)).toContain("__backlog__");
  });

  it("shows a closed sprint that is force-shown (selected by id), even when closed sprints are hidden", () => {
    // includeClosedSprints=false, not pinned, but s3 is in forceShowSprintIds.
    const { result } = renderHook(() => useGroupBy(tickets, sprints, nameMap, true, [], false, ["s3"]));
    act(() => result.current.setGroupBy("sprint"));
    expect(result.current.groups.map((g) => g.key)).toContain("s3");
  });

  it("shows a force-shown unknown sprint even when closed sprints are hidden", () => {
    const ticketsWithUnknown = [...tickets, makeTicket({ key: "VPL-9", sprintId: "old-99" })];
    const { result } = renderHook(() => useGroupBy(ticketsWithUnknown, sprints, nameMap, true, [], false, ["old-99"]));
    act(() => result.current.setGroupBy("sprint"));
    expect(result.current.groups.map((g) => g.key)).toContain("old-99");
  });
});
