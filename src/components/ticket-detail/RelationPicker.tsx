"use client";

import { useEffect, useRef, useState } from "react";
import type { LinkTypeOption } from "@/app/api/jira/link-types/route";

interface RelationPickerProps {
  /** Currently selected relation value, used for the persistent highlight. */
  value: string;
  linkTypes: LinkTypeOption[];
  onSelect: (value: string) => void;
  /** Called on Escape from the filter input. */
  onClose?: () => void;
  autoFocus?: boolean;
  /** Extra classes on the panel container (e.g. absolute positioning when used as a dropdown). */
  className?: string;
}

/**
 * Filterable, keyboard-navigable list of Jira link types. Shared by the link composer
 * (rendered as an anchored dropdown) and the per-row change-type editor (rendered inline),
 * so relation picking behaves identically in both (BRDG-385).
 */
export function RelationPicker({
  value,
  linkTypes,
  onSelect,
  onClose,
  autoFocus = true,
  className = "",
}: RelationPickerProps) {
  const [filter, setFilter] = useState("");
  const [highlight, setHighlight] = useState(-1);
  const filterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) requestAnimationFrame(() => filterRef.current?.focus());
  }, [autoFocus]);

  const filtered = linkTypes.filter(
    (opt) => !filter || opt.label.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className={`rounded-lg border border-border-strong bg-[var(--color-surface-elevated)] shadow-[var(--shadow-lg)] ${className}`}>
      <div className="px-2 pt-2 pb-1">
        <input
          ref={filterRef}
          type="text"
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setHighlight(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const idx = highlight >= 0 ? highlight : 0;
              if (idx < filtered.length) onSelect(filtered[idx].value);
            } else if (e.key === "Escape") {
              e.stopPropagation();
              onClose?.();
            }
          }}
          placeholder="Filter..."
          className="w-full rounded-md border border-border-default bg-[var(--color-surface-default)] px-2 py-1 text-body-sm text-text-primary placeholder:text-text-muted outline-none focus:border-[var(--color-brand-500)]/50"
        />
      </div>
      <div
        className="max-h-52 overflow-y-auto py-1"
        style={{ scrollbarWidth: "thin", scrollbarColor: "var(--color-overlay-strong) transparent" }}
      >
        {filtered.map((opt, idx) => (
          <button
            key={opt.value}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(opt.value);
            }}
            onMouseEnter={() => setHighlight(idx)}
            className={`flex w-full items-center px-3 py-1.5 text-body-sm cursor-pointer transition-colors duration-150 ${
              idx === highlight
                ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/[0.08]"
                : value === opt.value
                  ? "text-[var(--color-brand-400)]"
                  : "text-text-secondary hover:bg-hover-interactive hover:text-text-primary"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
