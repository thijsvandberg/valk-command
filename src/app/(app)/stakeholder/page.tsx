"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import type { Ticket } from "@/types/ticket";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import {
  toStakeholderTickets,
  toUpcomingTickets,
  toStakeholderSprint,
} from "@/lib/stakeholder-data";
import { SprintOverviewCard } from "@/components/stakeholder/SprintOverviewCard";
import { AdjacentSprintSection } from "@/components/stakeholder/AdjacentSprintSection";
import { CopyMarkdownButton } from "@/components/stakeholder/CopyMarkdownButton";
import { LoadingState } from "@/components/shared/LoadingState";

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));
const REFRESH_INTERVAL = 5 * 60 * 1000;

function formatRelativeTime(date: Date | null): string {
  if (!date) return "Never";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin === 1) return "1 minute ago";
  return `${diffMin} minutes ago`;
}

function extractTeamPrefix(sprintName: string): string | null {
  const match = sprintName.match(/^([A-Z]+):/);
  return match ? match[1] : null;
}

// Sprints named "BT: 135" sort before "BT: TODO" / "BT: Backlog" (no trailing number)
function extractSprintNumber(sprintName: string): number {
  const match = sprintName.match(/(\d+)\s*$/);
  return match ? parseInt(match[1], 10) : Infinity;
}

