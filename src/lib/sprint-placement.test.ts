import { describe, it, expect } from "vitest";
import { placementForMove, topKeysForMove } from "./sprint-placement";

describe("placementForMove", () => {
  it("sends a backlog destination (null sentinel) to the top", () => {
    expect(placementForMove(null, "TO DO")).toBe("top");
    expect(placementForMove(null, "DONE")).toBe("top");
  });

  it("sends a named backlog to the top", () => {
    expect(placementForMove("BT: Backlog", "TO DO")).toBe("top");
    expect(placementForMove("GXP: Backlog", "DONE")).toBe("top");
    expect(placementForMove("Backlog", "TO DO")).toBe("top");
  });

  it("sends a regular sprint to the bottom for not-in-flight statuses", () => {
    expect(placementForMove("BT: 140", "TO DO")).toBe("bottom");
    expect(placementForMove("BT: 140", "DONE")).toBe("bottom");
    expect(placementForMove("GXP: 22", null)).toBe("bottom");
  });

  it("sends in-flight tickets to the top even into a regular sprint", () => {
    expect(placementForMove("BT: 140", "IN PROGRESS")).toBe("top");
    expect(placementForMove("BT: 140", "TEST")).toBe("top");
    expect(placementForMove("BT: 140", "in progress")).toBe("top");
  });

  it("defaults unrecognized non-regular destinations to the top", () => {
    expect(placementForMove("BT: TODO", "TO DO")).toBe("top");
    expect(placementForMove("Unscheduled", "DONE")).toBe("top");
    expect(placementForMove("Overall refinement", "TO DO")).toBe("top");
  });
});

describe("topKeysForMove", () => {
  const statuses: Record<string, string> = {
    "VPL-1": "TO DO",
    "VPL-2": "IN PROGRESS",
    "VPL-3": "DONE",
    "VPL-4": "TEST",
  };
  const statusOf = (k: string) => statuses[k];

  it("into a regular sprint, only in-flight keys go top", () => {
    expect(topKeysForMove(["VPL-1", "VPL-2", "VPL-3", "VPL-4"], "BT: 140", statusOf)).toEqual([
      "VPL-2",
      "VPL-4",
    ]);
  });

  it("into a backlog, every key goes top", () => {
    expect(topKeysForMove(["VPL-1", "VPL-2", "VPL-3"], null, statusOf)).toEqual([
      "VPL-1",
      "VPL-2",
      "VPL-3",
    ]);
    expect(topKeysForMove(["VPL-1", "VPL-3"], "BT: Backlog", statusOf)).toEqual(["VPL-1", "VPL-3"]);
  });

  it("returns no top keys when none are in flight into a regular sprint", () => {
    expect(topKeysForMove(["VPL-1", "VPL-3"], "BT: 140", statusOf)).toEqual([]);
  });

  it("preserves the input key order", () => {
    expect(topKeysForMove(["VPL-4", "VPL-1", "VPL-2"], "BT: 140", statusOf)).toEqual([
      "VPL-4",
      "VPL-2",
    ]);
  });
});
