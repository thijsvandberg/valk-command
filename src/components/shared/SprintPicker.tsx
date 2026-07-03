"use client";

// Inline single-select sprint picker: a BasePicker trigger/popover shell around
// the shared SprintListBody (BRDG-362), so its list is the same surface as the
// sprint list modal and the move flyout.

import { IterationCw } from "lucide-react";
import { BasePicker } from "@/components/shared/BasePicker";
import { SprintListBody } from "@/components/shared/SprintListBody";
import type { SprintListEntry } from "@/lib/sprint-list";

export function SprintPicker({
  value,
  sprints,
  onChange,
  align = "right",
  variant = "default",
  onOpenChange,
  textClass = "text-body-lg",
}: {
  value: string | null;
  sprints: SprintListEntry[];
  onChange: (sprintId: string | null) => void;
  align?: "left" | "right";
  variant?: "default" | "badge";
  onOpenChange?: (open: boolean) => void;
  // Trigger font-size utility for the default variant. Defaults to the standard
  // value size; the refinement Info panel overrides this to its 12px values.
  textClass?: string;
}) {
  return (
    <BasePicker.Root portal={true} align={align} popoverHeight={300} onOpenChange={onOpenChange}>
      <SprintPickerInner value={value} sprints={sprints} onChange={onChange} variant={variant} textClass={textClass} />
    </BasePicker.Root>
  );
}

function SprintPickerInner({
  value,
  sprints,
  onChange,
  variant,
  textClass,
}: {
  value: string | null;
  sprints: SprintListEntry[];
  onChange: (sprintId: string | null) => void;
  variant: "default" | "badge";
  textClass: string;
}) {
  const { handleClose } = BasePicker.useContext();

  const currentSprint = sprints.find((s) => String(s.id) === value);
  const isBadge = variant === "badge";

  return (
    <>
      <BasePicker.Trigger
        title={currentSprint ? `Sprint: ${currentSprint.name}` : "No sprint"}
        className={isBadge
          ? "flex items-center gap-1.5 rounded-md bg-overlay-default px-2 py-0.5 text-label font-medium text-text-tertiary cursor-pointer hover:bg-overlay-strong hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:opacity-60"
          : `inline-flex items-center gap-1 rounded-lg px-2 py-1 -mr-2 ${textClass} text-text-secondary cursor-pointer hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:opacity-60`
        }
        style={{ transition: "background-color 0.15s, color 0.15s" }}
      >
        {isBadge && <IterationCw size={12} strokeWidth={1.5} />}
        <span className={isBadge ? "max-w-[110px] truncate" : "truncate"}>{currentSprint?.name ?? (isBadge ? "Sprint" : "None")}</span>
      </BasePicker.Trigger>

      <BasePicker.Popover width="w-[240px]">
        <SprintListBody
          sprints={sprints}
          variant="select"
          selectedId={value}
          allowNone
          onSelectNone={() => onChange(null)}
          onSelect={(sprintId) => onChange(sprintId)}
          onClose={handleClose}
          listMaxHeightClass="max-h-[220px]"
        />
      </BasePicker.Popover>
    </>
  );
}
