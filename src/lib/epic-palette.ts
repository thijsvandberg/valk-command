// Curated base colors a PO can assign to an epic (BRDG-250). Deliberately
// warm-leaning plus a few distinct cool hues, steering clear of the status
// colors used elsewhere: done-green (#22c55e), in-progress sky-blue (#58b4e6),
// todo-grey (#94a3b8), brand-teal (#14a8a3) and testing-purple. Each reads
// acceptably as foreground text on both light and dark surfaces.

export interface EpicSwatch {
  id: string;
  label: string;
  base: string;
}

export const EPIC_PALETTE: EpicSwatch[] = [
  { id: "red", label: "Red", base: "#e05252" },
  { id: "coral", label: "Coral", base: "#e07a5f" },
  { id: "orange", label: "Orange", base: "#e0913d" },
  { id: "amber", label: "Amber", base: "#c99a35" },
  { id: "magenta", label: "Magenta", base: "#cf5bb0" },
  { id: "rose", label: "Rose", base: "#e06a82" },
  { id: "violet", label: "Violet", base: "#9b6cd4" },
  { id: "indigo", label: "Indigo", base: "#7480e6" },
  { id: "wine", label: "Wine", base: "#a8557a" },
];

const PALETTE_BASES = new Set(EPIC_PALETTE.map((s) => s.base.toLowerCase()));

/** True when the value is one of the curated palette base hexes. */
export function isPaletteColor(value: string): boolean {
  return PALETTE_BASES.has(value.toLowerCase());
}

export interface EpicColorVariants {
  bg: string;
  text: string;
  border: string;
}

// Derives subtle/border/text variants from a single base color via color-mix,
// matching the convention used by TEAM_COLORS and the status tokens. The base
// itself is the foreground (text) color; the tints are theme-safe because
// color-mix with transparent composites over whatever surface is behind it.
export function deriveEpicColor(base: string): EpicColorVariants {
  return {
    bg: `color-mix(in srgb, ${base} 15%, transparent)`,
    border: `color-mix(in srgb, ${base} 40%, transparent)`,
    text: base,
  };
}
