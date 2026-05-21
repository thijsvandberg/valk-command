"use client";

import type { Sprint } from "@/types/ticket";
import { Popover } from "@/components/shared/Popover";
import { Calendar, Target, Pencil } from "lucide-react";

interface SprintDetailsPopoverProps {
  sprint: Sprint;
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
    <Popover open={open} onClose={onClose} align="left" offsetClass="mt-2" className="w-72">
      <div className="p-3.5 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-widest text-text-muted">
            Sprint details
          </span>
          <button
            type="button"
            onClick={() => {
              onClose();
              onEdit();
            }}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-tertiary cursor-pointer
              hover:bg-hover-interactive hover:text-text-secondary active:bg-overlay-strong
              transition-colors duration-100"
            title="Edit sprint details"
          >
            <Pencil size={11} strokeWidth={1.5} />
            <span>Edit</span>
          </button>
        </div>

        {/* Dates */}
        {hasDates && (
          <div className="flex items-start gap-2.5">
            <Calendar size={13} strokeWidth={1.5} className="mt-0.5 shrink-0 text-text-muted" />
            <div className="text-xs leading-relaxed text-text-secondary">
              <div>{formatDate(sprint.startDate!)}</div>
              <div className="text-text-muted">to</div>
              <div>{formatDate(sprint.endDate!)}</div>
            </div>
          </div>
        )}

        {/* Separator */}
        <div className="h-px bg-border-default" />

        {/* Goal */}
        <div className="flex items-start gap-2.5">
          <Target size={13} strokeWidth={1.5} className="mt-0.5 shrink-0 text-text-muted" />
          <div className="text-xs leading-relaxed">
            {hasGoal ? (
              <p className="text-text-secondary">{sprint.goal}</p>
            ) : (
              <p className="italic text-text-muted">No goal set</p>
            )}
          </div>
        </div>
      </div>
    </Popover>
  );
}
