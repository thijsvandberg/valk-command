"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import type { Ticket } from "@/types/ticket";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import { toStakeholderTickets, toUpcomingTickets, toStakeholderSprint } from "@/lib/stakeholder-data";
import { SprintOverviewCard } from "@/components/stakeholder/SprintOverviewCard";
import { UpcomingSection } from "@/components/stakeholder/UpcomingSection";
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

export default function StakeholderPage() {
  const { data: sprints } = useJiraSprints();
  // null = user has not made a selection yet; "explicit" value overrides the default
  const [manualSprintId, setManualSprintId] = useState<string | null>(null);
  const lastUpdatedRef = useRef<Date | null>(null);
  const [lastUpdatedDisplay, setLastUpdatedDisplay] = useState<string>("Never");

  // Derive selected sprint: honour manual pick, fallback to active, then first in list
  const selectedSprintId = useMemo<string | null>(() => {
    if (manualSprintId !== null) return manualSprintId;
    if (!sprints || sprints.length === 0) return null;
    const active = sprints.find((s) => s.state === "active");
    return active ? String(active.id) : String(sprints[0].id);
  }, [manualSprintId, sprints]);

  const ticketKey = selectedSprintId
    ? `/api/tickets?sprintId=${encodeURIComponent(selectedSprintId)}`
    : null;

  const { data: rawTickets, isLoading } = useSWR<Ticket[]>(ticketKey, fetcher, {
    refreshInterval: REFRESH_INTERVAL,
    revalidateOnFocus: false,
    onSuccess: () => {
      lastUpdatedRef.current = new Date();
      setLastUpdatedDisplay(formatRelativeTime(lastUpdatedRef.current));
    },
  });

  // Find next (future) sprint relative to selected
  const nextSprint = useMemo(() => {
    if (!sprints || !selectedSprintId) return null;
    const idx = sprints.findIndex((s) => String(s.id) === selectedSprintId);
    if (idx === -1) return null;
    // First future sprint after the current position
    for (let i = idx + 1; i < sprints.length; i++) {
      if (sprints[i].state === "future") return sprints[i];
    }
    return null;
  }, [sprints, selectedSprintId]);

  const nextTicketKey = nextSprint
    ? `/api/tickets?sprintId=${encodeURIComponent(String(nextSprint.id))}`
    : null;

  const { data: rawNextTickets } = useSWR<Ticket[]>(nextTicketKey, fetcher, {
    refreshInterval: REFRESH_INTERVAL,
    revalidateOnFocus: false,
  });

  const selectedSprint = useMemo(() => {
    if (!sprints || !selectedSprintId) return null;
    return sprints.find((s) => String(s.id) === selectedSprintId) ?? null;
  }, [sprints, selectedSprintId]);

  const stakeholderSprint = useMemo(
    () => (selectedSprint ? toStakeholderSprint(selectedSprint) : null),
    [selectedSprint],
  );

  const allTickets = useMemo(
    () => (rawTickets ? toStakeholderTickets(rawTickets) : []),
    [rawTickets],
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

  // Update relative time display every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdatedDisplay(formatRelativeTime(lastUpdatedRef.current));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex min-h-full flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-white/[0.06] bg-[var(--color-surface-base)]/90 px-6 py-3 backdrop-blur-md sm:px-8 lg:px-12">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-white/30 cursor-pointer hover:text-white/60 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            aria-label="Back to app"
          >
            <ArrowLeft size={12} strokeWidth={1.5} />
            Back
          </Link>

          <span className="text-white/10">|</span>

          {/* Sprint selector */}
          {sprints && sprints.length > 0 ? (
            <div className="flex items-center gap-2">
              <label htmlFor="sprint-select" className="text-xs text-white/30">
                Sprint
              </label>
              <select
                id="sprint-select"
                value={selectedSprintId ?? ""}
                onChange={(e) => setManualSprintId(e.target.value)}
                className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-xs text-white/70 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] hover:border-white/[0.12] transition-colors duration-150"
              >
                {sprints.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                    {s.state === "active" ? " (active)" : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
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
          <div className="mx-auto max-w-6xl space-y-12">
            {/* Sprint heading */}
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

            {nextSprint && (
              <div className="border-t border-white/[0.06] pt-10">
                <UpcomingSection
                  sprintName={nextSprint.name}
                  tickets={upcomingTickets}
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
