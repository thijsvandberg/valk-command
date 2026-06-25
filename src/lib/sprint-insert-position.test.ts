import { describe, it, expect } from "vitest";
import { trailingDoneDepStart, interpolateRank, spliceKeyIntoOrder } from "./sprint-insert-position";

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

describe("spliceKeyIntoOrder", () => {
  it("inserts the new key above the trailing done/deprecated block", () => {
    const order = ["A", "B", "DONE1", "DEP1"];
    // displayed order matches `order`; the trailing finished block starts at index 2.
    const result = spliceKeyIntoOrder(order, ["A", "B", "DONE1", "DEP1"], 2, "NEW");
    expect(result).toEqual(["A", "B", "NEW", "DONE1", "DEP1"]);
  });

  it("inserts at the top for a backlog (insertIdx 0)", () => {
    const order = ["A", "B", "C"];
    const result = spliceKeyIntoOrder(order, ["A", "B", "C"], 0, "NEW");
    expect(result).toEqual(["NEW", "A", "B", "C"]);
  });

  it("appends after the sprint's last row when there is no trailing finished block", () => {
    const order = ["A", "B", "C"];
    // insertIdx === displayKeys.length -> no anchor below, fall to after the last key.
    const result = spliceKeyIntoOrder(order, ["A", "B", "C"], 3, "NEW");
    expect(result).toEqual(["A", "B", "C", "NEW"]);
  });

  it("anchors within the destination sprint's rows in a multi-sprint order", () => {
    // order spans two sprints (S1: A,B ; S2: X,Y); the new key targets S2 above its done block.
    const order = ["A", "B", "X", "DONEY"];
    const result = spliceKeyIntoOrder(order, ["X", "DONEY"], 1, "NEW");
    expect(result).toEqual(["A", "B", "X", "NEW", "DONEY"]);
  });

  it("is a no-op (copy) when the key is already present", () => {
    const order = ["A", "NEW", "B"];
    const result = spliceKeyIntoOrder(order, ["A", "NEW", "B"], 2, "NEW");
    expect(result).toEqual(["A", "NEW", "B"]);
    expect(result).not.toBe(order);
  });

  it("appends when neither anchor is found in the order", () => {
    const order = ["A", "B"];
    const result = spliceKeyIntoOrder(order, ["X", "Y"], 0, "NEW");
    expect(result).toEqual(["A", "B", "NEW"]);
  });
});
