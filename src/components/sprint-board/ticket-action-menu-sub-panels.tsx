"use client";

// The five data-fetching sub-pickers behind the row-action menu (status, readiness,
// sprint, assignee, label), split out of ticket-action-menu.tsx (BRDG-415). Each is a
// leaf panel rendered inside a Flyout by the composer.

import { useState, useMemo } from "react";
import useSWR from "swr";
import type { TicketReadiness, JiraStatus, Sprint } from "@/types/ticket";
import { READINESS_OPTIONS, READINESS_CONFIG, JIRA_STATUS_COLORS, JIRA_STATUS_ABBREVIATIONS } from "@/types/ticket";
import { swrFetcher } from "@/lib/api-client";
import { SprintListBody, type SprintMovePosition } from "@/components/shared/SprintListBody";
import { Search } from "lucide-react";
import { ReadinessIcon } from "@/components/shared/ReadinessCell";
import { Checkbox } from "@/components/shared/Checkbox";
import { MenuItem } from "@/components/shared/MenuItem";

// ---------------------------------------------------------------------------
// Sub-panel: Status picker
// ---------------------------------------------------------------------------

const JIRA_STATUS_ORDER: JiraStatus[] = ["TO DO", "IN PROGRESS", "TEST", "DONE", "DEPRECATED"];

