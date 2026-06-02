import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useSprintBoardFilters } from "./useSprintBoardFilters";
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
