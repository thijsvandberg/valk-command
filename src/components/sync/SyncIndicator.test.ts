import { describe, it, expect } from "vitest";
import { clampPanelLeft } from "./SyncIndicator";

describe("clampPanelLeft", () => {
  const WIDTH = 240;
  const VIEWPORT = 1000;

  it("aligns to the trigger when there is room on both sides", () => {
    expect(clampPanelLeft(300, WIDTH, VIEWPORT)).toBe(300);
  });

  it("pulls the panel back from the right edge so it stays on-screen", () => {
    // Trigger near the right edge would overflow (820 + 240 > 1000).
    expect(clampPanelLeft(820, WIDTH, VIEWPORT)).toBe(VIEWPORT - WIDTH - 8);
  });

  it("keeps an 8px floor on the left for narrow viewports", () => {
    expect(clampPanelLeft(0, WIDTH, 100)).toBe(8);
  });
});