export function StatusSubPanel({ onSelect }: { onSelect: (status: JiraStatus) => void }) {
  return (
    <div className="py-1">
      {JIRA_STATUS_ORDER.map((status) => {
        const colors = JIRA_STATUS_COLORS[status];
        return (
          <MenuItem key={status} onClick={() => onSelect(status)}>
            <span
              className="shrink-0 rounded px-1.5 py-0.5 font-mono text-caption font-semibold tracking-wide"
              style={{ backgroundColor: colors.bg, color: colors.text }}
            >
              {JIRA_STATUS_ABBREVIATIONS[status]}
            </span>
            <span>{status}</span>
          </MenuItem>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-panel: Readiness picker
// ---------------------------------------------------------------------------

export function ReadinessSubPanel({ onSelect }: { onSelect: (readiness: TicketReadiness | null) => void }) {
  return (
    <div className="py-1">
      {READINESS_OPTIONS.map((opt) => {
        const cfg = opt.value ? READINESS_CONFIG[opt.value] : null;
        return (
          <MenuItem
            key={opt.label}
            onClick={() => onSelect(opt.value)}
            icon={
              <span
                className="flex h-4 w-4 items-center justify-center rounded-full"
                style={{
                  color: cfg?.color ?? "var(--color-text-muted)",
                  backgroundColor: cfg?.bg ?? "var(--color-overlay-default)",
                }}
              >
                {opt.value && <ReadinessIcon value={opt.value} size={10} />}
              </span>
            }
          >
            {opt.label}
          </MenuItem>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-panel: Sprint picker
// ---------------------------------------------------------------------------

export function SprintSubPanel({
  sprints,
  pinnedSprintIds,
  excludeSprintIds,
  onSelect,
}: {
  sprints: Sprint[];
  pinnedSprintIds?: string[];
  /** Sprints already offered one level up (active / next / named backlog quick-moves)
   *  plus the selection's current sprint; omitted from the list to avoid duplicates. */
  excludeSprintIds?: Set<string>;
  /** `position` is set only by the explicit top/bottom row buttons (BRDG-362);
   *  a plain row click leaves it undefined so the BRDG-370 placement rule applies. */
  onSelect: (sprintId: string, position?: SprintMovePosition) => void;
}) {
  return (
    <SprintListBody
      sprints={sprints}
      variant="move"
      pinnedOrder={pinnedSprintIds}
      excludeSprintIds={excludeSprintIds}
      onSelect={(id, _name, position) => onSelect(id, position)}
      onClose={() => {}}
      listMaxHeightClass="max-h-[240px]"
    />
  );
}

// ---------------------------------------------------------------------------
// Sub-panel: Assignee picker
// ---------------------------------------------------------------------------

interface AssignableUser {
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
}

export function AssigneeSubPanel({ onSelect }: { onSelect: (accountId: string | null, name: string | null, avatar: string | null) => void }) {
  const { data } = useSWR<{ users: AssignableUser[] }>("/api/jira/assignable-users", swrFetcher);
  const [query, setQuery] = useState("");
  const users = useMemo(() => data?.users ?? [], [data?.users]);
  const filtered = useMemo(() => {
    if (!query) return users;
    const q = query.toLowerCase();
    return users.filter((u) => u.displayName.toLowerCase().includes(q));
  }, [users, query]);

  return (
    <div className="py-1">
      <div className="px-2 pb-1">
        <div className="flex items-center gap-1.5 rounded-md border border-border-default bg-surface-base px-2 py-1">
          <Search className="h-3 w-3 shrink-0 text-text-muted" strokeWidth={1.5} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search users..."
            className="w-full bg-transparent text-body-sm text-text-primary outline-none placeholder:text-text-muted"
            autoFocus
          />
        </div>
      </div>
      <MenuItem onClick={() => onSelect(null, null, null)}>Unassigned</MenuItem>
      <div className="max-h-[200px] overflow-y-auto">
        {filtered.map((user) => (
          <MenuItem key={user.accountId} onClick={() => onSelect(user.accountId, user.displayName, user.avatarUrl)}>
            {user.displayName}
          </MenuItem>
        ))}
        {!data && <div className="px-3 py-2 text-body-sm text-text-tertiary">Loading...</div>}
        {data && filtered.length === 0 && <div className="px-3 py-2 text-body-sm text-text-tertiary">No users found</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-panel: Label picker (multi-select toggle)
// ---------------------------------------------------------------------------

export function LabelSubPanel({ onSelect }: { onSelect: (labels: string[], mode: "add" | "set") => void }) {
  const { data } = useSWR<{ labels: string[] }>("/api/jira/labels", swrFetcher);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allLabels = useMemo(() => data?.labels ?? [], [data?.labels]);
  const filtered = useMemo(() => {
    if (!query) return allLabels;
    const q = query.toLowerCase();
    return allLabels.filter((l) => l.toLowerCase().includes(q));
  }, [allLabels, query]);

  const toggle = (label: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  };

  return (
    <div className="py-1">
      <div className="px-2 pb-1">
        <div className="flex items-center gap-1.5 rounded-md border border-border-default bg-surface-base px-2 py-1">
          <Search className="h-3 w-3 shrink-0 text-text-muted" strokeWidth={1.5} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search labels..."
            className="w-full bg-transparent text-body-sm text-text-primary outline-none placeholder:text-text-muted"
            autoFocus
          />
        </div>
      </div>
      <div className="max-h-[200px] overflow-y-auto">
        {filtered.map((label) => (
          <MenuItem key={label} onClick={() => toggle(label)}>
            <Checkbox checked={selected.has(label)} />
            {label}
          </MenuItem>
        ))}
        {!data && <div className="px-3 py-2 text-body-sm text-text-tertiary">Loading...</div>}
        {data && filtered.length === 0 && <div className="px-3 py-2 text-body-sm text-text-tertiary">No labels found</div>}
      </div>
      {selected.size > 0 && (
        <>
          <div className="mx-2 my-0.5 h-px bg-overlay-strong" />
          <button
            type="button"
            onClick={() => onSelect([...selected], "add")}
            className="flex w-full items-center justify-center gap-1.5 px-3 py-1.5 text-body-sm font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-hover-list-item focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          >
            Add {selected.size} label{selected.size === 1 ? "" : "s"}
          </button>
          <button
            type="button"
            onClick={() => onSelect([...selected], "set")}
            className="flex w-full items-center justify-center gap-1.5 px-3 py-1.5 text-body-sm text-text-tertiary cursor-pointer hover:bg-hover-list-item focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          >
            Replace all labels
          </button>
        </>
      )}
    </div>
  );
}
