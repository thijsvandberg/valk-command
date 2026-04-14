"use client";

import { Suspense, useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { Users, ChevronLeft, ChevronRight, RefreshCw, Columns2, CloudDownload, History, Sparkles } from "lucide-react";
import type { Ticket } from "@/types/ticket";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import { toStakeholderTickets, toStakeholderSprint, buildBriefingPayload } from "@/lib/stakeholder-data";
import { SprintOverviewCard } from "@/components/stakeholder/SprintOverviewCard";
import { CopyMarkdownButton } from "@/components/stakeholder/CopyMarkdownButton";
import { VelocitySparkline } from "@/components/stakeholder/VelocitySparkline";
import { useVelocityData } from "@/hooks/useVelocityData";
import { LoadingState } from "@/components/shared/LoadingState";
import { AiInsightsPanel, parseBriefingOutput } from "@/components/stakeholder/AiInsightsPanel";
import { useWorkspaceTask } from "@/hooks/useWorkspaceTask";
import {
  ViewHeader,
  ViewHeaderTitle,
  ViewHeaderDivider,
} from "@/components/shared/ViewHeader";

function usePreviousSprintTickets(previousSprintId: number | null) {
  const key = previousSprintId !== null
    ? `/api/tickets?sprintId=${encodeURIComponent(String(previousSprintId))}`
    : null;
  return useSWR<Ticket[]>(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });
}

