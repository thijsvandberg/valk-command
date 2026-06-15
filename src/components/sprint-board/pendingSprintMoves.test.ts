import { describe, it, expect } from "vitest";
import { applyPendingMoves, type PendingMove } from "./pendingSprintMoves";
import type { Ticket } from "@/types/ticket";

function makeTicket(key: string, sprintId?: string, jiraRank?: number): Ticket {
  return {
    key, title: key, type: "story", epicKey: null, epic: null, flagged: false,
    jiraStatus: "TO DO", storyPoints: null, businessValue: null, assignee: null,
    qualityScore: null, readiness: null, poStatus: null, editState: "clean",
    notes: "", sprintId, jiraRank: jiraRank ?? null,
  } as Ticket;
}

function pending(entries: Array<[string, PendingMove]>): Map<string, PendingMove> {
  return new Map(entries);
}

const NOW = 1_000_000;

describe("applyPendingMoves", () => {
  it("injects a pending ticket targeting the active sprint at the top with a leading rank", () => {
    const list = [makeTicket("VPL-9", "628", 5), makeTicket("VPL-8", "628", 10)];
    const moves = pending([["VPL-1", { ticket: makeTicket("VPL-1", "140", 99), targetSprintId: "628", at: NOW, confirmed: false }]]);

    const result = applyPendingMoves(list, "628", moves, NOW)!;

    expect(result.map((t) => t.key)).toEqual(["VPL-1", "VPL-9", "VPL-8"]);
    expect(result[0].sprintId).toBe("628");
    expect(result[0].jiraRank!).toBeLessThan(5);
  });

  it("clears the sprintId when the pending target is the backlog", () => {
    const list = [makeTicket("VPL-9", undefined, 5)];
    const moves = pending([["VPL-1", { ticket: makeTicket("VPL-1", "140"), targetSprintId: "__backlog__", at: NOW, confirmed: false }]]);

    const result = applyPendingMoves(list, "__backlog__", moves, NOW)!;

    expect(result[0].key).toBe("VPL-1");
    expect(result[0].sprintId).toBeUndefined();
  });

  it("does not inject when the server list already has the row", () => {
    const list = [makeTicket("VPL-1", "628", 3)];
    const moves = pending([["VPL-1", { ticket: makeTicket("VPL-1", "140"), targetSprintId: "628", at: NOW, confirmed: false }]]);

    const result = applyPendingMoves(list, "628", moves, NOW);

    expect(result).toBe(list); // unchanged reference
  });

  it("removes a row from a view it was moved away from (stale re-list)", () => {
    const list = [makeTicket("VPL-1", "140", 1), makeTicket("VPL-2", "140", 2)];
    const moves = pending([["VPL-1", { ticket: makeTicket("VPL-1", "140"), targetSprintId: "628", at: NOW, confirmed: false }]]);

    const result = applyPendingMoves(list, "140", moves, NOW)!;

    expect(result.map((t) => t.key)).toEqual(["VPL-2"]);
  });

  it("never touches the All view", () => {
    const list = [makeTicket("VPL-1", "140")];
    const moves = pending([["VPL-1", { ticket: makeTicket("VPL-1", "140"), targetSprintId: "628", at: NOW, confirmed: false }]]);

    expect(applyPendingMoves(list, "__all__", moves, NOW)).toBe(list);
  });

  it("ignores entries past their TTL", () => {
    const list = [makeTicket("VPL-9", "628", 5)];
    const moves = pending([["VPL-1", { ticket: makeTicket("VPL-1", "140"), targetSprintId: "628", at: NOW - 60_000, confirmed: false }]]);

    expect(applyPendingMoves(list, "628", moves, NOW)).toBe(list);
  });

  it("returns the same list when there are no pending moves", () => {
    const list = [makeTicket("VPL-9", "628")];
    expect(applyPendingMoves(list, "628", new Map(), NOW)).toBe(list);
  });
});
