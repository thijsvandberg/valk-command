"use client";

// Uniform 18px-high metadata chips for issue-list rows (ChildIssueRow's metadataSlot).
// One height + padding + icon size across epic / subtask-count / in-refinement / sprint /
// SP / BV so the trailing badges always line up. Display-only; editing lives in the pickers.

import { Gauge, Goal, Gem, IterationCw } from "lucide-react";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { getSpColor, getBvColor } from "@/types/ticket";
import { useEpicColor } from "@/hooks/useEpicColor";
import { Tooltip } from "@/components/shared/Tooltip";

const CHIP = "inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-[11px] font-medium leading-none";

// The single source of truth for the colored epic chip. `className` controls its
// width behavior so it can both cap (default list rows) and shrink (dense board
// rows) without re-implementing the visual. Uses the reactive color hook so the
// chip re-renders when the PO reassigns an epic's color.
export function EpicBadge({ epic, className = "max-w-[160px]" }: { epic: string; className?: string }) {
  const c = useEpicColor(epic);
  return (
    <span
      className={`${CHIP} truncate border-l-2 pl-1.5 pr-2 tracking-wide ${className}`}
      style={{ backgroundColor: c.bg, color: c.text, borderLeftColor: c.text }}
      title={epic}
    >
      {epic}
    </span>
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

// In-refinement: gem-icon-only square chip (5.A). The session name(s) live in the tooltip.
export function InRefinementBadge({ sessionNames }: { sessionNames?: string[] }) {
  if (!sessionNames || sessionNames.length === 0) return null;
  return (
    <Tooltip content={`In refinement: ${sessionNames.join(", ")}`}>
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--color-brand-500)]/[0.1] text-[var(--color-brand-400)]">
        <Gem size={11} strokeWidth={1.75} />
      </span>
    </Tooltip>
  );
}

export function SprintBadge({ name }: { name: string | null }) {
  if (!name) return null;
  return (
    <span className={`${CHIP} gap-1 bg-overlay-subtle text-text-tertiary`} title={name}>
      <IterationCw size={10} strokeWidth={1.75} className="shrink-0 opacity-70" />
      <span className="max-w-[120px] truncate">{name}</span>
    </span>
  );
}

const METRIC = {
  sp: { Icon: Gauge, label: "Story Points", color: getSpColor },
  bv: { Icon: Goal, label: "Business Value", color: getBvColor },
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