function useCarryOver(
  currentTickets: Ticket[] | undefined,
  prevTickets: Ticket[] | undefined,
): Set<string> {
  return useMemo(() => {
    if (!currentTickets || !prevTickets) return new Set<string>();
    const prevKeys = new Set(prevTickets.map((t) => t.key.toLowerCase()));
    const carried = new Set<string>();
    for (const t of currentTickets) {
      if (prevKeys.has(t.key.toLowerCase())) carried.add(t.key);
    }
    return carried;
  }, [currentTickets, prevTickets]);
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

// First number after team prefix: "BT: 133" → 133, "BT: 130 - Align sidebars" → 130, "BT: TODO" → Infinity
function extractSprintNumber(sprintName: string): number {
  const match = sprintName.match(/[: ]\s*(\d+)/);
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
  const { mutate } = useSWRConfig();

  // URL params take precedence; session storage is the fallback for within-session memory
  const urlTeam = searchParams.get("team") ?? sessionGet(SESSION_KEY_TEAM);
  const urlSprintId = (() => {
    const raw = searchParams.get("sprintId") ?? sessionGet(SESSION_KEY_SPRINT);
    return raw ? Number(raw) : null;
  })();

  const lastUpdatedRef = useRef<Date | null>(null);
  const [lastUpdatedDisplay, setLastUpdatedDisplay] = useState<string>("Never");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncingHistory, setIsSyncingHistory] = useState(false);

  // AI Insights state
  const briefing = useWorkspaceTask();
  const [briefingNarrative, setBriefingNarrative] = useState<string | null>(null);
  const [briefingRisks, setBriefingRisks] = useState<string[]>([]);
  const [briefingDismissed, setBriefingDismissed] = useState(false);
  const prevSprintIdRef = useRef<number | null>(null);

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

  const isCompareMode = searchParams.get("compare") === "1" && previousSprint !== null;

  function updateUrl(team: string, sprintId: number) {
    sessionSet(SESSION_KEY_TEAM, team);
    sessionSet(SESSION_KEY_SPRINT, String(sprintId));
    const params = new URLSearchParams();
    params.set("team", team);
    params.set("sprintId", String(sprintId));
    // Preserve compare param when navigating
    if (isCompareMode) params.set("compare", "1");
    router.replace(`/stakeholder?${params.toString()}`);
  }

  function toggleCompareMode() {
    const params = new URLSearchParams(searchParams.toString());
    if (isCompareMode) {
      params.delete("compare");
    } else {
      params.set("compare", "1");
    }
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

  async function handleSyncSprint() {
    if (!currentSprint || isSyncing) return;
    setIsSyncing(true);
    try {
      await fetch(`/api/jira/sync-tickets?sprintId=${currentSprint.id}`, { method: "POST" });
      await mutate(ticketKey);
      if (selectedTeamPrefix) {
        await mutate(`/api/velocity?teamPrefix=${encodeURIComponent(selectedTeamPrefix)}&limit=100`);
      }
      lastUpdatedRef.current = new Date();
      setLastUpdatedDisplay(formatRelativeTime(lastUpdatedRef.current));
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleSyncHistory() {
    if (!selectedTeamPrefix || isSyncingHistory) return;
    const closedSprints = teamSprints
      .filter((s) => s.state === "closed")
      .sort((a, b) => extractSprintNumber(a.name) - extractSprintNumber(b.name));
    if (closedSprints.length === 0) return;
    setIsSyncingHistory(true);
    try {
      for (const sprint of closedSprints) {
        await fetch(`/api/jira/sync-tickets?sprintId=${sprint.id}`, { method: "POST" });
      }
      await mutate(`/api/velocity?teamPrefix=${encodeURIComponent(selectedTeamPrefix)}&limit=100`);
    } finally {
      setIsSyncingHistory(false);
    }
  }

  // Sync URL and session whenever selection is known (handles first load with no params)
  useEffect(() => {
    if (!currentSprint || !selectedTeamPrefix) return;
    updateUrl(selectedTeamPrefix, currentSprint.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSprint?.id, selectedTeamPrefix]);

  // Parse briefing output when agent completes
  useEffect(() => {
    if (briefing.status === "completed" && briefing.output) {
      const { narrative, risks } = parseBriefingOutput(briefing.output);
      setBriefingNarrative(narrative);
      setBriefingRisks(risks);
    }
  }, [briefing.status, briefing.output]);

  // Reset briefing state when sprint changes
  useEffect(() => {
    if (currentSprint?.id === undefined) return;
    if (prevSprintIdRef.current !== null && prevSprintIdRef.current !== currentSprint.id) {
      briefing.reset();
      setBriefingNarrative(null);
      setBriefingRisks([]);
      setBriefingDismissed(false);
    }
    prevSprintIdRef.current = currentSprint.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSprint?.id]);

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

  // Previous sprint tickets: shared by carry-over detection and comparison mode
  const { data: prevRawTickets, isLoading: isPrevLoading } = usePreviousSprintTickets(
    previousSprint?.id ?? null,
  );

  const carriedKeys = useCarryOver(rawTickets, prevRawTickets);
  const isCarryOverLoading = isPrevLoading && previousSprint !== null;

  // Previous sprint data for comparison panel
  const prevStakeholderSprint = useMemo(
    () => (previousSprint ? toStakeholderSprint(previousSprint) : null),
    [previousSprint],
  );
  const prevAllTickets = useMemo(
    () => (prevRawTickets ? toStakeholderTickets(prevRawTickets) : []),
    [prevRawTickets],
  );
  const prevDoneTickets = prevAllTickets.filter((t) => t.status === "Completed");
  const prevInProgressTickets = prevAllTickets.filter(
    (t) => t.status === "In Progress" || t.status === "In Review",
  );
  const prevTodoTickets = prevAllTickets.filter((t) => t.status === "To Do");
  const prevDeprecatedTickets = prevAllTickets.filter((t) => t.status === "Deprecated");

  const { data: velocityData, isLoading: isVelocityLoading } = useVelocityData(selectedTeamPrefix);

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

  const handleGenerateInsights = useCallback(() => {
    if (!stakeholderSprint) return;
    setBriefingDismissed(false);
    setBriefingNarrative(null);
    setBriefingRisks([]);
    briefing.submitAndStream(
      "stakeholder-briefing",
      buildBriefingPayload(stakeholderSprint, doneTickets, inProgressTickets, todoTickets),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stakeholderSprint, doneTickets, inProgressTickets, todoTickets]);

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
            {(isLoading || isSyncing) && (
              <RefreshCw size={12} strokeWidth={1.5} className="animate-spin text-white/20" />
            )}
            {/* Sync history: last 5 closed sprints for velocity data */}
            <button
              type="button"
              onClick={handleSyncHistory}
              disabled={isSyncingHistory || !selectedTeamPrefix}
              title="Sync last 5 closed sprints for velocity history"
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs bg-white/[0.04] text-white/40 hover:bg-white/[0.07] hover:text-white/60 transition-colors duration-150 cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              <History size={12} strokeWidth={1.5} className={isSyncingHistory ? "animate-spin" : ""} />
              Sync history
            </button>
            {/* Sync sprint: current sprint tickets */}
            <button
              type="button"
              onClick={handleSyncSprint}
              disabled={isSyncing || !currentSprint}
              title="Sync current sprint tickets from Jira"
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs bg-white/[0.04] text-white/40 hover:bg-white/[0.07] hover:text-white/60 transition-colors duration-150 cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              <CloudDownload size={12} strokeWidth={1.5} />
              Sync sprint
            </button>
            {previousSprint && (
              <button
                type="button"
                onClick={toggleCompareMode}
                className={[
                  "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors duration-150 cursor-pointer",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]",
                  isCompareMode
                    ? "bg-[var(--color-brand-400)]/15 text-[var(--color-brand-400)]/80"
                    : "bg-white/[0.04] text-white/40 hover:bg-white/[0.07] hover:text-white/60",
                ].join(" ")}
                aria-label={isCompareMode ? "Exit comparison mode" : "Compare with previous sprint"}
              >
                <Columns2 size={12} strokeWidth={1.5} />
                Compare
              </button>
            )}
            {!isCompareMode && stakeholderSprint && (
              <>
                <button
                  type="button"
                  onClick={handleGenerateInsights}
                  disabled={briefing.status === "submitting" || briefing.status === "streaming"}
                  title="Generate AI insights for this sprint"
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs bg-white/[0.04] text-white/40 hover:bg-white/[0.07] hover:text-white/60 transition-colors duration-150 cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                >
                  <Sparkles size={12} strokeWidth={1.5} />
                  Generate insights
                </button>
                <CopyMarkdownButton
                  sprint={stakeholderSprint}
                  doneTickets={doneTickets}
                  inProgressTickets={inProgressTickets}
                  todoTickets={todoTickets}
                  upcomingTickets={[]}
                  nextSprintName={null}
                  aiNarrative={briefingDismissed ? null : briefingNarrative}
                  aiRisks={briefingDismissed ? [] : briefingRisks}
                />
              </>
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
                disabled={selectedIndex === 0 || isCompareMode}
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
                disabled={selectedIndex === teamSprints.length - 1 || isCompareMode}
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
          <div className="mx-auto max-w-7xl space-y-10">
            {/* Sprint heading + sparkline */}
            <div className="space-y-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/25">
                Sprint overview
              </p>
              {!isCompareMode && (
                <h1 className="text-2xl font-semibold tracking-tight text-white/90 sm:text-3xl">
                  {stakeholderSprint.name}
                </h1>
              )}
              <VelocitySparkline
                data={velocityData ?? []}
                isLoading={isVelocityLoading}
              />
            </div>

            {isCompareMode && prevStakeholderSprint ? (
              // Two-panel comparison layout
              <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
                {/* Previous sprint panel */}
                <div className="space-y-6 overflow-auto">
                  <h2 className="text-lg font-semibold tracking-tight text-white/60">
                    {prevStakeholderSprint.name}
                    <span className="ml-2 text-xs font-normal text-white/25">Previous</span>
                  </h2>
                  {isPrevLoading ? (
                    <LoadingState label="Loading previous sprint..." variant="spinner" />
                  ) : (
                    <SprintOverviewCard
                      sprint={prevStakeholderSprint}
                      doneTickets={prevDoneTickets}
                      inProgressTickets={prevInProgressTickets}
                      todoTickets={prevTodoTickets}
                      deprecatedTickets={prevDeprecatedTickets}
                    />
                  )}
                </div>

                {/* Current sprint panel */}
                <div className="space-y-6 overflow-auto">
                  <h2 className="text-lg font-semibold tracking-tight text-white/90">
                    {stakeholderSprint.name}
                    <span className="ml-2 text-xs font-normal text-white/25">Current</span>
                  </h2>
                  {/* Carry-over summary (shown in current panel) */}
                  {isCarryOverLoading && (
                    <p className="flex items-center gap-1.5 text-xs text-white/20">
                      <RefreshCw size={10} strokeWidth={1.5} className="animate-spin" />
                      Loading carry-over data...
                    </p>
                  )}
                  {!isCarryOverLoading && carriedKeys.size > 0 && (
                    <p className="text-xs text-amber-400/60">
                      {carriedKeys.size} ticket{carriedKeys.size === 1 ? "" : "s"} carried from {previousSprint?.name}
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
                </div>
              </div>
            ) : (
              // Single sprint view
              <div className="space-y-6">
                {/* AI Insights panel: shown above ticket sections when not dismissed */}
                {briefing.status !== "idle" && !briefingDismissed && (
                  <AiInsightsPanel
                    status={briefing.status}
                    progressText={briefing.progressText}
                    narrative={briefingNarrative}
                    risks={briefingRisks}
                    error={briefing.error}
                    onDismiss={() => setBriefingDismissed(true)}
                    onRetry={handleGenerateInsights}
                  />
                )}
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
              </div>
            )}

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
