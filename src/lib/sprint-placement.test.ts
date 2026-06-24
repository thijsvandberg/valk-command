import { describe, it, expect } from "vitest";
import { placementForMove, topKeysForMove } from "./sprint-placement";

describe("placementForMove", () => {
  it("sends a backlog destination (null sentinel) to the top", () => {
    expect(placementForMove(null)).toBe("top");
  });

  it("sends a named backlog to the top", () => {
    expect(placementForMove("BT: Backlog")).toBe("top");
    expect(placementForMove("GXP: Backlog")).toBe("top");
    expect(placementForMove("Backlog")).toBe("top");
  });

  it("sends every move into a regular sprint to the bottom, regardless of status", () => {
    expect(placementForMove("BT: 140")).toBe("bottom");
    expect(placementForMove("GXP: 22")).toBe("bottom");
    // In-flight tickets no longer get a top exception (BRDG-374 follow-up).
    expect(placementForMove("BT: 140")).toBe("bottom");
  });

  it("defaults unrecognized non-regular destinations to the top", () => {
    expect(placementForMove("BT: TODO")).toBe("top");
    expect(placementForMove("Unscheduled")).toBe("top");
    expect(placementForMove("Overall refinement")).toBe("top");
  });
});

describe("topKeysForMove", () => {
  const KEYS = ["VPL-1", "VPL-2", "VPL-3", "VPL-4"];

  it("into a regular sprint, no keys go top (whole batch lands at the bottom)", () => {
    expect(topKeysForMove(KEYS, "BT: 140")).toEqual([]);
  });

  it("into a backlog, every key goes top (input order preserved)", () => {
    expect(topKeysForMove(["VPL-1", "VPL-2", "VPL-3"], null)).toEqual(["VPL-1", "VPL-2", "VPL-3"]);
    expect(topKeysForMove(["VPL-1", "VPL-3"], "BT: Backlog")).toEqual(["VPL-1", "VPL-3"]);
  });

  it("into an unrecognized non-regular destination, every key goes top", () => {
    expect(topKeysForMove(["VPL-2", "VPL-1"], "Unscheduled")).toEqual(["VPL-2", "VPL-1"]);
  });
});
