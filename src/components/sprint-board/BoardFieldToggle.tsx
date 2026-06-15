"use client";

import { useState, useRef } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/shared/Checkbox";
import { ROW_FIELDS, type InlineTagId } from "@/components/sprint-board/filter-bar-types";

// The field-visibility body (ROW_FIELDS checkbox list + signal/badge divider +
// "Reset to default"), extracted so it can be embedded both behind the standalone
// bar button below and inside the two-pane filter panel's "Display" view (BRDG-344).
export function BoardFieldList({
  visible,
  onChange,
  onReset,
}: {
  visible: Set<InlineTagId>;
  onChange: (id: InlineTagId, show: boolean) => void;
  onReset?: () => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="max-h-[70vh] overflow-y-auto py-1.5">
        {ROW_FIELDS.map((field, idx) => {
          const checked = visible.has(field.id);
          // Divider between the secondary signals and the always-present badges (BRDG-299).
          const startsBadgeGroup = field.group === "badge" && ROW_FIELDS[idx - 1]?.group === "signal";
          return (
            <div key={field.id} className="contents">
              {startsBadgeGroup && <div className="my-1 h-px bg-overlay-default" />}
              <label className="flex w-full cursor-pointer select-none items-center gap-3 px-3.5 py-1 text-body text-text-secondary hover:bg-hover-list-item hover:text-text-primary">
                <Checkbox checked={checked} />
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => onChange(field.id, e.target.checked)}
                  className="sr-only"
                />
                {field.label}
              </label>
            </div>
          );
        })}
      </div>
      {onReset && (
        <>
          <div className="h-px bg-overlay-default" />
          <button
            type="button"
            onClick={onReset}
            className="flex w-full cursor-pointer items-center px-3.5 py-1.5 text-body-sm text-text-tertiary hover:bg-hover-list-item hover:text-text-secondary"
          >
            Reset to default
          </button>
        </>
      )}
    </div>
  );
}

// Headerless board field show/hide (BRDG-239). Reordering and fixed widths were
// removed with the table; this is a plain checkbox list over the inline tag set.
export function BoardFieldToggle({
  visible,
  onChange,
  onReset,
}: {
  visible: Set<InlineTagId>;
  onChange: (id: InlineTagId, show: boolean) => void;
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useOutsideClick(ref, () => setOpen(false), { enabled: open });

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="md"
        iconOnly
        onClick={() => setOpen(!open)}
        icon={<Columns3 className="h-3.5 w-3.5" strokeWidth={1.5} />}
        title="Toggle fields"
        aria-label="Toggle fields"
        className="border-0 bg-transparent text-text-tertiary hover:bg-hover-list-item hover:text-text-secondary"
      />
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1.5 flex w-56 flex-col overflow-hidden rounded-xl border border-border-strong bg-[var(--color-surface-floating)] shadow-[var(--shadow-xl)]">
          <BoardFieldList
            visible={visible}
            onChange={onChange}
            onReset={onReset ? () => { onReset(); setOpen(false); } : undefined}
          />
        </div>
      )}
    </div>
  );
}
