import { describe, it, expect } from "vitest";
import { ROW_ACTION_GROUPS, ROW_ACTION_GROUP_BY_ID, SURFACE_PRESETS, menuGroups, barGroups } from "./groups";

describe("row-actions group registry", () => {
  it("keeps the locked names and icons", () => {
    expect(ROW_ACTION_GROUP_BY_ID.update.label).toBe("Update");
    expect(ROW_ACTION_GROUP_BY_ID.assist.label).toBe("Assist");
    // file-pen for Update, swap for Move (icons are referenced, not deep-compared)
    expect(ROW_ACTION_GROUP_BY_ID.update.icon).toBeTruthy();
    expect(ROW_ACTION_GROUP_BY_ID.move.icon).toBeTruthy();
  });

  it("marks Update and Assist and Refinement as nested in the menu", () => {
    expect(ROW_ACTION_GROUP_BY_ID.update.nested).toBe(true);
    expect(ROW_ACTION_GROUP_BY_ID.assist.nested).toBe(true);
    expect(ROW_ACTION_GROUP_BY_ID.refine.nested).toBe(true);
  });

  it("marks Move as prominent (top-level/inline)", () => {
    expect(ROW_ACTION_GROUP_BY_ID.move.prominent).toBe(true);
  });

  it("marks Copy and Refresh as bar-only", () => {
    expect(ROW_ACTION_GROUP_BY_ID.copy.barOnly).toBe(true);
    expect(ROW_ACTION_GROUP_BY_ID.refresh.barOnly).toBe(true);
  });

  it("reserves Bookmark for the future", () => {
    expect(ROW_ACTION_GROUP_BY_ID.bookmark.future).toBe(true);
  });

  it("composes the board surface (rank + metrics + refresh, no triage)", () => {
    const s = SURFACE_PRESETS.board;
    expect(s.rank).toBe(true);
    expect(s.metrics).toBe(true);
    expect(s.groups).toContain("refresh");
    expect(s.groups).not.toContain("triage");
  });

  it("composes the inbox surface (triage, no rank, no metrics, no refresh)", () => {
    const s = SURFACE_PRESETS.inbox;
    expect(s.groups).toContain("triage");
    expect(s.rank).toBe(false);
    expect(s.metrics).toBe(false);
    expect(s.groups).not.toContain("refresh");
  });

  it("composes the epic surface (no triage, no rank, has metrics, no refresh)", () => {
    const s = SURFACE_PRESETS.epic;
    expect(s.groups).not.toContain("triage");
    expect(s.rank).toBe(false);
    expect(s.metrics).toBe(true);
    expect(s.groups).not.toContain("refresh");
  });

  it("menuGroups excludes bar-only ops; barGroups includes them", () => {
    const menu = menuGroups(SURFACE_PRESETS.board).map((g) => g.id);
    const bar = barGroups(SURFACE_PRESETS.board).map((g) => g.id);
    expect(menu).not.toContain("copy");
    expect(menu).not.toContain("refresh");
    expect(bar).toContain("copy");
    expect(bar).toContain("refresh");
  });

  it("preserves registry order in both presentations", () => {
    const order = ROW_ACTION_GROUPS.map((g) => g.id);
    const bar = barGroups(SURFACE_PRESETS.board).map((g) => g.id);
    // bar order is a subsequence of the registry order
    let i = 0;
    for (const id of bar) {
      i = order.indexOf(id, i);
      expect(i).toBeGreaterThanOrEqual(0);
    }
  });
});
