"use client";

import { useRef, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 z-50 mt-1 min-w-[180px] rounded-xl border border-border-default bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-popover)]"
      style={{ animation: "fadeInUp 0.1s ease" }}
    >
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
            className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-[7px] text-xs hover:bg-hover-list-item active:bg-overlay-default"
          >
            <span className={isActive ? "font-medium text-text-primary" : "text-text-secondary"}>
              {opt.label}
            </span>
            <span className="ml-auto tabular-nums text-caption text-text-muted">{count}</span>
          </button>
        );
      })}
      {fields.length > 0 && <div className="my-1 h-px bg-border-subtle" />}
      {fields.map((field) => {
        const isVisible = visibleFields.has(field.id);
        return (
          <button
            key={field.id}
            type="button"
            onClick={() => onToggleField(field.id, !isVisible)}
            className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-[7px] text-xs hover:bg-hover-list-item active:bg-overlay-default"
          >
            {isVisible ? (
              <EyeOff size={12} strokeWidth={1.5} className="shrink-0 text-text-muted" />
            ) : (
              <Eye size={12} strokeWidth={1.5} className="shrink-0 text-text-muted" />
            )}
            <span className="text-text-secondary">{isVisible ? `Hide ${field.label}` : `Show ${field.label}`}</span>
          </button>
        );
      })}
    </div>
  );
}
