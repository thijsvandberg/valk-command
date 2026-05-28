"use client";

import { Suspense, useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { Users, ChevronLeft, ChevronRight, RefreshCw, Check } from "lucide-react";
import type { Ticket } from "@/types/ticket";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import { toStakeholderTickets, toStakeholderSprint, buildBriefingPayload, buildDeepDivePayload } from "@/lib/stakeholder-data";
import { computeSprintHealthFromData } from "@/components/stakeholder/SprintHealthBanner";
import { useVelocityData } from "@/hooks/useVelocityData";
import { LoadingState } from "@/components/shared/LoadingState";
import { useStakeholderAnalysis, type AnalysisType } from "@/hooks/useStakeholderAnalysis";
import { swrFetcher, apiFetch } from "@/lib/api-client";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  ViewHeader,
  ViewHeaderTitle,
  ViewHeaderDivider,
} from "@/components/shared/ViewHeader";
import { AnalysisButton } from "@/components/stakeholder/AnalysisButton";
import { StakeholderOverflowMenu } from "@/components/stakeholder/StakeholderOverflowMenu";
import { StakeholderBriefing } from "@/components/stakeholder/StakeholderBriefing";
import { StakeholderSprintCards } from "@/components/stakeholder/StakeholderSprintCards";

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

const fetcher = <T,>(url: string) => swrFetcher<T>(url).catch(() => null as T);
const REFRESH_INTERVAL = 5 * 60 * 1000;
const LS_KEY_TEAM = "bridge:stakeholder-team";
const LS_KEY_SPRINT = "bridge:stakeholder-sprint";

function formatRelativeTime(date: Date | null): string {
  if (!date) return "Never";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin === 1) return "1 minute ago";
  return `${diffMin} minutes ago`;
}

function extractTeamPrefix(sprintName: string): string | null {
  const match = sprintName.match(/^([A-Z]+)[: ]/);
  return match ? match[1] : null;
}

function extractSprintNumber(sprintName: string): number {
  const match = sprintName.match(/[: ]\s*(\d+)/);
  return match ? parseInt(match[1], 10) : Infinity;
}

const navBtnClass =
  "flex items-center rounded-md p-1.5 text-text-tertiary cursor-pointer hover:bg-hover-interactive hover:text-text-secondary disabled:opacity-25 disabled:cursor-not-allowed transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]";

const selectClass =
  "rounded-md border border-border-strong bg-overlay-subtle px-2 py-1 text-body-sm text-text-secondary cursor-pointer hover:border-border-strong transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]";

