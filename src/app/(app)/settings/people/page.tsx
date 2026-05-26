"use client";

import { useState } from "react";
import { Star, Search } from "lucide-react";
import useSWR from "swr";
import { swrFetcher, favoriteUsers, userTeams } from "@/lib/api-client";
import { Avatar } from "@/components/shared/Avatar";
import { TEAMS } from "@/lib/sprint-utils";
import type { Assignee } from "@/types/ticket";

interface AssignableUser {
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
  initials: string;
  isFavorite: boolean;
  teams: string[];
}

function userColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 55%, 50%)`;
}

export default function PeoplePage() {
  const [query, setQuery] = useState("");

  const { data, mutate } = useSWR<{ users: AssignableUser[] }>(
    "/api/jira/assignable-users",
    swrFetcher,
    { revalidateOnFocus: false },
  );

  const users = data?.users ?? [];

  const filtered = query.trim()
    ? users.filter((u) => u.displayName.toLowerCase().includes(query.toLowerCase()))
    : users;

  const sorted = [...filtered].sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });

  const handleToggleFavorite = async (user: AssignableUser) => {
    const newFav = !user.isFavorite;
    const optimistic = {
      users: users.map((u) =>
        u.displayName === user.displayName ? { ...u, isFavorite: newFav } : u,
      ),
    };

    await mutate(async () => {
      if (newFav) {
        await favoriteUsers.add(user.displayName);
      } else {
        await favoriteUsers.remove(user.displayName);
      }
      return optimistic;
    }, { optimisticData: optimistic, rollbackOnError: true });
  };

  const handleToggleTeam = async (user: AssignableUser, team: string) => {
    const hasTeam = user.teams.includes(team);
    const newTeams = hasTeam
      ? user.teams.filter((t) => t !== team)
      : [...user.teams, team];

    const optimistic = {
      users: users.map((u) =>
        u.displayName === user.displayName ? { ...u, teams: newTeams } : u,
      ),
    };

    await mutate(async () => {
      await userTeams.set(user.displayName, newTeams);
      return optimistic;
    }, { optimisticData: optimistic, rollbackOnError: true });
  };

  return (
    <>
      <h2 className="mb-5 text-xs font-medium uppercase tracking-[0.06em] text-text-secondary">
        Team Members
      </h2>

      <div className="mb-4 flex items-center gap-2 rounded-lg border border-border-default bg-overlay-subtle px-3 py-2">
        <Search size={13} strokeWidth={1.5} className="shrink-0 text-text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people..."
          className="flex-1 bg-transparent text-sm text-text-secondary placeholder:text-text-muted focus:outline-none"
        />
      </div>

      {sorted.length === 0 && !data && (
        <p className="py-6 text-center text-sm text-text-muted">Loading...</p>
      )}
      {sorted.length === 0 && data && (
        <p className="py-6 text-center text-sm text-text-muted">No people found</p>
      )}

      {sorted.length > 0 && (
        <div className="flex flex-col divide-y divide-border-subtle rounded-xl border border-border-default bg-overlay-subtle overflow-hidden">
          {sorted.map((user) => {
            const assignee: Assignee = {
              name: user.displayName,
              initials: user.initials,
              color: userColor(user.displayName),
            };

            return (
              <div key={user.displayName} className="flex items-center gap-3 px-4 py-3">
                <Avatar assignee={assignee} size={28} />

                <span className="flex-1 min-w-0 truncate text-sm font-medium text-text-secondary">
                  {user.displayName}
                </span>

                {/* Team chips */}
                <div className="flex items-center gap-1">
                  {TEAMS.map((team) => {
                    const active = user.teams.includes(team);
                    return (
                      <button
                        key={team}
                        type="button"
                        onClick={() => handleToggleTeam(user, team)}
                        className={`rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:opacity-60 ${
                          active
                            ? "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/25"
                            : "bg-transparent text-text-muted border border-border-subtle hover:border-border-default hover:text-text-tertiary"
                        }`}
                        style={{ transition: "border-color 0.15s ease, color 0.15s ease" }}
                      >
                        {team}
                      </button>
                    );
                  })}
                </div>

                {/* Favorite toggle */}
                <button
                  type="button"
                  onClick={() => handleToggleFavorite(user)}
                  title={user.isFavorite ? "Remove from favorites" : "Add to favorites"}
                  className="ml-1 rounded-md p-1.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] hover:bg-overlay-default active:opacity-60"
                  style={{ transition: "background-color 0.15s ease" }}
                >
                  <Star
                    size={14}
                    strokeWidth={1.5}
                    className={user.isFavorite ? "fill-amber-400 text-amber-400" : "text-text-muted"}
                  />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-label leading-relaxed text-text-muted">
        Favorited users appear at the top of all assignee pickers. Team assignments enable team-based filtering when selecting assignees.
      </p>
    </>
  );
}
