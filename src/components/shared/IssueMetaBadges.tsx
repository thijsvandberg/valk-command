"use client";

// Uniform 18px-high metadata chips for issue-list rows (ChildIssueRow's metadataSlot).
// One height + padding + icon size across epic / subtask-count / in-refinement / sprint /
// SP / BV so the trailing badges always line up. Display-only; editing lives in the pickers.

import { Hash, TrendingUp, Boxes, IterationCw, Layers, Inbox } from "lucide-react";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { getSpColor, getBvColor } from "@/types/ticket";
import { useEpicColor } from "@/hooks/useEpicColor";
import { Tooltip } from "@/components/shared/Tooltip";

const CHIP = "inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-label font-medium leading-none";

// The single source of truth for the colored epic chip. `className` controls its
// width behavior so it can both cap (default list rows) and shrink (dense board
// rows) without re-implementing the visual. Uses the reactive color hook so the
// chip re-renders when the PO reassigns an epic's color.
export function EpicBadge({ epic, className = "max-w-[160px]" }: { epic: string; className?: string }) {
  const c = useEpicColor(epic);
  return (
    <Tooltip content={epic} className="min-w-0">
      <span
        className={`${CHIP} truncate border-l-2 pl-1.5 pr-2 tracking-wide ${className}`}
        style={{ backgroundColor: c.bg, color: c.text, borderLeftColor: c.text }}
      >
        {epic}
      </span>
    </Tooltip>
  );
}

export function SubtaskCountBadge({ open, total }: { open: number; total: number }) {
  if (total <= 0) return null;
  return (
    <Tooltip content={`${open} open / ${total} subtask${total === 1 ? "" : "s"}`}>
      <span className={`${CHIP} gap-1 bg-overlay-default tabular-nums text-text-muted`}>
        <IssueTypeIcon type="subtask" size={11} />
        {open}/{total}
      </span>
    </Tooltip>
  );
}

// In-refinement: bare Boxes icon, no chip background, matching the sprint board
// row (BoardRow) for cross-view consistency. Theme-aware brand teal; the session
// name(s) live in the tooltip.
export function InRefinementBadge({ sessionNames }: { sessionNames?: string[] }) {
  if (!sessionNames || sessionNames.length === 0) return null;
  return (
    <Tooltip content={`In refinement: ${sessionNames.join(", ")}`}>
      <span className="inline-flex h-5 shrink-0 items-center justify-center" style={{ color: "var(--meta-refine-fg)" }}>
        <Boxes size={14} strokeWidth={1.75} />
      </span>
    </Tooltip>
  );
}

export function SprintBadge({ name }: { name: string | null }) {
  if (!name) return null;
  return (
    <Tooltip content={name}>
      <span className={`${CHIP} gap-1 bg-overlay-subtle text-text-tertiary`}>
        <IterationCw size={10} strokeWidth={1.75} className="shrink-0 opacity-70" />
        <span className="max-w-[120px] truncate">{name}</span>
      </span>
    </Tooltip>
  );
}

// Sprint/backlog placement indicator (BRDG-298): shows the resolved sprint name
// when the ticket sits in a sprint, otherwise a neutral "Backlog" chip. Distinct
// icon (inbox) and muted treatment for backlog so a parked ticket reads as parked
// rather than as just another empty sprint.
export function SprintOrBacklogBadge({ sprintName }: { sprintName: string | null }) {
  if (sprintName) return <SprintBadge name={sprintName} />;
  return (
    <Tooltip content="In the backlog (not assigned to a sprint)">
      <span className={`${CHIP} gap-1 bg-overlay-subtle text-text-muted`}>
        <Inbox size={10} strokeWidth={1.75} className="shrink-0 opacity-70" />
        Backlog
      </span>
    </Tooltip>
  );
}

// Epic child-story count (BRDG-298): how many tickets are parented to this epic.
// Layers icon reads as "contains a stack of work". Rendered only for epic rows,
// replacing the subtask-count badge (epics have stories, not subtasks).
export function EpicChildCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Tooltip content={`${count} ${count === 1 ? "story" : "stories"} under this epic`}>
      <span className={`${CHIP} gap-1 bg-overlay-default tabular-nums text-text-muted`}>
        <Layers size={11} strokeWidth={1.75} className="shrink-0 opacity-80" />
        {count}
      </span>
    </Tooltip>
  );
}

const METRIC = {
  sp: { Icon: Hash, label: "Story Points", color: getSpColor },
  bv: { Icon: TrendingUp, label: "Business Value", color: getBvColor },
} as const;

// Display-only SP / BV chip at the uniform height (the editable trigger lives in the pickers).
export function MetricChip({ metric, value }: { metric: "sp" | "bv"; value: number }) {
  const { Icon, label, color } = METRIC[metric];
  const c = color(value);
  return (
    <Tooltip content={`${label}: ${value}`}>
      <span className={`${CHIP} gap-1 tabular-nums`} style={{ backgroundColor: c.bg, color: c.text }}>
        <Icon size={11} strokeWidth={2} aria-hidden />
        {value}
      </span>
    </Tooltip>
  );
}