export default function StakeholderPage() {
  const { data: sprints } = useJiraSprints();

  const [manualTeamPrefix, setManualTeamPrefix] = useState<string | null>(null);
  // Index within teamSprints; null = use smart default (active sprint)
  const [manualTeamIndex, setManualTeamIndex] = useState<number | null>(null);

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

  const selectedTeamPrefix = useMemo<string | null>(() => {
    if (manualTeamPrefix !== null) return manualTeamPrefix;
    if (!sprints) return null;
    const active = sprints.find((s) => s.state === "active");
    if (active) return extractTeamPrefix(active.name);
    return sprints.length > 0 ? extractTeamPrefix(sprints[0].name) : null;
  }, [manualTeamPrefix, sprints]);

  // Sprints for the selected team, sorted numerically; non-numeric (TODO, Backlog) go last
  const teamSprints = useMemo(() => {
    if (!sprints || !selectedTeamPrefix) return [];
    return sprints
      .filter((s) => extractTeamPrefix(s.name) === selectedTeamPrefix)
      .sort((a, b) => extractSprintNumber(a.name) - extractSprintNumber(b.name));
  }, [sprints, selectedTeamPrefix]);

  // Derive current index: honour manual pick, fallback to active sprint
  const selectedIndex = useMemo<number>(() => {
    if (manualTeamIndex !== null) {
      return Math.max(0, Math.min(manualTeamIndex, teamSprints.length - 1));
    }
    const activeIdx = teamSprints.findIndex((s) => s.state === "active");
    return activeIdx >= 0 ? activeIdx : 0;
  }, [manualTeamIndex, teamSprints]);

  const currentSprint = teamSprints[selectedIndex] ?? null;
  const prevSprint = selectedIndex > 0 ? teamSprints[selectedIndex - 1] : null;
  const nextSprint = selectedIndex < teamSprints.length - 1 ? teamSprints[selectedIndex + 1] : null;

  function handleTeamChange(prefix: string) {
    setManualTeamPrefix(prefix);
    setManualTeamIndex(null);
  }

  function navigate(delta: -1 | 1) {
    setManualTeamIndex((prev) => {
      const base = prev ?? selectedIndex;
      return Math.max(0, Math.min(base + delta, teamSprints.length - 1));
    });
  }

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

  // Fetch previous sprint tickets
  const prevTicketKey = prevSprint
    ? `/api/tickets?sprintId=${encodeURIComponent(String(prevSprint.id))}`
    : null;
  const { data: rawPrevTickets } = useSWR<Ticket[]>(prevTicketKey, fetcher, {
    refreshInterval: REFRESH_INTERVAL,
    revalidateOnFocus: false,
  });

  // Fetch next sprint tickets
  const nextTicketKey = nextSprint
    ? `/api/tickets?sprintId=${encodeURIComponent(String(nextSprint.id))}`
    : null;
  const { data: rawNextTickets } = useSWR<Ticket[]>(nextTicketKey, fetcher, {
    refreshInterval: REFRESH_INTERVAL,
    revalidateOnFocus: false,
  });

  const stakeholderSprint = useMemo(
    () => (currentSprint ? toStakeholderSprint(currentSprint) : null),
    [currentSprint],
  );

  const allTickets = useMemo(
    () => (rawTickets ? toStakeholderTickets(rawTickets) : []),
    [rawTickets],
  );
  const prevTickets = useMemo(
    () => (rawPrevTickets ? toStakeholderTickets(rawPrevTickets) : []),
    [rawPrevTickets],
  );
  const upcomingTickets = useMemo(
    () => (rawNextTickets ? toUpcomingTickets(rawNextTickets) : []),
    [rawNextTickets],
  );

  const doneTickets = allTickets.filter((t) => t.status === "Completed");
  const inProgressTickets = allTickets.filter(
    (t) => t.status === "In Progress" || t.status === "In Review",
  );
  const todoTickets = allTickets.filter((t) => t.status === "To Do");

  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdatedDisplay(formatRelativeTime(lastUpdatedRef.current));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const navBtnClass =
    "flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-white/40 cursor-pointer hover:bg-white/[0.06] hover:text-white/70 disabled:opacity-25 disabled:cursor-not-allowed transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]";

  const selectClass =
    "rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-xs text-white/70 cursor-pointer hover:border-white/[0.12] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]";

  return (
    <div className="flex min-h-full flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-white/[0.06] bg-[var(--color-surface-base)]/90 px-6 py-3 backdrop-blur-md sm:px-8 lg:px-12">
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-white/30 cursor-pointer hover:text-white/60 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            aria-label="Back to app"
          >
            <ArrowLeft size={12} strokeWidth={1.5} />
            Back
          </Link>

          <span className="text-white/10">|</span>

          {/* Team selector */}
          {availableTeams.length > 1 && selectedTeamPrefix && (
            <div className="flex items-center gap-2">
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
          )}

          {/* Sprint navigation */}
          {teamSprints.length > 0 && currentSprint && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => navigate(-1)}
                disabled={selectedIndex === 0}
                className={navBtnClass}
                aria-label="Previous sprint"
              >
                <ChevronLeft size={13} strokeWidth={1.5} />
                <span className="hidden sm:inline">Previous</span>
              </button>

              <span className="px-2 text-sm text-white/70 font-medium whitespace-nowrap">
                {currentSprint.name}
                {currentSprint.state === "active" && (
                  <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-brand-400)]/70">
                    active
                  </span>
                )}
              </span>

              <button
                type="button"
                onClick={() => navigate(1)}
                disabled={selectedIndex === teamSprints.length - 1}
                className={navBtnClass}
                aria-label="Next sprint"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight size={13} strokeWidth={1.5} />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isLoading && (
            <RefreshCw size={12} strokeWidth={1.5} className="animate-spin text-white/20" />
          )}
          {stakeholderSprint && (
            <CopyMarkdownButton
              sprint={stakeholderSprint}
              doneTickets={doneTickets}
              inProgressTickets={inProgressTickets}
              todoTickets={todoTickets}
              upcomingTickets={upcomingTickets}
              nextSprintName={nextSprint?.name ?? null}
            />
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 px-6 py-10 sm:px-8 lg:px-12 xl:px-16">
        {isLoading || !rawTickets ? (
          <LoadingState label="Loading sprint data..." variant="spinner" />
        ) : !stakeholderSprint ? (
          <LoadingState label="No sprint selected" />
        ) : (
          <div className="mx-auto max-w-6xl space-y-10">
            {/* Previous sprint */}
            {prevSprint && (
              <div className="border-b border-white/[0.04] pb-10">
                <AdjacentSprintSection
                  label="Previous"
                  sprintName={prevSprint.name}
                  tickets={prevTickets}
                />
              </div>
            )}

            {/* Current sprint */}
            <div className="space-y-12">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/25">
                  Sprint overview
                </p>
                <h1 className="text-2xl font-semibold tracking-tight text-white/90 sm:text-3xl">
                  {stakeholderSprint.name}
                </h1>
              </div>

              <SprintOverviewCard
                sprint={stakeholderSprint}
                doneTickets={doneTickets}
                inProgressTickets={inProgressTickets}
                todoTickets={todoTickets}
              />
            </div>

            {/* Next sprint */}
            {nextSprint && (
              <div className="border-t border-white/[0.06] pt-10">
                <AdjacentSprintSection
                  label="Upcoming"
                  sprintName={nextSprint.name}
                  tickets={upcomingTickets}
                  allowKeyReveal
                />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] px-6 py-3 sm:px-8 lg:px-12">
        <p className="text-xs text-white/20">
          Last updated: {lastUpdatedDisplay}
        </p>
      </footer>
    </div>
  );
}
