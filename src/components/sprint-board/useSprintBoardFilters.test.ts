import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useSprintBoardFilters } from "./useSprintBoardFilters";
import { SPRINT_STATE_CLOSED, SPRINT_STATE_FILTER_PREFIX } from "./filter-bar-types";
import type { Ticket } from "@/types/ticket";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
}));

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

const TODO = makeTicket({ key: "VPL-1", jiraStatus: "TO DO" });
const DONE = makeTicket({ key: "VPL-2", jiraStatus: "DONE" });
const DELETED = makeTicket({ key: "VPL-3", jiraStatus: "TO DO", removedFromJiraAt: "2026-06-01T00:00:00Z" });
const ALL = [TODO, DONE, DELETED];

function setup(tickets: Ticket[] = ALL) {
  return renderHook(() => useSprintBoardFilters(tickets, {}, false, null));
}

describe("useSprintBoardFilters - DELETED status handling", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("hides deleted tickets by default while showing everything else", () => {
    const { result } = setup();
    const keys = result.current.sortedTickets.map((t) => t.key);
    expect(keys).toContain("VPL-1");
    expect(keys).toContain("VPL-2");
    expect(keys).not.toContain("VPL-3");
  });

  it("exposes DELETED as a status option only when deleted tickets exist", () => {
    const { result } = setup();
    expect(result.current.statusOptions).toContain("DELETED");

    const { result: noDeleted } = setup([TODO, DONE]);
    expect(noDeleted.current.statusOptions).not.toContain("DELETED");
  });

  it("shows only deleted tickets when DELETED is selected", () => {
    const { result } = setup();
    act(() => result.current.setStatusFilter(new Set(["DELETED"])));
    const keys = result.current.sortedTickets.map((t) => t.key);
    expect(keys).toEqual(["VPL-3"]);
  });

  it("combines DELETED with other selected statuses", () => {
    const { result } = setup();
    act(() => result.current.setStatusFilter(new Set(["DONE", "DELETED"])));
    const keys = result.current.sortedTickets.map((t) => t.key).sort();
    expect(keys).toEqual(["VPL-2", "VPL-3"]);
  });

  it("excludes deleted tickets when a non-DELETED status is selected, even if their stale status matches", () => {
    const { result } = setup();
    // VPL-3 has jiraStatus "TO DO" but is removed; selecting TO DO must not surface it.
    act(() => result.current.setStatusFilter(new Set(["TO DO"])));
    const keys = result.current.sortedTickets.map((t) => t.key);
    expect(keys).toEqual(["VPL-1"]);
  });

  it("still surfaces deleted tickets via the 'Removed from Jira' changes filter", () => {
    const { result } = setup();
    act(() => result.current.setEditStateFilter(new Set(["removed"])));
    const keys = result.current.sortedTickets.map((t) => t.key);
    expect(keys).toEqual(["VPL-3"]);
  });
});

describe("useSprintBoardFilters - sprint-state quick filters (BRDG-259)", () => {
  // The All view persists to its own store so its filters survive returning from a sprint view.
  const STORAGE_KEY = "sprint-board-all-filters";
  const A = makeTicket({ key: "A", sprintId: "act" });
  const F = makeTicket({ key: "F", sprintId: "fut" });
  const C = makeTicket({ key: "C", sprintId: "clo" });
  const B = makeTicket({ key: "B", sprintId: "" }); // backlog (no sprint)
  const STATE_MAP = { act: "active", fut: "future", clo: "closed" };
  const STATE_ACTIVE = `${SPRINT_STATE_FILTER_PREFIX}active`;
  const STATE_FUTURE = `${SPRINT_STATE_FILTER_PREFIX}future`;

  function setupAll() {
    return renderHook(() => useSprintBoardFilters([A, F, C, B], {}, true, null, undefined, undefined, undefined, STATE_MAP));
  }

  beforeEach(() => {
    localStorage.clear();
  });

  it("shows every sprint state by default (no sprint filter active)", () => {
    const { result } = setupAll();
    expect(result.current.sortedTickets.map((t) => t.key).sort()).toEqual(["A", "B", "C", "F"]);
    expect(result.current.includeClosedSprints).toBe(false);
  });

  it("shows only closed-sprint tickets when the Closed bucket is selected", () => {
    const { result } = setupAll();
    act(() => result.current.setSprintFilter(new Set([SPRINT_STATE_CLOSED])));
    expect(result.current.sortedTickets.map((t) => t.key)).toEqual(["C"]);
    expect(result.current.includeClosedSprints).toBe(true);
  });

  it("shows active and future together when both buckets are selected, excluding closed and backlog", () => {
    const { result } = setupAll();
    act(() => result.current.setSprintFilter(new Set([STATE_ACTIVE, STATE_FUTURE])));
    expect(result.current.sortedTickets.map((t) => t.key).sort()).toEqual(["A", "F"]);
    expect(result.current.includeClosedSprints).toBe(false);
  });

  it("always shows a sprint selected by id, even a closed one, regardless of state buckets", () => {
    const { result } = setupAll();
    act(() => result.current.setSprintFilter(new Set(["clo"])));
    expect(result.current.sortedTickets.map((t) => t.key)).toEqual(["C"]);
    // The closed sprint is force-shown in the grouped view via its id, not the Closed bucket.
    expect(result.current.forceShowSprintIds).toEqual(["clo"]);
    expect(result.current.includeClosedSprints).toBe(false);
  });

  it("unions an individual sprint id with a state bucket", () => {
    const { result } = setupAll();
    act(() => result.current.setSprintFilter(new Set([STATE_FUTURE, "act"])));
    expect(result.current.sortedTickets.map((t) => t.key).sort()).toEqual(["A", "F"]);
    expect(result.current.forceShowSprintIds).toEqual(["act"]);
  });

  it("persists state buckets in the sprint filter (localStorage)", () => {
    const { result } = setupAll();
    act(() => result.current.setSprintFilter(new Set([SPRINT_STATE_CLOSED])));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored.sprint).toContain(SPRINT_STATE_CLOSED);
  });
});

