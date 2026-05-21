"use client";

import type { Sprint } from "@/types/ticket";
import { Popover } from "@/components/shared/Popover";
import { Pencil } from "lucide-react";

interface SprintDetailsPopoverProps {
  sprint: Sprint;
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function SprintDetailsPopover({
  sprint,
  open,
  onClose,
  onEdit,
}: SprintDetailsPopoverProps) {
  const hasGoal = sprint.goal && sprint.goal.trim().length > 0;
  const hasDates = sprint.startDate && sprint.endDate;

  return (
    <Popover open={open} onClose={onClose} align="left" offsetClass="mt-2" className="w-64">
      <div className="px-3.5 py-3 space-y-2">
        {/* Date range row */}
        {hasDates && (
          <div className="text-xs text-text-secondary tabular-nums">
            {fmtDate(sprint.startDate!)} &ndash; {fmtDate(sprint.endDate!)}
          </div>
        )}

        {/* Goal */}
        {hasGoal ? (
          <p className="text-xs leading-relaxed text-text-primary">{sprint.goal}</p>
        ) : (
          <p className="text-xs italic text-text-muted">No sprint goal set</p>
        )}

        {/* Divider + edit */}
        <div className="pt-0.5">
          <div className="h-px bg-border-default -mx-3.5 mb-2" />
          <button
            type="button"
            onClick={() => { onClose(); onEdit(); }}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-text-secondary cursor-pointer
              hover:bg-hover-interactive hover:text-text-primary active:bg-overlay-strong
              transition-colors duration-100"
          >
            <Pencil size={11} strokeWidth={1.5} className="shrink-0 opacity-60" />
            <span>Edit details</span>
          </button>
        </div>
      </div>
    </Popover>
  );
}
