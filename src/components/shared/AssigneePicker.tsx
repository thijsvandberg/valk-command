"use client";

import { useState, useMemo } from "react";
import { Star, UserX } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { BasePicker } from "@/components/shared/BasePicker";
import type { Assignee } from "@/types/ticket";
import { TEAMS } from "@/lib/sprint-utils";
import useSWR from "swr";
import { swrFetcher } from "@/lib/api-client";

export interface AssignableUser {
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
  isFavorite?: boolean;
  teams?: string[];
}

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function userColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 55%, 50%)`;
}

export function AssigneePicker({
  value,
  onChange,
  align = "right",
  onOpenChange,
}: {
  value: Assignee | null;
  onChange: (user: AssignableUser | null) => void;
  align?: "left" | "right";
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <BasePicker.Root portal={true} align={align} popoverHeight={440} onOpenChange={onOpenChange}>
      <AssigneePickerInner value={value} onChange={onChange} />
    </BasePicker.Root>
  );
}

function AssigneePickerInner({
  value,
  onChange,
}: {
  value: Assignee | null;
  onChange: (user: AssignableUser | null) => void;
}) {
  const { open, query, handleClose } = BasePicker.useContext();
  const [teamFilter, setTeamFilter] = useState<string | null>(null);

  const { data } = useSWR<{ users: AssignableUser[] }>(
    open ? "/api/jira/assignable-users" : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );

  const users = data?.users ?? [];

  const { favorites, regular } = useMemo(() => {
    let pool = users;
    if (teamFilter) pool = pool.filter((u) => u.teams?.includes(teamFilter));
    if (query.trim()) {
      const q = query.toLowerCase();
      pool = pool.filter((u) => u.displayName.toLowerCase().includes(q));
    }
    const favs: AssignableUser[] = [];
    const rest: AssignableUser[] = [];
    for (const u of pool) {
      (u.isFavorite ? favs : rest).push(u);
    }
    return { favorites: favs, regular: rest };
  }, [users, teamFilter, query]);

  const hasAnyTeamAssignments = useMemo(
    () => users.some((u) => u.teams && u.teams.length > 0),
    [users],
  );

  function renderUserRow(u: AssignableUser) {
    const isSelected = value?.name === u.displayName;
    const tempAssignee: Assignee = { name: u.displayName, initials: userInitials(u.displayName), color: userColor(u.displayName) };
    return (
      <BasePicker.Item
        key={u.accountId}
        selected={isSelected}
        onSelect={() => { onChange(u); handleClose(); }}
      >
        <Avatar assignee={tempAssignee} size={20} />
        <span className={`flex-1 text-left ${isSelected ? "text-text-primary font-medium" : "text-text-secondary"}`}>
          {u.displayName}
        </span>
      </BasePicker.Item>
    );
  }

  return (
    <>
      <BasePicker.Trigger
        title={value ? `Assignee: ${value.name}` : "Unassigned"}
        className="inline-flex items-center gap-2 rounded-lg px-2 py-1 -mr-2 cursor-pointer hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:opacity-60"
        style={{ transition: "background-color 0.15s ease" }}
      >
        <span className="truncate text-body-lg text-text-secondary">{value?.name ?? "Unassigned"}</span>
        <Avatar assignee={value} size={20} />
      </BasePicker.Trigger>

      <BasePicker.Popover width="w-[280px]">
        <BasePicker.Search placeholder="Search people..." />

        {/* Team filter chips */}
        {hasAnyTeamAssignments && (
          <div className="flex items-center gap-1 border-b border-border-subtle px-3 py-1.5 overflow-x-auto" data-testid="team-filter-chips">
            <button
              type="button"
              onClick={() => setTeamFilter(null)}
              className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide cursor-pointer active:opacity-60 ${
                teamFilter === null
                  ? "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)]"
                  : "text-text-muted hover:text-text-tertiary"
              }`}
            >
              All
            </button>
            {TEAMS.map((team) => (
              <button
                key={team}
                type="button"
                onClick={() => setTeamFilter(teamFilter === team ? null : team)}
                className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide cursor-pointer active:opacity-60 ${
                  teamFilter === team
                    ? "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)]"
                    : "text-text-muted hover:text-text-tertiary"
                }`}
              >
                {team}
              </button>
            ))}
          </div>
        )}

        <BasePicker.List maxHeight="max-h-[300px]">
          <BasePicker.Item
            selected={!value}
            onSelect={() => { onChange(null); handleClose(); }}
          >
            <span className="flex h-5 w-5 items-center justify-center shrink-0 rounded-full bg-overlay-subtle text-text-muted">
              <UserX size={11} strokeWidth={1.5} />
            </span>
            <span className={!value ? "text-text-primary font-medium" : "text-text-secondary"}>Unassigned</span>
          </BasePicker.Item>

          {users.length === 0 && !data && <BasePicker.Empty>Loading...</BasePicker.Empty>}
          {favorites.length === 0 && regular.length === 0 && query.trim() && (
            <BasePicker.Empty>No people found</BasePicker.Empty>
          )}

          {favorites.length > 0 && (
            <>
              <BasePicker.Section icon={<Star size={9} strokeWidth={1.5} className="text-amber-400/70" />}>
                Favorites
              </BasePicker.Section>
              {favorites.map(renderUserRow)}
              {regular.length > 0 && <BasePicker.Divider />}
            </>
          )}

          {regular.map(renderUserRow)}
        </BasePicker.List>
      </BasePicker.Popover>
    </>
  );
}
