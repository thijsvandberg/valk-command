import { describe, it, expect } from "vitest";
import type { Ticket } from "@/types/ticket";
import { matchesWarningFilter } from "./warning-filter";

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
