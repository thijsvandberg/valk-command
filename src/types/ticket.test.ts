import { describe, it, expect } from "vitest";
import { getSpColor, SP_COLORS } from "./ticket";

describe("getSpColor", () => {
  it("returns the correct color for each preset value", () => {
    expect(getSpColor(0)).toBe(SP_COLORS[0]);
    expect(getSpColor(1)).toBe(SP_COLORS[1]);
    expect(getSpColor(2)).toBe(SP_COLORS[2]);
    expect(getSpColor(3)).toBe(SP_COLORS[3]);
    expect(getSpColor(5)).toBe(SP_COLORS[5]);
    expect(getSpColor(8)).toBe(SP_COLORS[8]);
  });

  it("returns SP_COLORS[0] for negative values", () => {
    expect(getSpColor(-1)).toBe(SP_COLORS[0]);
  });

  it("maps custom values to the nearest band", () => {
    // 4 should fall in the <=5 band
    expect(getSpColor(4)).toBe(SP_COLORS[5]);
    // 13 should fall in the highest band (>5)
    expect(getSpColor(13)).toBe(SP_COLORS[8]);
    // 21 should also be highest
    expect(getSpColor(21)).toBe(SP_COLORS[8]);
  });

  it("returns an object with text and bg properties", () => {
    const color = getSpColor(3);
    expect(color).toHaveProperty("text");
    expect(color).toHaveProperty("bg");
    expect(typeof color.text).toBe("string");
    expect(typeof color.bg).toBe("string");
  });
});
