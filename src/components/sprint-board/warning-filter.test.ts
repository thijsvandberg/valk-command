import { describe, it, expect } from "vitest";
import type { Ticket } from "@/types/ticket";
import { matchesWarningFilter, ticketWarnings, ticketWarningLabels } from "./warning-filter";

function mk(partial: Partial<Ticket>): Ticket {
  return {
    key: "VPL-1",
    title: "T",
    type: "story",
    jiraStatus: "TO DO",
    storyPoints: 3,
    openSubtaskCount: 0,
    ...partial,
  } as unknown as Ticket;
}

describe("matchesWarningFilter", () => {
  it("matches unpointed stories only in the active sprint", () => {
    const t = mk({ storyPoints: null, jiraStatus: "TO DO" });
    expect(matchesWarningFilter(t, true)).toBe(true);
    expect(matchesWarningFilter(t, false)).toBe(false);
  });

  it("ignores unpointed spikes", () => {
    expect(matchesWarningFilter(mk({ storyPoints: null, type: "spike" }), true)).toBe(false);
  });

  it("matches deprecated tickets that still carry story points regardless of sprint", () => {
    const t = mk({ jiraStatus: "DEPRECATED", storyPoints: 5 });
    expect(matchesWarningFilter(t, false)).toBe(true);
    expect(matchesWarningFilter(t, true)).toBe(true);
  });

  it("does not match deprecated tickets without story points", () => {
    expect(matchesWarningFilter(mk({ jiraStatus: "DEPRECATED", storyPoints: null }), true)).toBe(false);
  });

  it("matches closed (Done) stories that still have open subtasks", () => {
    expect(matchesWarningFilter(mk({ jiraStatus: "DONE", storyPoints: 3, openSubtaskCount: 1 }), false)).toBe(true);
  });

  it("matches deprecated stories with open subtasks even without points", () => {
    expect(matchesWarningFilter(mk({ jiraStatus: "DEPRECATED", storyPoints: null, openSubtaskCount: 2 }), false)).toBe(true);
  });

  it("does not match a clean done story with no open subtasks", () => {
    expect(matchesWarningFilter(mk({ jiraStatus: "DONE", storyPoints: 3, openSubtaskCount: 0 }), true)).toBe(false);
  });

  it("does not match an in-progress story with open subtasks (only closed ones are flagged)", () => {
    expect(matchesWarningFilter(mk({ jiraStatus: "IN PROGRESS", storyPoints: 3, openSubtaskCount: 4 }), true)).toBe(false);
  });
});

describe("ticketWarnings / ticketWarningLabels", () => {
  it("labels an unpointed story only in the active sprint", () => {
    const t = mk({ storyPoints: null, jiraStatus: "TO DO" });
    expect(ticketWarnings(t, true)).toEqual(["unpointed"]);
    expect(ticketWarningLabels(t, true)).toEqual(["No story point estimate"]);
    expect(ticketWarnings(t, false)).toEqual([]);
    expect(ticketWarningLabels(t, false)).toEqual([]);
  });

  it("labels a deprecated ticket that still carries story points", () => {
    const t = mk({ jiraStatus: "DEPRECATED", storyPoints: 5 });
    expect(ticketWarningLabels(t, false)).toEqual(["Deprecated but still has story points"]);
  });

  it("labels a closed story with open subtasks", () => {
    const t = mk({ jiraStatus: "DONE", storyPoints: 3, openSubtaskCount: 1 });
    expect(ticketWarningLabels(t, true)).toEqual(["Closed with open subtasks"]);
  });

  it("returns a label per applicable problem for a multi-condition ticket", () => {
    // Deprecated, still pointed, and still has an open subtask -> two distinct problems.
    const t = mk({ jiraStatus: "DEPRECATED", storyPoints: 8, openSubtaskCount: 2 });
    expect(ticketWarnings(t, true)).toEqual(["deprecated_with_points", "closed_with_open_subtasks"]);
    expect(ticketWarningLabels(t, true)).toEqual([
      "Deprecated but still has story points",
      "Closed with open subtasks",
    ]);
  });

  it("stays in lockstep with matchesWarningFilter", () => {
    const cases: Ticket[] = [
      mk({ storyPoints: null }),
      mk({ jiraStatus: "DEPRECATED", storyPoints: 5 }),
      mk({ jiraStatus: "DONE", openSubtaskCount: 1 }),
      mk({ storyPoints: 3, openSubtaskCount: 0 }),
    ];
    for (const t of cases) {
      for (const active of [true, false]) {
        expect(matchesWarningFilter(t, active)).toBe(ticketWarnings(t, active).length > 0);
      }
    }
  });
});
