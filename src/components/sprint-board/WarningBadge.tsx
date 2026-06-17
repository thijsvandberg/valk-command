"use client";

import { useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { Ticket } from "@/types/ticket";
import { type WarningKind, WARNING_LABELS } from "@/components/sprint-board/warning-filter";
import { IndicatorPopover } from "@/components/sprint-board/OpenSubtasksIndicator";
import { AddSubtasksModal } from "@/components/sprint-board/AddSubtasksModal";

interface WarningBadgeProps {
  kind: WarningKind;
  ticket: Ticket;
  onCloseSubtasks?: (key: string) => Promise<void>;
  onSubtasksAdded?: (key: string, count: number) => void;
}

// Shared chip treatment for the estimate-hygiene warnings shown in the warning lens
// (BRDG-313/366). Contrast bumped over the old muted amber so the text reads clearly
// against the row (BRDG-366). Interactive kinds layer hover/focus/active on top.
const BADGE_BASE =
  "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-medium leading-none " +
  "text-[color-mix(in_srgb,var(--color-status-warning)_82%,var(--color-text-primary))] " +
  "bg-[color-mix(in_srgb,var(--color-status-warning)_14%,transparent)]";

const BADGE_INTERACTIVE =
  " cursor-pointer transition-[background-color,color] duration-150 " +
  "hover:bg-[color-mix(in_srgb,var(--color-status-warning)_24%,transparent)] " +
  "hover:text-[color-mix(in_srgb,var(--color-status-warning)_92%,var(--color-text-primary))] " +
  "active:bg-[color-mix(in_srgb,var(--color-status-warning)_30%,transparent)] " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-status-warning)]";

export function WarningBadge({ kind, ticket, onCloseSubtasks, onSubtasksAdded }: WarningBadgeProps) {
  const label = WARNING_LABELS[kind];
  const icon = <AlertTriangle size={11} strokeWidth={2} className="shrink-0" aria-hidden />;

  // "Closed with open subtasks": the badge opens the subtask popover (list + close-all),
  // replacing the old always-on amber indicator (BRDG-366).
  if (kind === "closed_with_open_subtasks") {
    return <ClosedSubtasksBadge label={label} icon={icon} ticket={ticket} onCloseSubtasks={onCloseSubtasks} />;
  }

  // "No subtasks": the badge opens the add-subtasks modal so the PO can fix it inline (BRDG-366).
  if (kind === "no_subtasks" && onSubtasksAdded) {
    return <NoSubtasksBadge label={label} icon={icon} ticket={ticket} onSubtasksAdded={onSubtasksAdded} />;
  }

  return (
    <span className={BADGE_BASE}>
      {icon}
      {label}
    </span>
  );
}

function ClosedSubtasksBadge({
  label,
  icon,
  ticket,
  onCloseSubtasks,
}: {
  label: string;
  icon: React.ReactNode;
  ticket: Ticket;
  onCloseSubtasks?: (key: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <span className="relative inline-flex shrink-0" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className={BADGE_BASE + BADGE_INTERACTIVE}
        title={`${ticket.openSubtaskCount ?? 0} of ${ticket.totalSubtaskCount ?? 0} subtasks still open`}
      >
        {icon}
        {label}
      </button>
      {open && (
        <IndicatorPopover
          ticketKey={ticket.key}
          openCount={ticket.openSubtaskCount ?? 0}
          totalCount={ticket.totalSubtaskCount ?? 0}
          onCloseSubtasks={onCloseSubtasks}
          onClose={() => setOpen(false)}
          triggerRef={triggerRef}
        />
      )}
    </span>
  );
}

function NoSubtasksBadge({
  label,
  icon,
  ticket,
  onSubtasksAdded,
}: {
  label: string;
  icon: React.ReactNode;
  ticket: Ticket;
  onSubtasksAdded: (key: string, count: number) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span className="inline-flex shrink-0" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={BADGE_BASE + BADGE_INTERACTIVE}
        title="Add subtasks"
      >
        {icon}
        {label}
      </button>
      {open && (
        <AddSubtasksModal
          open
          ticketKey={ticket.key}
          ticketTitle={ticket.title}
          onClose={() => setOpen(false)}
          onCreated={(count) => onSubtasksAdded(ticket.key, count)}
        />
      )}
    </span>
  );
}