function StakeholderView() {
  const { sprints } = useJiraSprints();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { mutate: globalMutate } = useSWRConfig();

  const [storedTeam, setStoredTeam] = useLocalStorage<string | null>(LS_KEY_TEAM, null);
  const [storedSprint, setStoredSprint] = useLocalStorage<string | null>(LS_KEY_SPRINT, null);

  const urlTeam = searchParams.get("team") ?? storedTeam;
  const urlSprintId = (() => {
    const raw = searchParams.get("sprintId") ?? storedSprint;
    return raw ? Number(raw) : null;
  })();

  const lastUpdatedRef = useRef<Date | null>(null);
  const [lastUpdatedDisplay, setLastUpdatedDisplay] = useState<string>("Never");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncingHistory, setIsSyncingHistory] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done">("idle");
  const syncStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [dismissed, setDismissed] = useState<Record<AnalysisType, boolean>>({
    brief: false,
    "deep-dive": false,
  });

  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);

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
    if (urlTeam) return urlTeam;
    if (!sprints) return null;
    const active = sprints.find((s) => s.state === "active");
    if (active) return extractTeamPrefix(active.name);
    return sprints.length > 0 ? extractTeamPrefix(sprints[0].name) : null;
  }, [urlTeam, sprints]);

  const teamSprints = useMemo(() => {
    if (!sprints || !selectedTeamPrefix) return [];
    return sprints
      .filter((s) => extractTeamPrefix(s.name) === selectedTeamPrefix)
      .sort((a, b) => extractSprintNumber(a.name) - extractSprintNumber(b.name));
  }, [sprints, selectedTeamPrefix]);

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

  const prevSprintIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!currentSprint?.id) return;
    if (prevSprintIdRef.current !== null && prevSprintIdRef.current !== currentSprint.id) {
      setDismissed({ brief: false, "deep-dive": false });
    }
    prevSprintIdRef.current = currentSprint.id;
  }, [currentSprint?.id]);

  const updateUrl = useCallback((team: string, sprintId: number) => {
    setStoredTeam(team);
    setStoredSprint(String(sprintId));
    const params = new URLSearchParams();
    params.set("team", team);
    params.set("sprintId", String(sprintId));
    if (isCompareMode) params.set("compare", "1");
    router.replace(`/stakeholder?${params.toString()}`);
  }, [isCompareMode, router, setStoredTeam, setStoredSprint]);

  function toggleCompareMode() {
    const params = new URLSearchParams(searchParams.toString());
    if (isCompareMode) params.delete("compare");
    else params.set("compare", "1");
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

  useEffect(() => {
    if (!currentSprint || !selectedTeamPrefix) return;
    updateUrl(selectedTeamPrefix, currentSprint.id);
  }, [currentSprint, selectedTeamPrefix, updateUrl]);

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

  const { data: prevRawTickets, isLoading: isPrevLoading } = usePreviousSprintTickets(
    previousSprint?.id ?? null,
  );

  const carriedKeys = useCarryOver(rawTickets, prevRawTickets);
  const isCarryOverLoading = isPrevLoading && previousSprint !== null;

  const prevStakeholderSprint = useMemo(
    () => (previousSprint ? toStakeholderSprint(previousSprint) : null),
    [previousSprint],
  );
  const prevAllTickets = useMemo(
    () => (prevRawTickets ? toStakeholderTickets(prevRawTickets) : []),
    [prevRawTickets],
  );
  const prevDoneTickets = prevAllTickets.filter((t) => t.status === "Completed");
  const prevInReviewTickets = prevAllTickets.filter((t) => t.status === "In Review");
  const prevInProgressTickets = prevAllTickets.filter((t) => t.status === "In Progress");
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
  const inReviewTickets = allTickets.filter((t) => t.status === "In Review");
  const inProgressTickets = allTickets.filter((t) => t.status === "In Progress");
  const todoTickets = allTickets.filter((t) => t.status === "To Do");
  const deprecatedTickets = allTickets.filter((t) => t.status === "Deprecated");

  const currentDonePoints = useMemo(
    () => doneTickets.reduce((s, t) => s + (t.storyPoints ?? 0), 0),
    [doneTickets],
  );
  const currentTodoCount = todoTickets.length;

  const sprintHealth = useMemo(() => {
    if (!stakeholderSprint || stakeholderSprint.state !== "active") return null;
    const allActive = [...doneTickets, ...inReviewTickets, ...inProgressTickets, ...todoTickets];
    return computeSprintHealthFromData(doneTickets, allActive, stakeholderSprint);
  }, [stakeholderSprint, doneTickets, inReviewTickets, inProgressTickets, todoTickets]);

  const analysis = useStakeholderAnalysis(currentSprint?.id ?? null);

  async function handleSyncSprint() {
    if (!currentSprint || isSyncing) return;
    setIsSyncing(true);
    setSyncStatus("syncing");
    if (syncStatusTimerRef.current) clearTimeout(syncStatusTimerRef.current);
    try {
      await Promise.all([
        apiFetch("/api/jira/sync-sprints", { method: "POST" }),
        apiFetch("/api/jira/sync-sprints?scope=history", { method: "POST" }),
        apiFetch(`/api/jira/sync-tickets?sprintId=${currentSprint.id}`, { method: "POST" }),
      ]);

      type FreshSprint = { id: number; name: string; state: string };
      const freshSprints = await apiFetch<FreshSprint[]>("/api/jira/sprints");
      const freshTeamClosed = freshSprints.filter(
        (s) => extractTeamPrefix(s.name) === selectedTeamPrefix && s.state === "closed",
      );

      const syncedSprintIds = new Set(velocityData?.map((v) => v.sprintId) ?? []);
      const missingSprints = freshTeamClosed.filter((s) => !syncedSprintIds.has(s.id));
      for (const sprint of missingSprints) {
        await apiFetch(`/api/jira/sync-tickets?sprintId=${sprint.id}`, { method: "POST" });
      }

      await Promise.all([
        globalMutate(ticketKey),
        globalMutate("/api/jira/sprints"),
        selectedTeamPrefix
          ? globalMutate(`/api/velocity?teamPrefix=${encodeURIComponent(selectedTeamPrefix)}&limit=100`)
          : Promise.resolve(),
      ]);
      lastUpdatedRef.current = new Date();
      setLastUpdatedDisplay(formatRelativeTime(lastUpdatedRef.current));
      setSyncStatus("done");
      syncStatusTimerRef.current = setTimeout(() => setSyncStatus("idle"), 3000);
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleSyncHistory() {
    if (!selectedTeamPrefix || isSyncingHistory) return;
    setIsSyncingHistory(true);
    try {
      await apiFetch("/api/jira/sync-sprints?scope=history", { method: "POST" });

      type FreshSprint = { id: number; name: string; state: string };
      const freshSprints = await apiFetch<FreshSprint[]>("/api/jira/sprints");
      const closedSprints = freshSprints
        .filter((s) => extractTeamPrefix(s.name) === selectedTeamPrefix && s.state === "closed")
        .sort((a, b) => extractSprintNumber(a.name) - extractSprintNumber(b.name));

      const syncedSprintIds = new Set(velocityData?.map((v) => v.sprintId) ?? []);
      const missingSprints = closedSprints.filter((s) => !syncedSprintIds.has(s.id));

      for (const sprint of missingSprints) {
        await apiFetch(`/api/jira/sync-tickets?sprintId=${sprint.id}`, { method: "POST" });
      }
      await Promise.all([
        globalMutate("/api/jira/sprints"),
        globalMutate(`/api/velocity?teamPrefix=${encodeURIComponent(selectedTeamPrefix)}&limit=100`),
      ]);
    } finally {
      setIsSyncingHistory(false);
    }
  }

  function triggerGenerate(type: AnalysisType) {
    if (!stakeholderSprint || !currentSprint) return;
    setDismissed((d) => ({ ...d, [type]: false }));
    const allInProgress = [...inReviewTickets, ...inProgressTickets];
    const payload =
      type === "brief"
        ? buildBriefingPayload(stakeholderSprint, doneTickets, allInProgress, todoTickets)
        : buildDeepDivePayload(stakeholderSprint, doneTickets, allInProgress, todoTickets);
    analysis.generate(type, currentSprint.name, payload.sprintData, currentDonePoints, currentTodoCount);
  }

  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdatedDisplay(formatRelativeTime(lastUpdatedRef.current));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const briefLive = analysis.liveState["brief"];
  const deepDiveLive = analysis.liveState["deep-dive"];
  const anyRunning =
    briefLive.status === "submitting" || briefLive.status === "streaming" ||
    deepDiveLive.status === "submitting" || deepDiveLive.status === "streaming";

  const storedBriefRisks = useMemo(() => {
    if (!analysis.brief?.risks) return [];
    try { return JSON.parse(analysis.brief.risks) as string[]; } catch { return []; }
  }, [analysis.brief?.risks]);

  return (
    <>
      <ViewHeader
        icon={<Users size={15} strokeWidth={1.5} />}
        actions={
          <div className="flex items-center gap-1.5">
            {isLoading && (
              <RefreshCw size={12} strokeWidth={1.5} className="animate-spin text-text-muted mr-1" />
            )}

            {!isCompareMode && stakeholderSprint && (
              <>
                <AnalysisButton
                  type="brief"
                  label="Status"
                  isRunning={briefLive.status === "submitting" || briefLive.status === "streaming"}
                  hasResult={!!(analysis.brief?.status === "completed")}
                  isStale={analysis.isStale(analysis.brief, currentDonePoints, currentTodoCount)}
                  onClick={() => {
                    setDismissed((d) => ({ ...d, brief: false }));
                    setAiDrawerOpen(true);
                  }}
                  disabled={anyRunning}
                />
                <AnalysisButton
                  type="deep-dive"
                  label="Insights"
                  isRunning={deepDiveLive.status === "submitting" || deepDiveLive.status === "streaming"}
                  hasResult={!!(analysis.deepDive?.status === "completed")}
                  isStale={analysis.isStale(analysis.deepDive, currentDonePoints, currentTodoCount)}
                  onClick={() => {
                    setDismissed((d) => ({ ...d, "deep-dive": false }));
                    setAiDrawerOpen(true);
                  }}
                  disabled={anyRunning}
                />
                <span className="h-4 w-px bg-overlay-strong mx-0.5" aria-hidden />
              </>
            )}

            {syncStatus !== "idle" && (
              <div className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-body-sm transition-opacity duration-300 ${
                syncStatus === "syncing"
                  ? "text-text-tertiary"
                  : "text-[var(--color-secondary-400)]/60"
              }`}>
                {syncStatus === "syncing" ? (
                  <RefreshCw size={11} strokeWidth={1.5} className="animate-spin shrink-0" />
                ) : (
                  <Check size={11} strokeWidth={2} className="shrink-0" />
                )}
                {syncStatus === "syncing" ? "Syncing..." : "Synced"}
              </div>
            )}

            <StakeholderOverflowMenu
              onSyncSprint={handleSyncSprint}
              onSyncHistory={handleSyncHistory}
              isSyncing={isSyncing}
              isSyncingHistory={isSyncingHistory}
              syncDisabled={!currentSprint}
              hasPreviousSprint={!!previousSprint}
              isCompareMode={isCompareMode}
              onToggleCompare={toggleCompareMode}
              sprint={stakeholderSprint}
              doneTickets={doneTickets}
              inProgressTickets={[...inReviewTickets, ...inProgressTickets]}
              todoTickets={todoTickets}
              aiNarrative={analysis.brief?.narrative ?? null}
              aiRisks={storedBriefRisks}
            />
          </div>
        }
      >
        <ViewHeaderTitle>Stakeholder</ViewHeaderTitle>

        {availableTeams.length > 1 && selectedTeamPrefix && (
          <>
            <ViewHeaderDivider />
            <div className="flex items-center gap-1.5">
              <label htmlFor="team-select" className="text-body-sm text-text-tertiary">
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

      <StakeholderSprintCards
        isLoading={isLoading}
        rawTickets={rawTickets}
        stakeholderSprint={stakeholderSprint}
        isCompareMode={isCompareMode}
        prevStakeholderSprint={prevStakeholderSprint}
        isPrevLoading={isPrevLoading}
        carriedKeys={carriedKeys}
        isCarryOverLoading={isCarryOverLoading}
        previousSprint={previousSprint}
        doneTickets={doneTickets}
        inReviewTickets={inReviewTickets}
        inProgressTickets={inProgressTickets}
        todoTickets={todoTickets}
        deprecatedTickets={deprecatedTickets}
        prevDoneTickets={prevDoneTickets}
        prevInReviewTickets={prevInReviewTickets}
        prevInProgressTickets={prevInProgressTickets}
        prevTodoTickets={prevTodoTickets}
        prevDeprecatedTickets={prevDeprecatedTickets}
        prevAllTickets={prevAllTickets}
        showHealthBadge={!!sprintHealth}
        velocityData={velocityData ?? undefined}
        isVelocityLoading={isVelocityLoading}
        lastUpdatedDisplay={lastUpdatedDisplay}
      />

      <StakeholderBriefing
        open={aiDrawerOpen}
        onClose={() => setAiDrawerOpen(false)}
        analysis={analysis}
        currentDonePoints={currentDonePoints}
        currentTodoCount={currentTodoCount}
        anyRunning={anyRunning}
        onGenerate={triggerGenerate}
        dismissed={dismissed}
        onDismiss={(type) => setDismissed((d) => ({ ...d, [type]: true }))}
        storedBriefRisks={storedBriefRisks}
      />
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
