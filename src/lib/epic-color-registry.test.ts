// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  setEpicColorMap,
  setEpicColorOverride,
  getStoredEpicBase,
  getEpicColorVersion,
  subscribeEpicColors,
} from "./epic-color-registry";
import { getEpicColor } from "@/types/ticket";
import { deriveEpicColor } from "./epic-palette";

describe("epic color registry", () => {
  beforeEach(() => {
    setEpicColorMap([]); // reset the module-level singleton between tests
  });

  it("resolves nothing when empty", () => {
    expect(getStoredEpicBase("VPL-X")).toBeNull();
  });

  it("indexes a stored color by key and by upper-cased name", () => {
    setEpicColorMap([{ key: "VPL-A", name: "Checkout Revamp", color: "#e05252" }]);
    expect(getStoredEpicBase("VPL-A")).toBe("#e05252");
    expect(getStoredEpicBase("CHECKOUT REVAMP")).toBe("#e05252");
    expect(getStoredEpicBase("checkout revamp")).toBe("#e05252");
  });

  it("skips entries with no color", () => {
    setEpicColorMap([{ key: "VPL-A", name: "Alpha", color: null }]);
    expect(getStoredEpicBase("VPL-A")).toBeNull();
  });

  it("bumps the version and notifies subscribers on change", () => {
    const before = getEpicColorVersion();
    const listener = vi.fn();
    const unsubscribe = subscribeEpicColors(listener);
    setEpicColorMap([{ key: "VPL-A", name: "Alpha", color: "#e05252" }]);
    expect(getEpicColorVersion()).toBeGreaterThan(before);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("applies and clears an optimistic override", () => {
    setEpicColorOverride("VPL-A", "Alpha", "#9b6cd4");
    expect(getStoredEpicBase("VPL-A")).toBe("#9b6cd4");
    expect(getStoredEpicBase("ALPHA")).toBe("#9b6cd4");

    setEpicColorOverride("VPL-A", "Alpha", null);
    expect(getStoredEpicBase("VPL-A")).toBeNull();
    expect(getStoredEpicBase("ALPHA")).toBeNull();
  });
});

describe("getEpicColor resolution order", () => {
  beforeEach(() => {
    setEpicColorMap([]);
  });

  it("prefers a stored color and derives its variants", () => {
    setEpicColorMap([{ key: "VPL-A", name: "Alpha", color: "#e05252" }]);
    expect(getEpicColor("VPL-A")).toEqual(deriveEpicColor("#e05252"));
    expect(getEpicColor("VPL-A").text).toBe("#e05252");
  });

  it("falls back to the curated map by name", () => {
    expect(getEpicColor("BT: UPSELL").text).toBe("#d97744");
  });

  it("falls back to a deterministic generated color, stable across calls", () => {
    const first = getEpicColor("Some Unmapped Epic");
    const second = getEpicColor("Some Unmapped Epic");
    expect(first).toEqual(second);
    expect(first.text).toMatch(/^hsl/);
    expect(first).toHaveProperty("border");
  });
});
