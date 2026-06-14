import type { CSSProperties } from "react";

// Unified drag-and-drop target treatment (the "solid fill" direction). Shared by
// the sprint board "Move to" pills, the refinement session chips and the
// Plan-session zone so a drop target looks identical everywhere.
//
//   available : a valid target while a drag is in progress (subtle brand outline)
//   over      : the target under the pointer — fills solid brand and lifts ("locked on")
//
// The base element must reserve a 1px border (e.g. `border border-transparent`)
// so toggling these classes never shifts layout.

export const DROP_TARGET_TRANSITION =
  "transform 200ms cubic-bezier(0.34, 1.3, 0.5, 1), box-shadow 180ms ease, background-color 150ms ease, border-color 150ms ease, color 150ms ease";

export function dropTargetClasses(over: boolean): string {
  return over
    ? "border-transparent bg-[var(--color-brand-500)] text-white"
    : "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/[0.06] text-text-secondary";
}

export function dropTargetStyle(over: boolean): CSSProperties {
  return over
    ? { transform: "scale(1.03)", boxShadow: "0 6px 18px -6px var(--color-brand-glow)", transition: DROP_TARGET_TRANSITION }
    : { transition: DROP_TARGET_TRANSITION };
}
