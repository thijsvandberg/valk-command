"use client";

// Wraps an empty SP/BV placeholder so it reserves no horizontal space and only
// surfaces on row hover (BRDG-310). Unlike an opacity-only reveal, this uses
// `display: none` so a hidden slot is dropped from the flex flow entirely - no
// reserved width and no phantom `gap` between the surrounding filled badges.
//
// Relies on the surrounding row exposing a `group/row` (both BoardRow and
// ChildIssueRow do). stopPropagation keeps a click on the picker from also
// selecting the row, matching the trailing metric group.
export function HoverRevealSlot({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="hidden shrink-0 group-hover/row:inline-flex"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </span>
  );
}
