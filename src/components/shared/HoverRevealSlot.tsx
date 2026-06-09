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
//
// `focus-within:inline-flex` keeps the slot rendered while the picker inside is
// open: clicking the trigger focuses it, so once its popover opens the cursor can
// leave the row (dropping :hover) without collapsing the trigger to display:none.
// A collapsed trigger has a 0x0 rect, which would make floating-ui snap the open
// popover to the top-left corner (BRDG-303).
//
// `forceOpen` keeps the whole placeholder cluster visible while ANY picker in the
// row is open (the open picker's popover is portaled to the body, so its focus no
// longer lives inside a sibling slot). Without it, moving the cursor from the row
// into the open dropdown drops :hover and collapses the neighbouring placeholders,
// which is jarring (BRDG-323).
export function HoverRevealSlot({
  children,
  hideWhenNarrow = false,
  forceOpen = false,
}: {
  children: React.ReactNode;
  hideWhenNarrow?: boolean;
  forceOpen?: boolean;
}) {
  return (
    <span
      className={`${forceOpen ? "inline-flex" : "hidden"} shrink-0 focus-within:inline-flex ${hideWhenNarrow ? "@[45rem]/boardrow:group-hover/row:inline-flex" : "group-hover/row:inline-flex"}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </span>
  );
}
