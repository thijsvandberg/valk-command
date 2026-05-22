"use client";

import type { Sprint } from "@/types/ticket";
import { Popover } from "@/components/shared/Popover";
import { Pencil, Sparkles } from "lucide-react";

interface SprintDetailsPopoverProps {
  sprint: Sprint;
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
  onSuggestGoal?: () => void;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export function SprintDetailsPopover({
  sprint,
  open,
  onClose,
  onEdit,
  onSuggestGoal,
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
          <p className="flex items-center gap-1.5 text-xs italic text-text-muted">
            <span>No sprint goal set</span>
            {onSuggestGoal && (
              <button
                type="button"
                onClick={() => { onClose(); onSuggestGoal(); }}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium not-italic cursor-pointer
                  text-[var(--color-brand-400)]
                  hover:bg-[var(--color-brand-500)]/10
                  active:bg-[var(--color-brand-500)]/15
                  transition-colors duration-100"
              >
                <Sparkles size={10} strokeWidth={1.5} className="shrink-0" />
                Suggest with AI
              </button>
            )}
          </p>
        )}

        {/* Divider + actions */}
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
