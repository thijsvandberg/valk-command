import { describe, it, expect } from "vitest";
import {
  getSpColor,
  SP_COLORS,
  getGuestimationColor,
  GUESS_COLORS,
  effectivePoints,
  fullnessBand,
} from "./ticket";

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

describe("getGuestimationColor", () => {
  it("returns the muted band for each Fibonacci value", () => {
    expect(getGuestimationColor(1)).toBe(GUESS_COLORS[1]);
    expect(getGuestimationColor(2)).toBe(GUESS_COLORS[2]);
    expect(getGuestimationColor(3)).toBe(GUESS_COLORS[3]);
    expect(getGuestimationColor(5)).toBe(GUESS_COLORS[5]);
    expect(getGuestimationColor(8)).toBe(GUESS_COLORS[8]);
  });

  it("is visually distinct from the SP ramp (never the green text)", () => {
    // A guess must never read as a refined estimate: its ramp differs from SP's.
    for (const v of [1, 2, 3, 5, 8]) {
      expect(getGuestimationColor(v).text).not.toBe(getSpColor(v).text);
    }
  });

  it("clamps out-of-range values to the nearest band", () => {
    expect(getGuestimationColor(0)).toBe(GUESS_COLORS[0]);
    expect(getGuestimationColor(-1)).toBe(GUESS_COLORS[0]);
    expect(getGuestimationColor(13)).toBe(GUESS_COLORS[8]);
  });
});

describe("effectivePoints", () => {
  it("uses real story points when present", () => {
    expect(effectivePoints(5, 8)).toBe(5);
  });

  it("falls back to the guestimation when there is no SP", () => {
    expect(effectivePoints(null, 3)).toBe(3);
    expect(effectivePoints(undefined, 2)).toBe(2);
  });

  it("treats a present-but-zero SP as a real 0, suppressing the guess", () => {
    // An N/A (0) SP wins over a stale guess so the meter does not double-count.
    expect(effectivePoints(0, 8)).toBe(0);
  });

  it("returns 0 when neither is set", () => {
    expect(effectivePoints(null, null)).toBe(0);
    expect(effectivePoints(undefined, undefined)).toBe(0);
  });
});

describe("fullnessBand", () => {
  it("is healthy below 0.85", () => {
    expect(fullnessBand(0)).toBe("healthy");
    expect(fullnessBand(0.5)).toBe("healthy");
    expect(fullnessBand(0.849)).toBe("healthy");
  });

  it("is approaching from 0.85 up to and including 1.0", () => {
    expect(fullnessBand(0.85)).toBe("approaching");
    expect(fullnessBand(0.95)).toBe("approaching");
    expect(fullnessBand(1)).toBe("approaching");
  });

  it("is over above 1.0", () => {
    expect(fullnessBand(1.01)).toBe("over");
    expect(fullnessBand(2)).toBe("over");
  });
});
