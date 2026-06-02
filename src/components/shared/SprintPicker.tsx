"use client";

import { Minus, IterationCw } from "lucide-react";
import { BasePicker } from "@/components/shared/BasePicker";

interface Sprint {
  id: string | number;
  name: string;
  state: string;
  startDate?: string | null;
  endDate?: string | null;
  hidden?: boolean;
}

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
  sprints: Sprint[];
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
  sprints: Sprint[];
  onChange: (sprintId: string | null) => void;
  variant: "default" | "badge";
  textClass: string;
}) {
  const { query, handleClose } = BasePicker.useContext();

  const availableSprints = sprints.filter((s) => !s.hidden && (s.state === "active" || s.state === "future"));
  const currentSprint = sprints.find((s) => String(s.id) === value);

  const filtered = query.trim()
    ? availableSprints.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))
    : availableSprints;

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
        <BasePicker.Search placeholder="Search sprints..." />
        <BasePicker.List maxHeight="max-h-[220px]">
          {!query.trim() && (
            <BasePicker.Item
              selected={!value}
              onSelect={() => { onChange(null); handleClose(); }}
            >
              <span className="flex w-4 items-center justify-center shrink-0 text-text-muted">
                <Minus size={11} strokeWidth={1.5} />
              </span>
              <span className={!value ? "text-text-primary font-medium" : "text-text-secondary"}>No sprint</span>
            </BasePicker.Item>
          )}

          {filtered.length === 0 && <BasePicker.Empty>No sprints found</BasePicker.Empty>}

          {filtered.map((s) => {
            const isSelected = String(s.id) === value;
            return (
              <BasePicker.Item
                key={s.id}
                selected={isSelected}
                onSelect={() => { onChange(String(s.id)); handleClose(); }}
              >
                <span className="flex w-4 items-center justify-center shrink-0 text-text-muted">
                  <IterationCw size={11} strokeWidth={1.5} />
                </span>
                <span className={`flex-1 text-left ${isSelected ? "text-text-primary font-medium" : "text-text-secondary"}`}>
                  {s.name}
                </span>
                {s.state === "active" && (
                  <span className="rounded bg-[var(--color-brand-500)]/10 px-1.5 py-0.5 text-caption text-[var(--color-brand-400)]">active</span>
                )}
              </BasePicker.Item>
            );
          })}
        </BasePicker.List>
      </BasePicker.Popover>
    </>
  );
}
