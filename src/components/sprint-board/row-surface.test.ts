import { describe, it, expect } from "vitest";
import { rowSurfaceClasses, type RowSurfaceState } from "./row-surface";

// A row at rest: nothing selected/checked/flagged/etc.
const REST: RowSurfaceState = {
  selected: false,
  contextTarget: false,
  checked: false,
  flagged: false,
  focused: false,
  removed: false,
  deprecated: false,
  inflight: false,
  lastInCard: false,
  firstInCard: false,
  hideAccent: false,
  livePulse: false,
};
const s = (over: Partial<RowSurfaceState>): RowSurfaceState => ({ ...REST, ...over });

// These pinned strings ARE the contract: BoardRow and ChildIssueRow both render exactly these
// surfaces, so any edit here is a deliberate, reviewed change to every issue row at once.
describe("rowSurfaceClasses", () => {
  it("resting row: reserved transparent border + resting hover bg + hover accent", () => {
    expect(rowSurfaceClasses(REST)).toBe(
      "border-l-[3px] hover:bg-overlay-subtle border-l-transparent hover:border-l-[var(--color-brand-400)]/25",
    );
  });

  it("selected row: brand tint + brand accent", () => {
    expect(rowSurfaceClasses(s({ selected: true }))).toBe(
      "border-l-[3px] bg-[var(--color-brand-600)]/12 border-l-[var(--color-brand-300)]",
    );
  });

  it("context-target renders identically to selected", () => {
    expect(rowSurfaceClasses(s({ contextTarget: true }))).toBe(rowSurfaceClasses(s({ selected: true })));
  });

  it("checked row: faint brand tint with hover + brand accent", () => {
    expect(rowSurfaceClasses(s({ checked: true }))).toBe(
      "border-l-[3px] bg-[var(--color-brand-500)]/6 hover:bg-[var(--color-brand-500)]/10 border-l-[var(--color-brand-300)]",
    );
  });

  it("flagged row: error tint + error accent", () => {
    expect(rowSurfaceClasses(s({ flagged: true }))).toBe(
      "border-l-[3px] bg-[color-mix(in_srgb,var(--color-status-error)_6%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-status-error)_8%,transparent)] border-l-[var(--color-status-error)]",
    );
  });

  it("hideAccent keeps the tint but drops the colored accent", () => {
    expect(rowSurfaceClasses(s({ selected: true, hideAccent: true }))).toBe(
      "border-l-[3px] bg-[var(--color-brand-600)]/12 border-l-transparent",
    );
  });

  it("focused (and not active) adds the outline ring", () => {
    expect(rowSurfaceClasses(s({ focused: true }))).toBe(
      "border-l-[3px] hover:bg-overlay-subtle border-l-transparent hover:border-l-[var(--color-brand-400)]/25 outline outline-1 -outline-offset-1 outline-[var(--color-brand-500)]/40",
    );
  });

  it("focus outline is suppressed when the row is already active", () => {
    expect(rowSurfaceClasses(s({ focused: true, selected: true }))).toBe(rowSurfaceClasses(s({ selected: true })));
  });

  it("opacity precedence: removed > deprecated > inflight", () => {
    expect(rowSurfaceClasses(s({ removed: true }))).toContain("opacity-50");
    expect(rowSurfaceClasses(s({ deprecated: true }))).toContain("opacity-60");
    expect(rowSurfaceClasses(s({ inflight: true }))).toContain("opacity-70");
    // removed wins over the others
    const all = rowSurfaceClasses(s({ removed: true, deprecated: true, inflight: true }));
    expect(all).toContain("opacity-50");
    expect(all).not.toContain("opacity-60");
    expect(all).not.toContain("opacity-70");
  });

  it("tint precedence: selected > checked > flagged", () => {
    expect(rowSurfaceClasses(s({ selected: true, checked: true, flagged: true }))).toBe(rowSurfaceClasses(s({ selected: true })));
    expect(rowSurfaceClasses(s({ checked: true, flagged: true }))).toBe(rowSurfaceClasses(s({ checked: true })));
  });

  it("rounds the card-edge corners", () => {
    expect(rowSurfaceClasses(s({ firstInCard: true }))).toContain("rounded-t-[11px]");
    expect(rowSurfaceClasses(s({ lastInCard: true }))).toContain("rounded-b-[11px]");
  });

  it("adds live-pulse when the ticket changed elsewhere", () => {
    expect(rowSurfaceClasses(s({ livePulse: true }))).toContain("live-pulse");
  });

  it('accent "none" omits every border-l class but keeps the tint', () => {
    const out = rowSurfaceClasses(s({ selected: true }), { accent: "none" });
    expect(out).toBe("bg-[var(--color-brand-600)]/12");
    expect(out).not.toContain("border-l");
  });
});
