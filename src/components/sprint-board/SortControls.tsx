"use client";

import { useState, useRef } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SORT_OPTIONS } from "@/components/sprint-board/filter-bar-types";
import type { SortField, SortDir } from "@/components/sprint-board/filter-bar-types";

export function SortDropdown({
  field,
  direction,
  onChange,
}: {
  field: SortField;
  direction: SortDir;
  onChange: (field: SortField, dir: SortDir) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useOutsideClick(ref, () => setOpen(false), { enabled: open });

  const isActive = field !== "rank";
  const activeLabel = SORT_OPTIONS.find((o) => o.field === field)?.label ?? "Sort";

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      <Button
        variant="ghost"
        size="md"
        iconOnly
        onClick={() => setOpen(!open)}
        icon={
          <span className="relative flex items-center justify-center">
            <ArrowUpDown className="h-3.5 w-3.5" strokeWidth={1.5} />
            {isActive && (
              <span className="absolute -top-0.5 -right-1 h-[6px] w-[6px] rounded-full bg-[var(--color-brand-400)] ring-2 ring-[var(--color-surface-base)]" />
            )}
          </span>
        }
        title={isActive ? `Sorted: ${activeLabel} (${direction === "asc" ? "ascending" : "descending"})` : "Sort"}
        aria-label={isActive ? `Sort: ${activeLabel} (${direction === "asc" ? "ascending" : "descending"})` : "Sort"}
        className={isActive ? "border-0 bg-transparent text-[var(--color-brand-400)] hover:bg-hover-list-item" : "border-0 bg-transparent text-text-tertiary hover:bg-hover-list-item hover:text-text-secondary"}
      />

      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 w-52 rounded-lg border border-border-strong bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-lg)]">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.field}
              type="button"
              onClick={() => {
                if (opt.field === field) {
                  onChange(opt.field, direction === "asc" ? "desc" : "asc");
                } else {
                  onChange(opt.field, opt.defaultDir);
                }
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-3 py-1.5 text-body-sm cursor-pointer hover:bg-hover-list-item ${
                opt.field === field ? "text-text-primary bg-overlay-subtle" : "text-text-secondary"
              }`}
            >
              <span className="flex items-center gap-2">
                {opt.field === field && (
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)]" />
                )}
                {opt.label}
              </span>
              {opt.field === field && (
                direction === "asc"
                  ? <ArrowUp className="h-3 w-3 text-[var(--color-brand-400)]" strokeWidth={1.5} />
                  : <ArrowDown className="h-3 w-3 text-[var(--color-brand-400)]" strokeWidth={1.5} />
              )}
            </button>
          ))}
          {isActive && (
            <>
              <div className="my-1 h-px bg-overlay-default" />
              <button
                type="button"
                onClick={() => {
                  onChange("rank", "asc");
                  setOpen(false);
                }}
                className="flex w-full items-center px-3 py-1.5 text-body-sm text-text-tertiary cursor-pointer hover:bg-hover-list-item hover:text-text-secondary"
              >
                Reset to default
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
