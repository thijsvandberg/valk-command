"use client";

// Wraps an empty SP/BV placeholder so it reserves no horizontal space and only
// surfaces on row hover (BRDG-310). Unlike an opacity-only reveal, this uses
// `display: none` so a hidden slot is dropped from the flex flow entirely - no
// reserved width and no phantom `gap` between the surrounding filled badges.
//
// Relies on the surrounding row exposing a `group/row` (both BoardRow and
// ChildIssueRow do). stopPropagation keeps a click on the picker from also
// selecting the row, matching the trailing metric group.
//
// hideWhenNarrow drops the placeholder entirely (no hover reveal) once the row's
// own width falls below ~720px - e.g. when the ticket detail panel is open and
// the list column is cramped. Requires an ancestor marked `@container/boardrow`.
export function HoverRevealSlot({ children, hideWhenNarrow = false }: { children: React.ReactNode; hideWhenNarrow?: boolean }) {
  return (
    <span
      className={`hidden shrink-0 ${hideWhenNarrow ? "@[45rem]/boardrow:group-hover/row:inline-flex" : "group-hover/row:inline-flex"}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </span>
  );
}
