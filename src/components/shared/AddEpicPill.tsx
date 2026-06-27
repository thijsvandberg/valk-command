"use client";

import { EpicPicker, type EpicOption } from "@/components/shared/EpicPicker";

// Ghost "Add epic" affordance for issue rows that carry no epic yet (BRDG-131).
// Idle it is invisible so empty rows stay clean; it reveals on row hover (and
// stays visible while its picker is open). Selecting an epic flows through the
// same onChange the row already wires to its epic-change handler, so it reuses
// the existing edit-to-Jira path rather than introducing a new one.
//
// Relies on the surrounding row exposing a `group/row` (both BoardRow and
// ChildIssueRow do) for the hover reveal.
const GHOST_TRIGGER =
  "inline-flex items-center gap-1 rounded-md border border-dashed border-border-default px-1.5 py-0.5 text-label font-medium text-text-muted opacity-0 cursor-pointer " +
  "transition-[opacity,color,background-color,border-color] duration-150 " +
  "group-hover/row:opacity-100 focus-visible:opacity-100 " +
  "hover:border-[var(--color-icon-epic)]/50 hover:bg-[color-mix(in_srgb,var(--color-icon-epic)_8%,transparent)] hover:text-[var(--color-icon-epic)] " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]";

export function AddEpicPill({
  ticketKey,
  onChange,
  align = "right",
}: {
  ticketKey: string;
  onChange: (epic: EpicOption | null) => void;
  align?: "left" | "right";
}) {
  return (
    <span
      className="shrink-0"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <EpicPicker
        value={null}
        onChange={onChange}
        ticketKey={ticketKey}
        align={align}
        emptyLabel="Add epic"
        emptyTriggerClassName={GHOST_TRIGGER}
      />
    </span>
  );
}
