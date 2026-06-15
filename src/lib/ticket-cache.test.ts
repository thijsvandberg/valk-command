import { describe, it, expect, vi, beforeEach } from "vitest";

const mutate = vi.fn();
vi.mock("swr", () => ({ mutate: (...args: unknown[]) => mutate(...args) }));

import { patchTicketCaches, moveTicketSprintCaches } from "./ticket-cache";

type Row = { key: string; sprintId?: string; epic?: string | null };

describe("patchTicketCaches", () => {
  beforeEach(() => mutate.mockReset());

  it("targets the board list, sprint lists, and the detail key only", () => {
    patchTicketCaches("VPL-1", { epic: "ARIE" });
    const matcher = mutate.mock.calls[0][0] as (k: unknown) => boolean;
    expect(matcher("/api/tickets")).toBe(true);
    expect(matcher("/api/tickets?sprintId=139")).toBe(true);
    expect(matcher("/api/tickets/VPL-1")).toBe(true);
    expect(matcher("/api/tickets/VPL-2")).toBe(false);
    expect(matcher("/api/sprint-slots")).toBe(false);
  });

  it("merges the patch into the matching list row and detail object only", () => {
    patchTicketCaches("VPL-1", { epic: "ARIE" });
    const updater = mutate.mock.calls[0][1] as (current: unknown) => unknown;

    const list: Row[] = [{ key: "VPL-1", epic: null }, { key: "VPL-2", epic: "OTHER" }];
    expect(updater(list)).toEqual([{ key: "VPL-1", epic: "ARIE" }, { key: "VPL-2", epic: "OTHER" }]);

    expect(updater({ key: "VPL-1", epic: null })).toEqual({ key: "VPL-1", epic: "ARIE" });
    expect(updater({ key: "VPL-2", epic: null })).toEqual({ key: "VPL-2", epic: null });

    expect(mutate.mock.calls[0][2]).toEqual({ revalidate: false });
  });
});

describe("moveTicketSprintCaches", () => {
  beforeEach(() => mutate.mockReset());

  it("drops the ticket from other sprint lists, adds it to the destination, and updates the All view", () => {
    moveTicketSprintCaches({ key: "VPL-1", sprintId: "138" }, "139");

    // Call 0: remove from other sprint lists (filter matcher excludes the dest).
    const removeMatcher = mutate.mock.calls[0][0] as (k: unknown) => boolean;
    expect(removeMatcher("/api/tickets?sprintId=138")).toBe(true);
    expect(removeMatcher("/api/tickets?sprintId=139")).toBe(false);
    expect(removeMatcher("/api/tickets")).toBe(false);
    const removeUpdater = mutate.mock.calls[0][1] as (c: unknown) => unknown;
    expect(removeUpdater([{ key: "VPL-1" }, { key: "VPL-9" }])).toEqual([{ key: "VPL-9" }]);

    // Call 1: destination list gets the ticket with the new sprintId.
    expect(mutate.mock.calls[1][0]).toBe("/api/tickets?sprintId=139");
    const destUpdater = mutate.mock.calls[1][1] as (c: unknown) => unknown;
    expect(destUpdater([{ key: "VPL-9" }])).toEqual([{ key: "VPL-9" }, { key: "VPL-1", sprintId: "139" }]);
    // De-duplicates when already present.
    expect(destUpdater([{ key: "VPL-1", sprintId: "138" }])).toEqual([{ key: "VPL-1", sprintId: "139" }]);

    // Call 2: All view keeps the row but updates its sprintId.
    expect(mutate.mock.calls[2][0]).toBe("/api/tickets");
    const allUpdater = mutate.mock.calls[2][1] as (c: unknown) => unknown;
    expect(allUpdater([{ key: "VPL-1", sprintId: "138" }])).toEqual([{ key: "VPL-1", sprintId: "139" }]);

    // Call 3: detail object sprintId updated.
    expect(mutate.mock.calls[3][0]).toBe("/api/tickets/VPL-1");
  });

  it("clears the sprintId when moving to the backlog", () => {
    moveTicketSprintCaches({ key: "VPL-1", sprintId: "139" }, "__backlog__");
    const destUpdater = mutate.mock.calls[1][1] as (c: unknown) => unknown;
    expect(destUpdater([])).toEqual([{ key: "VPL-1", sprintId: undefined }]);
  });

  it("places the ticket at the top of the destination with a leading rank when toTop is set", () => {
    moveTicketSprintCaches({ key: "VPL-1", sprintId: "138" }, "139", true);
    const destUpdater = mutate.mock.calls[1][1] as (c: unknown) => unknown;
    const result = destUpdater([
      { key: "VPL-9", jiraRank: 5 },
      { key: "VPL-8", jiraRank: 10 },
    ]) as Array<{ key: string; jiraRank?: number }>;
    // Prepended and ranked below the current minimum so the rank sort shows it first.
    expect(result.map((t) => t.key)).toEqual(["VPL-1", "VPL-9", "VPL-8"]);
    expect(result[0].jiraRank).toBeLessThan(5);
  });
});
