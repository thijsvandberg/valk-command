"use client";

import { Suspense, useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { Users, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import type { Ticket } from "@/types/ticket";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import { toStakeholderTickets, toStakeholderSprint } from "@/lib/stakeholder-data";
import { SprintOverviewCard } from "@/components/stakeholder/SprintOverviewCard";
import { CopyMarkdownButton } from "@/components/stakeholder/CopyMarkdownButton";
import { LoadingState } from "@/components/shared/LoadingState";
import {
  ViewHeader,
  ViewHeaderTitle,
  ViewHeaderDivider,
} from "@/components/shared/ViewHeader";

function useCarryOver(
  currentTickets: Ticket[] | undefined,
  previousSprintId: number | null,
): { carriedKeys: Set<string>; previousSprintName: string | null; isLoading: boolean } {
  const key = previousSprintId !== null
    ? `/api/tickets?sprintId=${encodeURIComponent(String(previousSprintId))}`
    : null;
  const { data: prevTickets, isLoading } = useSWR<Ticket[]>(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });

  const carriedKeys = useMemo(() => {
    if (!currentTickets || !prevTickets) return new Set<string>();
    const prevKeys = new Set(prevTickets.map((t) => t.key.toLowerCase()));
    const carried = new Set<string>();
    for (const t of currentTickets) {
      if (prevKeys.has(t.key.toLowerCase())) carried.add(t.key);
    }
    return carried;
  }, [currentTickets, prevTickets]);

  return { carriedKeys, previousSprintName: null, isLoading };
}

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));
const REFRESH_INTERVAL = 5 * 60 * 1000;
const SESSION_KEY_TEAM = "stakeholder_team";
const SESSION_KEY_SPRINT = "stakeholder_sprintId";

function formatRelativeTime(date: Date | null): string {
  if (!date) return "Never";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin === 1) return "1 minute ago";
  return `${diffMin} minutes ago`;
}

// Supports "BT: 133" and "BT 133" (colon-space or space separator)
function extractTeamPrefix(sprintName: string): string | null {
  const match = sprintName.match(/^([A-Z]+)[: ]/);
  return match ? match[1] : null;
}

// Numeric suffix for sort: "BT: 133" → 133, "BT: TODO" → Infinity
function extractSprintNumber(sprintName: string): number {
  const match = sprintName.match(/(\d+)\s*$/);
  return match ? parseInt(match[1], 10) : Infinity;
}

