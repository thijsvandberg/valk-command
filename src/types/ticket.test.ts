import { describe, it, expect } from "vitest";
import {
  getSpColor,
  getBvColor,
  getGuestimationColor,
  effectivePoints,
} from "./ticket";

describe("getSpColor", () => {
  it("returns one flat slate tone for every positive value (no ramp)", () => {
    const one = getSpColor(1);
    for (const v of [2, 3, 5, 8, 13, 21]) {
      expect(getSpColor(v)).toEqual(one);
    }
  });

  it("uses a theme-aware foreground var, not a fixed hex", () => {
    expect(getSpColor(3).text).toBe("var(--meta-sp-fg)");
  });

  it("returns the neutral N/A tone for 0 and negative values", () => {
    expect(getSpColor(0)).toEqual(getSpColor(-1));
    expect(getSpColor(0).text).not.toBe(getSpColor(5).text);
  });

  it("returns an object with text, bg and solid properties", () => {
    const color = getSpColor(3);
    expect(color).toHaveProperty("text");
    expect(color).toHaveProperty("bg");
    expect(color).toHaveProperty("solid");
  });

  it("never uses an amber/green/red hue (off the traffic-light palette)", () => {
    // The slate solid sits in the cool grey-blue range, not green/amber/red.
    expect(getSpColor(5).solid).toBe("#64748b");
  });
});

describe("getBvColor", () => {
  it("returns one flat violet tone for every positive value (no ramp)", () => {
    const one = getBvColor(1);
    for (const v of [2, 3, 4, 5, 6, 7]) {
      expect(getBvColor(v)).toEqual(one);
    }
  });

  it("uses a theme-aware foreground var and a violet solid (never amber)", () => {
    expect(getBvColor(5).text).toBe("var(--meta-bv-fg)");
    expect(getBvColor(5).solid).toBe("#8b5cf6");
  });

  it("returns the neutral N/A tone for 0", () => {
    expect(getBvColor(0).text).not.toBe(getBvColor(5).text);
  });
});

describe("getGuestimationColor", () => {
  it("wears the SAME slate tone as SP (set apart by the dashed border, not hue)", () => {
    for (const v of [1, 2, 3, 5, 8]) {
      expect(getGuestimationColor(v)).toEqual(getSpColor(v));
    }
  });

  it("returns the neutral N/A tone for 0 and negative values", () => {
    expect(getGuestimationColor(0)).toEqual(getGuestimationColor(-1));
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
