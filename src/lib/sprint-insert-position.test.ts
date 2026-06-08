import { describe, it, expect } from "vitest";
import { trailingDoneDepStart, interpolateRank } from "./sprint-insert-position";

const row = (jiraStatus: string) => ({ jiraStatus });

describe("trailingDoneDepStart", () => {
  it("returns 0 for an empty list", () => {
    expect(trailingDoneDepStart([])).toBe(0);
  });

  it("returns the length when there is no trailing finished block", () => {
    const tickets = [row("TO DO"), row("IN PROGRESS"), row("TEST")];
    expect(trailingDoneDepStart(tickets)).toBe(3);
  });

  it("returns the start index of a trailing DONE/DEPRECATED block", () => {
    const tickets = [row("TO DO"), row("TO DO"), row("DEPRECATED"), row("DONE")];
    expect(trailingDoneDepStart(tickets)).toBe(2);
  });

  it("ignores a stray done/deprecated ticket higher up in the list", () => {
    const tickets = [row("DONE"), row("TO DO"), row("DONE"), row("DEPRECATED")];
    // Only the contiguous bottom run (indices 2,3) counts; the DONE at index 0 is ignored.
    expect(trailingDoneDepStart(tickets)).toBe(2);
  });

  it("returns 0 when every ticket is finished", () => {
    const tickets = [row("DONE"), row("DEPRECATED"), row("DONE")];
    expect(trailingDoneDepStart(tickets)).toBe(0);
  });

  it("is case-insensitive and tolerates null status", () => {
    const tickets = [row("To Do"), { jiraStatus: null }, row("done")];
    expect(trailingDoneDepStart(tickets)).toBe(2);
  });
});

describe("interpolateRank", () => {
  it("returns the midpoint of two numeric neighbours", () => {
    expect(interpolateRank(10, 20)).toBe(15);
  });

  it("appends just below when only the upper neighbour exists", () => {
    expect(interpolateRank(10, null)).toBe(11);
  });

  it("inserts just above when only the lower neighbour exists", () => {
    expect(interpolateRank(null, 20)).toBe(19);
  });

  it("returns null when there is no numeric anchor", () => {
    expect(interpolateRank(null, null)).toBeNull();
    expect(interpolateRank(undefined, undefined)).toBeNull();
  });

  it("keeps the interpolated rank strictly between neighbours so the sort order holds", () => {
    const r = interpolateRank(100, 101)!;
    expect(r).toBeGreaterThan(100);
    expect(r).toBeLessThan(101);
  });
});