function sessionGet(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function sessionSet(key: string, value: string): void {
  try { sessionStorage.setItem(key, value); } catch {}
}

const navBtnClass =
  "flex items-center rounded-md p-1.5 text-white/40 cursor-pointer hover:bg-white/[0.06] hover:text-white/70 disabled:opacity-25 disabled:cursor-not-allowed transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]";

const selectClass =
  "rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-xs text-white/70 cursor-pointer hover:border-white/[0.12] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]";

function StakeholderView() {
  const { data: sprints } = useJiraSprints();
  const searchParams = useSearchParams();
  const router = useRouter();

  // URL params take precedence; session storage is the fallback for within-session memory
  const urlTeam = searchParams.get("team") ?? sessionGet(SESSION_KEY_TEAM);
  const urlSprintId = (() => {
    const raw = searchParams.get("sprintId") ?? sessionGet(SESSION_KEY_SPRINT);
    return raw ? Number(raw) : null;
  })();

  const lastUpdatedRef = useRef<Date | null>(null);
  const [lastUpdatedDisplay, setLastUpdatedDisplay] = useState<string>("Never");

  const availableTeams = useMemo<string[]>(() => {
    if (!sprints) return [];
    const prefixes = new Set<string>();
    for (const s of sprints) {
      const p = extractTeamPrefix(s.name);
      if (p) prefixes.add(p);
    }
    return Array.from(prefixes).sort();
  }, [sprints]);

  // Team: URL/session param takes precedence, then fall back to team of the active sprint
  const selectedTeamPrefix = useMemo<string | null>(() => {
    if (urlTeam) return urlTeam;
    if (!sprints) return null;
    const active = sprints.find((s) => s.state === "active");
    if (active) return extractTeamPrefix(active.name);
    return sprints.length > 0 ? extractTeamPrefix(sprints[0].name) : null;
  }, [urlTeam, sprints]);

  // Sorted sprints for selected team; non-numeric (TODO, Backlog) go last
  const teamSprints = useMemo(() => {
    if (!sprints || !selectedTeamPrefix) return [];
    return sprints
      .filter((s) => extractTeamPrefix(s.name) === selectedTeamPrefix)
      .sort((a, b) => extractSprintNumber(a.name) - extractSprintNumber(b.name));
  }, [sprints, selectedTeamPrefix]);

  // Sprint index: URL/session sprintId → active sprint → first
  const selectedIndex = useMemo<number>(() => {
    if (urlSprintId !== null) {
      const idx = teamSprints.findIndex((s) => s.id === urlSprintId);
      if (idx >= 0) return idx;
    }
    const activeIdx = teamSprints.findIndex((s) => s.state === "active");
    return activeIdx >= 0 ? activeIdx : 0;
  }, [urlSprintId, teamSprints]);

  const currentSprint = teamSprints[selectedIndex] ?? null;
  const previousSprint = selectedIndex > 0 ? teamSprints[selectedIndex - 1] ?? null : null;

  function updateUrl(team: string, sprintId: number) {
    sessionSet(SESSION_KEY_TEAM, team);
    sessionSet(SESSION_KEY_SPRINT, String(sprintId));
    const params = new URLSearchParams();
    params.set("team", team);
    params.set("sprintId", String(sprintId));
    router.replace(`/stakeholder?${params.toString()}`);
  }

  function handleTeamChange(prefix: string) {
    const sprintsForPrefix = (sprints ?? [])
      .filter((s) => extractTeamPrefix(s.name) === prefix)
      .sort((a, b) => extractSprintNumber(a.name) - extractSprintNumber(b.name));
    const active = sprintsForPrefix.find((s) => s.state === "active") ?? sprintsForPrefix[0];
    if (active) updateUrl(prefix, active.id);
  }

  function handleSprintChange(sprintId: number) {
    if (selectedTeamPrefix) updateUrl(selectedTeamPrefix, sprintId);
  }

  function navigate(delta: -1 | 1) {
    const newIdx = Math.max(0, Math.min(selectedIndex + delta, teamSprints.length - 1));
    const sprint = teamSprints[newIdx];
    if (sprint && selectedTeamPrefix) updateUrl(selectedTeamPrefix, sprint.id);
  }

  // Sync URL and session whenever selection is known (handles first load with no params)
  useEffect(() => {
    if (!currentSprint || !selectedTeamPrefix) return;
    updateUrl(selectedTeamPrefix, currentSprint.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSprint?.id, selectedTeamPrefix]);

  // Fetch current sprint tickets
  const ticketKey = currentSprint
    ? `/api/tickets?sprintId=${encodeURIComponent(String(currentSprint.id))}`
    : null;
  const { data: rawTickets, isLoading } = useSWR<Ticket[]>(ticketKey, fetcher, {
    refreshInterval: REFRESH_INTERVAL,
    revalidateOnFocus: false,
    onSuccess: () => {
      lastUpdatedRef.current = new Date();
      setLastUpdatedDisplay(formatRelativeTime(lastUpdatedRef.current));
    },
  });

  const { carriedKeys, isLoading: isCarryOverLoading } = useCarryOver(
    rawTickets,
    previousSprint?.id ?? null,
  );

  const stakeholderSprint = useMemo(
    () => (currentSprint ? toStakeholderSprint(currentSprint) : null),
    [currentSprint],
  );

  const allTickets = useMemo(
    () => (rawTickets ? toStakeholderTickets(rawTickets) : []),
    [rawTickets],
  );

  const doneTickets = allTickets.filter((t) => t.status === "Completed");
  const inProgressTickets = allTickets.filter(
    (t) => t.status === "In Progress" || t.status === "In Review",
  );
  const todoTickets = allTickets.filter((t) => t.status === "To Do");
  const deprecatedTickets = allTickets.filter((t) => t.status === "Deprecated");

  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdatedDisplay(formatRelativeTime(lastUpdatedRef.current));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <ViewHeader
        icon={<Users size={15} strokeWidth={1.5} />}
        actions={
          <div className="flex items-center gap-2">
            {isLoading && (
              <RefreshCw size={12} strokeWidth={1.5} className="animate-spin text-white/20" />
            )}
            {stakeholderSprint && (
              <CopyMarkdownButton
                sprint={stakeholderSprint}
                doneTickets={doneTickets}
                inProgressTickets={inProgressTickets}
                todoTickets={todoTickets}
                upcomingTickets={[]}
                nextSprintName={null}
              />
            )}
          </div>
        }
      >
        <ViewHeaderTitle>Stakeholder</ViewHeaderTitle>

        {/* Team selector */}
        {availableTeams.length > 1 && selectedTeamPrefix && (
          <>
            <ViewHeaderDivider />
            <div className="flex items-center gap-1.5">
              <label htmlFor="team-select" className="text-xs text-white/30">
                Team
              </label>
              <select
                id="team-select"
                value={selectedTeamPrefix}
                onChange={(e) => handleTeamChange(e.target.value)}
                className={selectClass}
              >
                {availableTeams.map((prefix) => (
                  <option key={prefix} value={prefix}>
                    {prefix}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* Sprint navigation: ← [sprint dropdown] → */}
        {teamSprints.length > 0 && currentSprint && (
          <>
            <ViewHeaderDivider />
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => navigate(-1)}
                disabled={selectedIndex === 0}
                className={navBtnClass}
                aria-label="Previous sprint"
              >
                <ChevronLeft size={13} strokeWidth={1.5} />
              </button>

              <select
                value={currentSprint.id}
                onChange={(e) => handleSprintChange(Number(e.target.value))}
                className={selectClass}
                aria-label="Sprint"
              >
                {teamSprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => navigate(1)}
                disabled={selectedIndex === teamSprints.length - 1}
                className={navBtnClass}
                aria-label="Next sprint"
              >
                <ChevronRight size={13} strokeWidth={1.5} />
              </button>
            </div>
          </>
        )}
      </ViewHeader>

      {/* Main content */}
      <div className="px-6 py-10 sm:px-8 lg:px-12 xl:px-16">
        {isLoading || !rawTickets ? (
          <LoadingState label="Loading sprint data..." variant="spinner" />
        ) : !stakeholderSprint ? (
          <LoadingState label="No sprint selected" />
        ) : (
          <div className="mx-auto max-w-5xl space-y-10">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/25">
                Sprint overview
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-white/90 sm:text-3xl">
                {stakeholderSprint.name}
              </h1>
            </div>

            {/* Carry-over summary */}
            {isCarryOverLoading && previousSprint && (
              <p className="flex items-center gap-1.5 text-xs text-white/20">
                <RefreshCw size={10} strokeWidth={1.5} className="animate-spin" />
                Loading carry-over data...
              </p>
            )}
            {!isCarryOverLoading && carriedKeys.size > 0 && previousSprint && (
              <p className="text-xs text-amber-400/60">
                {carriedKeys.size} ticket{carriedKeys.size === 1 ? "" : "s"} carried from {previousSprint.name}
              </p>
            )}

            <SprintOverviewCard
              sprint={stakeholderSprint}
              doneTickets={doneTickets}
              inProgressTickets={inProgressTickets}
              todoTickets={todoTickets}
              deprecatedTickets={deprecatedTickets}
              carriedKeys={carriedKeys.size > 0 ? carriedKeys : undefined}
            />

            <p className="text-xs text-white/20">Last updated: {lastUpdatedDisplay}</p>
          </div>
        )}
      </div>
    </>
  );
}

export default function StakeholderPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading..." variant="spinner" />}>
      <StakeholderView />
    </Suspense>
  );
}
