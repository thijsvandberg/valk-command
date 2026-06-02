"use client";

import { useState } from "react";
import { Users, CircleDot, ChevronDown, Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TEAMS, type Team } from "@/lib/sprint-utils";
import {
  EPIC_STATUS_BUCKETS,
  EPIC_STATUS_LABELS,
  type EpicStatusBucket,
} from "@/lib/epic-filters";
import { TEAM_COLORS } from "./EpicTeamPicker";

interface Option<T extends string> {
  value: T;
  label: string;
  color?: string;
}

function MultiSelect<T extends string>({
  icon,
  noun,
  options,
  selected,
  onToggle,
  onClear,
}: {
  icon: React.ReactNode;
  noun: string;
  options: Option<T>[];
  selected: T[];
  onToggle: (value: T) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(selected);

  const label =
    selected.length === 0
      ? noun
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? `1 ${noun.toLowerCase()}`
        : `${selected.length} ${noun.toLowerCase()}s`;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="md"
        icon={icon}
        onClick={() => setOpen(!open)}
        className={selected.length > 0 ? "border-[var(--color-brand-500)]/30 text-[var(--color-brand-400)]" : ""}
      >
        {label}
        <ChevronDown size={11} strokeWidth={1.5} className="ml-0.5 text-text-muted" />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] overflow-hidden rounded-lg border border-border-strong bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-lg)]">
            {selected.length > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="w-full px-3 py-1.5 text-left text-body-sm text-text-tertiary cursor-pointer transition-colors duration-150 hover:bg-hover-list-item hover:text-text-secondary"
              >
                Clear selection
              </button>
            )}
            {options.map((opt) => {
              const checked = selectedSet.has(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={checked}
                  onClick={() => onToggle(opt.value)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-body-sm cursor-pointer transition-colors duration-150 ${
                    checked
                      ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/10"
                      : "text-text-secondary hover:bg-hover-list-item"
                  }`}
                >
                  <span
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-caption ${
                      checked
                        ? "border-[var(--color-brand-400)] bg-[var(--color-brand-500)]/20 text-[var(--color-brand-400)]"
                        : "border-border-strong"
                    }`}
                  >
                    {checked && <Check size={9} strokeWidth={3} />}
                  </span>
                  {opt.color && (
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: opt.color }} />
                  )}
                  {opt.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function EpicFilterBar({
  teamFilter,
  statusFilter,
  onToggleTeam,
  onToggleStatus,
  onClearTeams,
  onClearStatuses,
  onClearAll,
}: {
  teamFilter: Team[];
  statusFilter: EpicStatusBucket[];
  onToggleTeam: (team: Team) => void;
  onToggleStatus: (status: EpicStatusBucket) => void;
  onClearTeams: () => void;
  onClearStatuses: () => void;
  onClearAll: () => void;
}) {
  const anyActive = teamFilter.length > 0 || statusFilter.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelect<Team>
        icon={<Users size={12} strokeWidth={1.5} />}
        noun="Team"
        options={TEAMS.map((t) => ({ value: t, label: t, color: TEAM_COLORS[t] }))}
        selected={teamFilter}
        onToggle={onToggleTeam}
        onClear={onClearTeams}
      />
      <MultiSelect<EpicStatusBucket>
        icon={<CircleDot size={12} strokeWidth={1.5} />}
        noun="Status"
        options={EPIC_STATUS_BUCKETS.map((s) => ({ value: s, label: EPIC_STATUS_LABELS[s] }))}
        selected={statusFilter}
        onToggle={onToggleStatus}
        onClear={onClearStatuses}
      />
      {anyActive && (
        <button
          type="button"
          onClick={onClearAll}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-body-sm text-text-tertiary cursor-pointer transition-colors duration-150 hover:bg-overlay-default hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
        >
          <X size={12} strokeWidth={1.5} />
          Clear filters
        </button>
      )}
    </div>
  );
}
