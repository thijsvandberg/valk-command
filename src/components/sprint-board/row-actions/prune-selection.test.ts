import { describe, it, expect } from "vitest";
import { pruneSelectionToVisible } from "./prune-selection";

describe("pruneSelectionToVisible (BRDG-415)", () => {
  it("returns the same Set reference when every selected key is still visible", () => {
    const selection = new Set(["A-1", "A-2"]);
    const visible = new Set(["A-1", "A-2", "A-3"]);
    expect(pruneSelectionToVisible(selection, visible)).toBe(selection);
  });

  it("drops keys that are no longer visible (the count matches the visible rows)", () => {
    const selection = new Set(["A-1", "A-2", "A-3"]);
    const visible = new Set(["A-1", "A-3"]); // A-2 was filtered / moved / refetched away
    const pruned = pruneSelectionToVisible(selection, visible);
    expect(pruned).not.toBe(selection);
    expect([...pruned].sort()).toEqual(["A-1", "A-3"]);
  });

  it("returns an empty Set when none of the selection is visible", () => {
    const pruned = pruneSelectionToVisible(new Set(["A-1"]), new Set(["B-9"]));
    expect(pruned.size).toBe(0);
  });

  it("keeps the same reference for an empty selection", () => {
    const empty = new Set<string>();
    expect(pruneSelectionToVisible(empty, new Set(["A-1"]))).toBe(empty);
  });
});
