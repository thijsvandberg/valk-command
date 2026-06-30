"use client";

import { useState } from "react";
import { Star, BadgeCheck, Search } from "lucide-react";
import useSWR from "swr";
import { swrFetcher, favoriteUsers, poUsers, userTeams } from "@/lib/api-client";
import { Avatar } from "@/components/shared/Avatar";
import { LoadingState } from "@/components/shared/LoadingState";
import { EmptyState } from "@/components/shared/EmptyState";
import { DataErrorState } from "@/components/shared/DataErrorState";
import { TEAMS } from "@/lib/sprint-utils";
import type { Assignee } from "@/types/ticket";

interface AssignableUser {
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
  initials: string;
  isFavorite: boolean;
  isPo: boolean;
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
  const [teamFilter, setTeamFilter] = useState<string | null>(null);

  const { data, isLoading, error, mutate } = useSWR<{ users: AssignableUser[] }>(
    "/api/jira/assignable-users",
    swrFetcher,
    { revalidateOnFocus: false },
  );

  const users = data?.users ?? [];

  let pool = users;
  if (teamFilter) {
    pool = pool.filter((u) => u.teams.includes(teamFilter));
  }
  if (query.trim()) {
    const q = query.toLowerCase();
    pool = pool.filter((u) => u.displayName.toLowerCase().includes(q));
  }

  const sorted = [...pool].sort((a, b) => {
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
        await favoriteUsers.add(user.displayName, user.accountId);
      } else {
        await favoriteUsers.remove(user.displayName, user.accountId);
      }
      return optimistic;
    }, { optimisticData: optimistic, rollbackOnError: true });
  };

  const handleTogglePo = async (user: AssignableUser) => {
    const newPo = !user.isPo;
    const optimistic = {
      users: users.map((u) =>
        u.displayName === user.displayName ? { ...u, isPo: newPo } : u,
      ),
    };

    await mutate(async () => {
      if (newPo) {
        await poUsers.add(user.displayName, user.accountId);
      } else {
        await poUsers.remove(user.displayName, user.accountId);
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
      await userTeams.set(user.displayName, newTeams, user.accountId);
      return optimistic;
    }, { optimisticData: optimistic, rollbackOnError: true });
  };

  return (
    <>
      <h2 className="mb-5 text-body-sm font-medium uppercase tracking-label text-text-secondary">
        Team Members
      </h2>

      <div className="mb-4 flex items-center gap-2 rounded-lg border border-border-default bg-overlay-subtle px-3 py-2">
        <Search size={13} strokeWidth={1.5} className="shrink-0 text-text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people..."
          className="flex-1 bg-transparent text-body-lg text-text-secondary placeholder:text-text-muted focus:outline-none"
        />
      </div>

      <div className="mb-4 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setTeamFilter(null)}
          className={`rounded-md px-2.5 py-1 text-body-sm font-semibold cursor-pointer active:opacity-60 ${
            teamFilter === null
              ? "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)]"
              : "text-text-muted hover:text-text-tertiary"
          } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
          style={{ transition: "color 0.15s ease" }}
        >
          All
        </button>
        {TEAMS.map((team) => (
          <button
            key={team}
            type="button"
            onClick={() => setTeamFilter(teamFilter === team ? null : team)}
            className={`rounded-md px-2.5 py-1 text-body-sm font-semibold cursor-pointer active:opacity-60 ${
              teamFilter === team
                ? "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)]"
                : "text-text-muted hover:text-text-tertiary"
            } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
            style={{ transition: "color 0.15s ease" }}
          >
            {team}
          </button>
        ))}
      </div>

      {error && data && (
        <DataErrorState error={error} onRetry={() => void mutate()} className="mb-4" />
      )}

      {error && !data ? (
        <DataErrorState variant="full" error={error} onRetry={() => void mutate()} className="py-12" />
      ) : isLoading && !data ? (
        <LoadingState className="py-12" />
      ) : sorted.length === 0 ? (
        <EmptyState title="No people found" className="py-12" />
      ) : (
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

                <span className="flex-1 min-w-0 truncate text-body-lg font-medium text-text-secondary">
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
                        className={`rounded-md px-2 py-0.5 text-caption font-semibold tracking-wide cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:opacity-60 ${
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

                {/* PO toggle (BRDG-372): violet, kept visually distinct from
                    the amber favorite star so the two roles never blur. */}
                <button
                  type="button"
                  onClick={() => handleTogglePo(user)}
                  title={user.isPo ? "Unmark as Product Owner" : "Mark as Product Owner"}
                  aria-pressed={user.isPo}
                  className="ml-1 rounded-md p-1.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] hover:bg-overlay-default active:opacity-60"
                  style={{ transition: "background-color 0.15s ease" }}
                >
                  <BadgeCheck
                    size={14}
                    strokeWidth={1.5}
                    className={user.isPo ? "fill-violet-500 text-white" : "text-text-muted"}
                  />
                </button>

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
        Favorited users appear at the top of all assignee pickers. Team assignments enable team-based filtering when selecting assignees. The Product Owner marker sinks stories created by other POs to the bottom of the inbox&apos;s Relevance grouping.
      </p>
    </>
  );
}
