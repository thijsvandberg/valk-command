"use client";

import { useRef } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { Check } from "lucide-react";
import type { JiraStatus } from "@/types/ticket";

export type StatusFilter = "all" | JiraStatus;

export const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "TO DO", label: "To Do" },
  { value: "IN PROGRESS", label: "In Progress" },
  { value: "DONE", label: "Done" },
];

export interface FieldToggle {
  id: string;
  label: string;
}

interface FieldFilterPopoverProps {
  filter: StatusFilter;
  setFilter: (f: StatusFilter) => void;
  statusCounts: Record<string, number>;
  fields: FieldToggle[];
  visibleFields: Set<string>;
  onToggleField: (id: string, show: boolean) => void;
  onClose: () => void;
}

export function FieldFilterPopover({
  filter,
  setFilter,
  statusCounts,
  fields,
  visibleFields,
  onToggleField,
  onClose,
}: FieldFilterPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useOutsideClick(ref, onClose);

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 z-50 mt-1 min-w-[180px] rounded-xl border border-border-default bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-popover)]"
      style={{ animation: "fadeInUp 0.1s ease" }}
    >
      {/* Status filter */}
      <div className="px-3 py-1.5 text-caption font-semibold uppercase tracking-wider text-text-muted">
        Status
      </div>
      {STATUS_FILTER_OPTIONS.map((opt) => {
        const isActive = filter === opt.value;
        const count = statusCounts[opt.value as keyof typeof statusCounts] ?? 0;
        if (opt.value !== "all" && count === 0) return null;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setFilter(opt.value)}
            className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-[7px] text-body-sm hover:bg-hover-list-item active:bg-overlay-default"
          >
            <span className={isActive ? "font-medium text-text-primary" : "text-text-secondary"}>
              {opt.label}
            </span>
            <span className="ml-auto tabular-nums text-caption text-text-muted">{count}</span>
          </button>
        );
      })}

      {/* Column visibility toggles */}
      {fields.length > 0 && (
        <>
          <div className="my-1 h-px bg-border-subtle" />
          <div className="px-3 py-1.5 text-caption font-semibold uppercase tracking-wider text-text-muted">
            Columns
          </div>
          {fields.map((field) => {
            const isVisible = visibleFields.has(field.id);
            return (
              <button
                key={field.id}
                type="button"
                onClick={() => onToggleField(field.id, !isVisible)}
                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-[7px] text-body-sm hover:bg-hover-list-item active:bg-overlay-default"
              >
                <span
                  className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors duration-100 ${
                    isVisible
                      ? "border-[var(--color-brand-400)] bg-[var(--color-brand-400)]"
                      : "border-border-default bg-transparent"
                  }`}
                >
                  {isVisible && <Check size={10} strokeWidth={3} className="text-white" />}
                </span>
                <span className="text-text-secondary">
                  {field.label.charAt(0).toUpperCase() + field.label.slice(1)}
                </span>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}