describe("useSprintBoardFilters - multi-sprint membership", () => {
  // M is primarily in a closed sprint but also still tagged to the active one.
  const M = makeTicket({ key: "M", sprintId: "clo", sprintIds: ["act", "clo"] });
  const OTHER = makeTicket({ key: "O", sprintId: "fut", sprintIds: ["fut"] });
  const STATE_MAP = { act: "active", fut: "future", clo: "closed" };
  const STATE_ACTIVE = `${SPRINT_STATE_FILTER_PREFIX}active`;

  function setupAll() {
    return renderHook(() => useSprintBoardFilters([M, OTHER], {}, true, null, undefined, undefined, undefined, STATE_MAP));
  }

  beforeEach(() => {
    localStorage.clear();
  });

  it("matches the active state bucket via a secondary sprint", () => {
    const { result } = setupAll();
    act(() => result.current.setSprintFilter(new Set([STATE_ACTIVE])));
    expect(result.current.sortedTickets.map((t) => t.key)).toEqual(["M"]);
  });

  it("matches when filtering by any of the ticket's sprint ids", () => {
    const { result } = setupAll();
    act(() => result.current.setSprintFilter(new Set(["act"])));
    expect(result.current.sortedTickets.map((t) => t.key)).toEqual(["M"]);
  });

  it("lists every membership sprint in sprintOptions", () => {
    const { result } = setupAll();
    expect([...result.current.sprintOptions].sort()).toEqual(["act", "clo", "fut"]);
  });
});

describe("useSprintBoardFilters - All-view filter memory (BRDG-281)", () => {
  const SPRINT_KEY = "sprint-board-filters";
  const ALL_KEY = "sprint-board-all-filters";

  beforeEach(() => {
    localStorage.clear();
  });

  it("persists All-view filters to a store separate from the sprint working set", () => {
    const { result } = renderHook(() => useSprintBoardFilters(ALL, {}, true, null));
    act(() => result.current.setTeamFilter(new Set(["BT"])));
    expect(JSON.parse(localStorage.getItem(ALL_KEY) ?? "{}").team).toEqual(["BT"]);
    expect(localStorage.getItem(SPRINT_KEY)).toBeNull();
  });

  it("keeps the All-view filters when the sprint working set is reset on navigation", () => {
    const { result } = renderHook(() => useSprintBoardFilters(ALL, {}, true, null));
    act(() => result.current.setTeamFilter(new Set(["BT"])));
    act(() => result.current.resetSprintViewFilters());
    expect(result.current.teamFilter.has("BT")).toBe(true);
    expect(JSON.parse(localStorage.getItem(ALL_KEY) ?? "{}").team).toEqual(["BT"]);
  });

  it("restores remembered All-view filters when reopening the All view in a new session", () => {
    localStorage.setItem(ALL_KEY, JSON.stringify({ status: [], epic: [], assignee: [], readiness: [], editState: [], issueType: [], gaps: [], team: ["BT"], sprint: [] }));
    const { result } = renderHook(() => useSprintBoardFilters(ALL, {}, true, null));
    expect(result.current.teamFilter.has("BT")).toBe(true);
  });

  it("does not apply remembered All-view filters to a sprint view", () => {
    localStorage.setItem(ALL_KEY, JSON.stringify({ status: [], epic: [], assignee: [], readiness: [], editState: [], issueType: [], gaps: [], team: ["BT"], sprint: [] }));
    const { result } = renderHook(() => useSprintBoardFilters(ALL, {}, false, null));
    expect(result.current.teamFilter.size).toBe(0);
  });
});
