"use client";

import { useState, useMemo } from "react";
import { Star, UserPlus } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { BasePicker } from "@/components/shared/BasePicker";
import type { AssignableUser } from "@/components/shared/AssigneePicker";
import { userInitials, userColor } from "@/lib/user-display";
import { TEAMS } from "@/lib/sprint-utils";
import useSWR from "swr";
import { swrFetcher, jira } from "@/lib/api-client";
import type { Assignee } from "@/types/ticket";

/**
 * Multi-select people picker for watchers. Unlike AssigneePicker it toggles
 * membership (selecting an already-watching user removes them) and keeps the
 * popover open so several watchers can be managed in one pass. Candidates come
 * from the Jira-backed watcher-candidates route so they carry real accountIds.
 */
export function WatcherPicker({
  watchers,
  onAdd,
  onRemove,
  align = "right",
}: {
  watchers: AssignableUser[];
  onAdd: (user: AssignableUser) => void;
  onRemove: (user: AssignableUser) => void;
  align?: "left" | "right";
}) {
  return (
    <BasePicker.Root portal={true} align={align} popoverHeight={440}>
      <WatcherPickerInner watchers={watchers} onAdd={onAdd} onRemove={onRemove} />
    </BasePicker.Root>
  );
}

function WatcherPickerInner({
  watchers,
  onAdd,
  onRemove,
}: {
  watchers: AssignableUser[];
  onAdd: (user: AssignableUser) => void;
  onRemove: (user: AssignableUser) => void;
}) {
  const { open, query } = BasePicker.useContext();
  const [teamFilter, setTeamFilter] = useState<string | null>(null);

  const { data, error, isLoading } = useSWR<{ users: AssignableUser[] }>(
    open ? jira.watcherCandidatesUrl() : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000, shouldRetryOnError: false },
  );

  const users = data?.users ?? [];
  const watching = useMemo(() => new Set(watchers.map((w) => w.accountId)), [watchers]);

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
    const isWatching = watching.has(u.accountId);
    const tempAssignee: Assignee = { name: u.displayName, initials: userInitials(u.displayName), color: userColor(u.displayName) };
    return (
      <BasePicker.Item
        key={u.accountId}
        selected={isWatching}
        onSelect={() => (isWatching ? onRemove(u) : onAdd(u))}
      >
        <Avatar assignee={tempAssignee} size={20} />
        <span className={`flex-1 text-left ${isWatching ? "text-text-primary font-medium" : "text-text-secondary"}`}>
          {u.displayName}
        </span>
      </BasePicker.Item>
    );
  }

  return (
    <>
      <BasePicker.Trigger
        title="Add watcher"
        aria-label="Add watcher"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-border-default text-text-muted cursor-pointer hover:border-[var(--color-brand-400)] hover:text-[var(--color-brand-400)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:opacity-60"
        style={{ transition: "color 0.15s ease, border-color 0.15s ease" }}
      >
        <UserPlus size={12} strokeWidth={1.5} />
      </BasePicker.Trigger>

      <BasePicker.Popover width="w-[280px]">
        <BasePicker.Search placeholder="Search people..." />

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
          {isLoading && <BasePicker.Empty>Loading...</BasePicker.Empty>}
          {error && <BasePicker.Empty>Couldn&apos;t load people</BasePicker.Empty>}
          {!isLoading && !error && favorites.length === 0 && regular.length === 0 && (
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
