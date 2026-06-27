"use client";

import { useRef, useState } from "react";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import type { InboxGroupBy } from "@/lib/new-stories-grouping";

// Inbox group-by selector (BRDG-358). Deliberately inbox-local so the shared
// board controls (SprintSlots' GroupByDropdown, UnifiedControlsCluster) stay
// untouched. Same Layers-icon + popover idiom as the board's control.
const GROUP_BY_OPTIONS: { value: InboxGroupBy; label: string }[] = [
  { value: "date", label: "Date" },
  { value: "epic", label: "Epic" },
  { value: "creator", label: "Reporter" },
  { value: "sprint", label: "Sprint" },
  // Relevance is team-relative; only offered when a default team is set.
  { value: "relevance", label: "Relevance" },
];

export function InboxGroupByDropdown({
  value,
  onChange,
  showRelevance = false,
}: {
  value: InboxGroupBy;
  onChange: (v: InboxGroupBy) => void;
  showRelevance?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useOutsideClick(ref, () => setOpen(false), { enabled: open, escapeClose: true });

  const options = showRelevance
    ? GROUP_BY_OPTIONS
    : GROUP_BY_OPTIONS.filter((o) => o.value !== "relevance");

  const activeLabel = options.find((o) => o.value === value)?.label ?? "Date";

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="md"
        iconOnly
        onClick={() => setOpen(!open)}
        icon={
          <span className="relative flex items-center justify-center">
            <Layers className="h-3.5 w-3.5" strokeWidth={1.5} />
            <span className="absolute -top-0.5 -right-1 h-[6px] w-[6px] rounded-full bg-[var(--color-brand-400)] ring-2 ring-[var(--color-surface-base)]" />
          </span>
        }
        title={`Group by: ${activeLabel}`}
        aria-label={`Group by: ${activeLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="border-0 bg-transparent text-[var(--color-brand-400)] hover:bg-hover-list-item"
      />
      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-50 mt-1 w-36 rounded-lg border border-border-strong bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-lg)]"
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="menuitemradio"
              aria-checked={opt.value === value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-body-sm cursor-pointer hover:bg-hover-list-item ${
                opt.value === value ? "text-text-primary bg-overlay-subtle" : "text-text-secondary"
              } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  opt.value === value ? "bg-[var(--color-brand-400)]" : "opacity-0"
                }`}
              />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
