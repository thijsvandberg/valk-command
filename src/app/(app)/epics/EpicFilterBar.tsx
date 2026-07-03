"use client";

import { useState, useRef, type ReactNode } from "react";
import { Users, CircleDot, ChevronDown, X, Slash } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Popover } from "@/components/shared/Popover";
import { Checkbox } from "@/components/shared/Checkbox";
import { TEAMS, type Team } from "@/lib/sprint-utils";
import { EPIC_STATUSES } from "@/lib/epic-filters";
import {
  JIRA_STATUS_COLORS,
  JIRA_STATUS_ABBREVIATIONS,
  type JiraStatus,
} from "@/types/ticket";
import { TEAM_COLORS } from "./EpicTeamPicker";

// -- Dropdown shell (trigger button + dismiss-on-outside popover) --

function Dropdown({
  icon,
  label,
  active,
  children,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="ghost"
        size="md"
        icon={icon}
        onClick={() => setOpen(!open)}
        className={active ? "border-[var(--color-brand-500)]/30 text-[var(--color-brand-400)]" : ""}
      >
        {label}
        <ChevronDown size={11} strokeWidth={1.5} className="ml-0.5 text-text-muted" />
      </Button>

      <Popover open={open} onClose={() => setOpen(false)} align="left" offsetClass="mt-1" triggerRef={rootRef} className="min-w-[200px] py-1">
        {children(() => setOpen(false))}
      </Popover>
    </div>
  );
}

function CheckRow({
  checked,
  onClick,
  children,
}: {
  checked: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-body-sm cursor-pointer transition-colors duration-150 ${
        checked ? "bg-[var(--color-brand-500)]/10" : "hover:bg-hover-list-item"
      } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
    >
      <Checkbox checked={checked} />
      {children}
    </button>
  );
}

function ClearRow({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full px-3 py-1.5 text-left text-body-sm text-text-tertiary cursor-pointer transition-colors duration-150 hover:bg-hover-list-item hover:text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
    >
      Clear selection
    </button>
  );
}

export function EpicFilterBar({
  teamFilter,
  noTeam,
  statusFilter,
  onToggleTeam,
  onToggleNoTeam,
  onToggleStatus,
  onClearTeams,
  onClearStatuses,
  onClearAll,
}: {
  teamFilter: Team[];
  noTeam: boolean;
  statusFilter: JiraStatus[];
  onToggleTeam: (team: Team) => void;
  onToggleNoTeam: () => void;
  onToggleStatus: (status: JiraStatus) => void;
  onClearTeams: () => void;
  onClearStatuses: () => void;
  onClearAll: () => void;
}) {
  const teamCount = teamFilter.length + (noTeam ? 1 : 0);
  const teamLabel =
    teamCount === 0
      ? "Team"
      : teamCount === 1
        ? (noTeam ? "No team" : teamFilter[0])
        : `${teamCount} teams`;

  const statusLabel =
    statusFilter.length === 0
      ? "Status"
      : statusFilter.length === 1
        ? statusFilter[0]
        : `${statusFilter.length} statuses`;

  const anyActive = teamCount > 0 || statusFilter.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Dropdown icon={<Users size={12} strokeWidth={1.5} />} label={teamLabel} active={teamCount > 0}>
        {() => (
          <>
            {teamCount > 0 && <ClearRow onClick={onClearTeams} />}
            {TEAMS.map((team) => (
              <CheckRow key={team} checked={teamFilter.includes(team)} onClick={() => onToggleTeam(team)}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: TEAM_COLORS[team] }} />
                <span className={teamFilter.includes(team) ? "text-[var(--color-brand-400)]" : "text-text-secondary"}>
                  {team}
                </span>
              </CheckRow>
            ))}
            <div className="mx-3 my-1 border-t border-border-default" />
            <CheckRow checked={noTeam} onClick={onToggleNoTeam}>
              <Slash size={11} strokeWidth={1.5} className="shrink-0 text-text-muted" />
              <span className={noTeam ? "text-[var(--color-brand-400)]" : "text-text-tertiary"}>No team</span>
            </CheckRow>
          </>
        )}
      </Dropdown>

      <Dropdown icon={<CircleDot size={12} strokeWidth={1.5} />} label={statusLabel} active={statusFilter.length > 0}>
        {() => (
          <>
            {statusFilter.length > 0 && <ClearRow onClick={onClearStatuses} />}
            {EPIC_STATUSES.map((status) => {
              const c = JIRA_STATUS_COLORS[status];
              return (
                <CheckRow key={status} checked={statusFilter.includes(status)} onClick={() => onToggleStatus(status)}>
                  <span
                    className="rounded px-1.5 py-0.5 text-caption font-semibold tracking-wide"
                    style={{ backgroundColor: c.bg, color: c.text }}
                  >
                    {JIRA_STATUS_ABBREVIATIONS[status]}
                  </span>
                  <span className="text-text-secondary">{status}</span>
                </CheckRow>
              );
            })}
          </>
        )}
      </Dropdown>

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
