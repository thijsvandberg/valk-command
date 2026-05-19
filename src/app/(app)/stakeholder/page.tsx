"use client";

import { Suspense, useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { Users, ChevronLeft, ChevronRight, RefreshCw, Columns2, Sparkles, BookOpen, Check, MoreHorizontal, Copy, CloudDownload, History, X, CloudUpload } from "lucide-react";
import type { Ticket } from "@/types/ticket";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import { toStakeholderTickets, toStakeholderSprint, buildBriefingPayload, buildDeepDivePayload, buildMarkdownSummary, buildPlainTextSummary } from "@/lib/stakeholder-data";
import type { StakeholderSprint, StakeholderTicket } from "@/lib/stakeholder-data";
import { SprintOverviewCard } from "@/components/stakeholder/SprintOverviewCard";
import { SprintHealthBanner, computeSprintHealthFromData } from "@/components/stakeholder/SprintHealthBanner";
import { VelocitySparkline } from "@/components/stakeholder/VelocitySparkline";
import { useVelocityData } from "@/hooks/useVelocityData";
import { LoadingState } from "@/components/shared/LoadingState";
import { AiInsightsPanel } from "@/components/stakeholder/AiInsightsPanel";
import { useStakeholderAnalysis, type AnalysisType } from "@/hooks/useStakeholderAnalysis";
import { swrFetcher, apiFetch } from "@/lib/api-client";
import { useLocalStorage } from "@/hooks/useLocalStorage";
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
  "rounded-md border border-border-strong bg-overlay-subtle px-2 py-1 text-xs text-text-secondary cursor-pointer hover:border-border-strong transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]";

// Analysis trigger button with state indicator
function AnalysisButton({
  type,
  label,
  isRunning,
  hasResult,
  isStale,
  onClick,
  disabled,
}: {
  type: AnalysisType;
  label: string;
  isRunning: boolean;
  hasResult: boolean;
  isStale: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  const Icon = type === "brief" ? Sparkles : BookOpen;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`Generate ${label} for this sprint`}
      className="relative flex items-center gap-1.5 rounded-md px-2 py-1 text-xs bg-overlay-subtle text-text-tertiary hover:bg-overlay-default hover:text-text-secondary transition-colors duration-150 cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
    >
      {isRunning ? (
        <RefreshCw size={12} strokeWidth={1.5} className="animate-spin" />
      ) : (
        <Icon size={12} strokeWidth={1.5} />
      )}
      {label}
      {hasResult && !isRunning && (
        <span
          className={`ml-0.5 h-1.5 w-1.5 rounded-full ${isStale ? "bg-amber-400/60" : "bg-emerald-400/60"}`}
          title={isStale ? "Data changed since last analysis" : "Analysis up to date"}
        />
      )}
      {hasResult && !isRunning && !isStale && (
        <Check size={9} strokeWidth={2} className="text-emerald-400/60" />
      )}
    </button>
  );
}

function OverflowMenu({
  onSyncSprint,
  onSyncHistory,
  isSyncing,
  isSyncingHistory,
  syncDisabled,
  hasPreviousSprint,
  isCompareMode,
  onToggleCompare,
  sprint,
  doneTickets,
  inProgressTickets,
  todoTickets,
  aiNarrative,
  aiRisks,
}: {
  onSyncSprint: () => void;
  onSyncHistory: () => void;
  isSyncing: boolean;
  isSyncingHistory: boolean;
  syncDisabled: boolean;
  hasPreviousSprint: boolean;
  isCompareMode: boolean;
  onToggleCompare: () => void;
  sprint: StakeholderSprint | null;
  doneTickets: StakeholderTicket[];
  inProgressTickets: StakeholderTicket[];
  todoTickets: StakeholderTicket[];
  aiNarrative: string | null;
  aiRisks: string[];
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedPlain, setCopiedPlain] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function outside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  async function handleCopy() {
    if (!sprint) return;
    const md = buildMarkdownSummary(sprint, doneTickets, inProgressTickets, todoTickets, [], null, aiNarrative ?? undefined, aiRisks);
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  async function handleCopyPlain() {
    if (!sprint) return;
    const text = buildPlainTextSummary(sprint, doneTickets);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPlain(true);
      setTimeout(() => setCopiedPlain(false), 2000);
    } catch {}
  }

  const itemClass =
    "flex w-full items-center gap-2.5 px-3 py-2 text-xs text-text-secondary cursor-pointer hover:bg-overlay-default hover:text-text-primary transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          navBtnClass,
          open ? "bg-overlay-default text-text-secondary" : "",
        ].join(" ")}
        aria-label="More options"
        title="More options"
      >
        <MoreHorizontal size={15} strokeWidth={1.5} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[188px] rounded-lg border border-border-strong bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-popover)]">
          <button
            type="button"
            onClick={() => { onSyncSprint(); setOpen(false); }}
            disabled={isSyncing || syncDisabled}
            className={itemClass}
          >
            <CloudDownload size={12} strokeWidth={1.5} className={isSyncing ? "animate-spin" : ""} />
            Sync current sprint
          </button>
          <button
            type="button"
            onClick={() => { onSyncHistory(); setOpen(false); }}
            disabled={isSyncingHistory || syncDisabled}
            className={itemClass}
          >
            <History size={12} strokeWidth={1.5} className={isSyncingHistory ? "animate-spin" : ""} />
            Sync history
          </button>

          {hasPreviousSprint && (
            <>
              <div className="my-1 h-px bg-overlay-default" />
              <button
                type="button"
                onClick={() => { onToggleCompare(); setOpen(false); }}
                className={itemClass}
              >
                <Columns2 size={12} strokeWidth={1.5} />
                <span className="flex-1 text-left">Compare sprints</span>
                {isCompareMode && <Check size={10} strokeWidth={2} className="text-[var(--color-brand-400)]/70" />}
              </button>
            </>
          )}

          {sprint && (
            <>
              <div className="my-1 h-px bg-overlay-default" />
              <button
                type="button"
                onClick={handleCopy}
                className={itemClass}
              >
                {copied ? (
                  <>
                    <Check size={12} strokeWidth={2} className="text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} strokeWidth={1.5} />
                    Copy as Markdown
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleCopyPlain}
                className={itemClass}
              >
                {copiedPlain ? (
                  <>
                    <Check size={12} strokeWidth={2} className="text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} strokeWidth={1.5} />
                    Copy as plain text
                  </>
                )}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function GeneratePrompt({
  type,
  disabled,
  onGenerate,
}: {
  type: AnalysisType;
  disabled: boolean;
  onGenerate: () => void;
}) {
  const label = type === "brief" ? "Status Brief" : "Sprint Insights";
  const description =
    type === "brief"
      ? "A concise narrative summarising sprint progress and any risk signals worth noting."
      : "A content-focused analysis: what the sprint is delivering, why it matters, and what to watch.";
  const Icon = type === "brief" ? Sparkles : BookOpen;

  return (
    <div className="rounded-xl border border-border-default bg-overlay-subtle px-4 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <Icon size={13} strokeWidth={1.5} className="text-[var(--color-brand-400)]/50 shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-brand-400)]/50">
          AI {label}
        </span>
      </div>
      <p className="text-xs text-text-tertiary leading-relaxed">{description}</p>
      <button
        type="button"
        onClick={onGenerate}
        disabled={disabled}
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs bg-overlay-default text-text-secondary cursor-pointer hover:bg-overlay-strong hover:text-text-secondary transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
      >
        <Icon size={11} strokeWidth={1.5} />
        Generate {label}
      </button>
    </div>
  );
}

function StakeholderView() {
  const { data: sprints } = useJiraSprints();
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

  // Per-type dismissed state (local UI only — resets on sprint change)
  const [dismissed, setDismissed] = useState<Record<AnalysisType, boolean>>({
    brief: false,
    "deep-dive": false,
  });

  // AI analysis drawer
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [drawerWidth, setDrawerWidth] = useLocalStorage<number>("bridge:ai-drawer-width", 520);
  const drawerRef = useRef<HTMLDivElement>(null);
  const resizeState = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!resizeState.current || !drawerRef.current) return;
      const delta = resizeState.current.startX - e.clientX;
      const newWidth = Math.max(340, Math.min(900, resizeState.current.startWidth + delta));
      drawerRef.current.style.width = `${newWidth}px`;
    }
    function onMouseUp(e: MouseEvent) {
      if (!resizeState.current) return;
      const delta = resizeState.current.startX - e.clientX;
      const newWidth = Math.max(340, Math.min(900, resizeState.current.startWidth + delta));
      setDrawerWidth(newWidth);
      resizeState.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [setDrawerWidth]);

  function onResizeHandleMouseDown(e: React.MouseEvent) {
    if (!drawerRef.current) return;
    resizeState.current = {
      startX: e.clientX,
      startWidth: drawerRef.current.offsetWidth,
    };
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  }

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

  // Reset dismissed state on sprint change
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

  // Current snapshot values for staleness detection
  const currentDonePoints = useMemo(
    () => doneTickets.reduce((s, t) => s + (t.storyPoints ?? 0), 0),
    [doneTickets],
  );
  const currentTodoCount = todoTickets.length;

  // Sprint health for inline header badge (active sprints only)
  const sprintHealth = useMemo(() => {
    if (!stakeholderSprint || stakeholderSprint.state !== "active") return null;
    const allActive = [...doneTickets, ...inReviewTickets, ...inProgressTickets, ...todoTickets];
    return computeSprintHealthFromData(doneTickets, allActive, stakeholderSprint);
  }, [stakeholderSprint, doneTickets, inReviewTickets, inProgressTickets, todoTickets]);

  // Persistent analysis hook
  const analysis = useStakeholderAnalysis(currentSprint?.id ?? null);

  async function handleSyncSprint() {
    if (!currentSprint || isSyncing) return;
    setIsSyncing(true);
    setSyncStatus("syncing");
    if (syncStatusTimerRef.current) clearTimeout(syncStatusTimerRef.current);
    try {
      // Sync sprint metadata (active+future AND history) and current sprint tickets
      await Promise.all([
        apiFetch("/api/jira/sync-sprints", { method: "POST" }),
        apiFetch("/api/jira/sync-sprints?scope=history", { method: "POST" }),
        apiFetch(`/api/jira/sync-tickets?sprintId=${currentSprint.id}`, { method: "POST" }),
      ]);

      // Fetch fresh sprint list (states are now up-to-date) for backfill check
      type FreshSprint = { id: number; name: string; state: string };
      const freshSprints = await apiFetch<FreshSprint[]>("/api/jira/sprints");
      const freshTeamClosed = freshSprints.filter(
        (s) => extractTeamPrefix(s.name) === selectedTeamPrefix && s.state === "closed",
      );

      // Backfill closed sprints missing from velocity data
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
      // Refresh sprint metadata so closed states are up-to-date
      await apiFetch("/api/jira/sync-sprints?scope=history", { method: "POST" });

      type FreshSprint = { id: number; name: string; state: string };
      const freshSprints = await apiFetch<FreshSprint[]>("/api/jira/sprints");
      const closedSprints = freshSprints
        .filter((s) => extractTeamPrefix(s.name) === selectedTeamPrefix && s.state === "closed")
        .sort((a, b) => extractSprintNumber(a.name) - extractSprintNumber(b.name));

      // Only sync sprints that are missing from velocity data
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

  // Runs the analysis — does not open the drawer (caller decides)
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

  // Parse stored risks for display
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

            {/* AI analysis buttons */}
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

            {/* Sync status indicator */}
            {syncStatus !== "idle" && (
              <div className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-opacity duration-300 ${
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

            {/* Overflow menu: sync, compare, copy */}
            <OverflowMenu
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

        {/* Team selector */}
        {availableTeams.length > 1 && selectedTeamPrefix && (
          <>
            <ViewHeaderDivider />
            <div className="flex items-center gap-1.5">
              <label htmlFor="team-select" className="text-xs text-text-tertiary">
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

        {/* Sprint navigation */}
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
            {/* Sprint heading + health + goal + sparkline */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                Sprint overview
              </p>
              {!isCompareMode && (
                <>
                  {/* Title row: name + health + sparkline — natural flow, no justify-between */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-text-primary leading-none">
                      {stakeholderSprint.name}
                    </h1>
                    {sprintHealth && (
                      <SprintHealthBanner
                        sprint={stakeholderSprint}
                        doneTickets={doneTickets}
                        inProgressTickets={[...inReviewTickets, ...inProgressTickets]}
                        todoTickets={todoTickets}
                        compact
                      />
                    )}
                    <VelocitySparkline
                      data={velocityData ?? []}
                      isLoading={isVelocityLoading}
                    />
                  </div>

                  {/* Sprint goal */}
                  {stakeholderSprint.goal && (
                    <p className="max-w-2xl text-sm italic text-text-tertiary border-l-2 border-[var(--color-brand-400)]/25 pl-3">
                      {stakeholderSprint.goal}
                    </p>
                  )}
                </>
              )}
              {isCompareMode && (
                <VelocitySparkline
                  data={velocityData ?? []}
                  isLoading={isVelocityLoading}
                />
              )}
            </div>

            {isCompareMode && prevStakeholderSprint ? (
              <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
                <div className="space-y-6 overflow-auto">
                  <h2 className="text-lg font-semibold tracking-tight text-text-secondary">
                    {prevStakeholderSprint.name}
                    <span className="ml-2 text-xs font-normal text-text-muted">Previous</span>
                  </h2>
                  {isPrevLoading ? (
                    <LoadingState label="Loading previous sprint..." variant="spinner" />
                  ) : (
                    <SprintOverviewCard
                      sprint={prevStakeholderSprint}
                      doneTickets={prevDoneTickets}
                      inReviewTickets={prevInReviewTickets}
                      inProgressTickets={prevInProgressTickets}
                      todoTickets={prevTodoTickets}
                      deprecatedTickets={prevDeprecatedTickets}
                    />
                  )}
                </div>
                <div className="space-y-6 overflow-auto">
                  <h2 className="text-lg font-semibold tracking-tight text-text-primary">
                    {stakeholderSprint.name}
                    <span className="ml-2 text-xs font-normal text-text-muted">Current</span>
                  </h2>
                  {isCarryOverLoading && (
                    <p className="flex items-center gap-1.5 text-xs text-text-muted">
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
                    inReviewTickets={inReviewTickets}
                    inProgressTickets={inProgressTickets}
                    todoTickets={todoTickets}
                    deprecatedTickets={deprecatedTickets}
                    carriedKeys={carriedKeys.size > 0 ? carriedKeys : undefined}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Carry-over summary */}
                {isCarryOverLoading && previousSprint && (
                  <p className="flex items-center gap-1.5 text-xs text-text-muted">
                    <RefreshCw size={10} strokeWidth={1.5} className="animate-spin" />
                    Loading carry-over data...
                  </p>
                )}
                {!isCarryOverLoading && carriedKeys.size > 0 && previousSprint && (
                  <p className="text-xs text-[var(--color-warning-400)]/60">
                    {carriedKeys.size} ticket{carriedKeys.size === 1 ? "" : "s"} carried from {previousSprint.name}
                  </p>
                )}
                <SprintOverviewCard
                  sprint={stakeholderSprint}
                  doneTickets={doneTickets}
                  inReviewTickets={inReviewTickets}
                  inProgressTickets={inProgressTickets}
                  todoTickets={todoTickets}
                  deprecatedTickets={deprecatedTickets}
                  carriedKeys={carriedKeys.size > 0 ? carriedKeys : undefined}
                  previousTickets={prevAllTickets.length > 0 ? prevAllTickets : undefined}
                  showHealthBanner={false}
                  showGoal={false}
                />
              </div>
            )}

            <p className="text-xs text-text-muted">Last updated: {lastUpdatedDisplay}</p>
          </div>
        )}
      </div>

      {/* AI analysis drawer — portaled so overlay covers sidebar */}
      {aiDrawerOpen && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[200] bg-black/30"
            onClick={() => setAiDrawerOpen(false)}
            aria-hidden
          />
          {/* Panel */}
          <div
            ref={drawerRef}
            className="fixed right-0 top-0 bottom-0 z-[201] flex flex-col border-l border-border-default bg-[var(--color-surface-elevated)]"
            style={{ width: drawerWidth, maxWidth: "90vw", boxShadow: "-8px 0 32px rgba(0,0,0,0.5)" }}
          >
            {/* Resize handle — drag left edge to resize */}
            <div
              onMouseDown={onResizeHandleMouseDown}
              className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-[var(--color-brand-400)]/20 transition-colors duration-150"
              aria-hidden
            />

            {/* Drawer header */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-default px-5 py-3.5">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-text-tertiary">
                AI Analysis
              </span>
              <button
                type="button"
                onClick={() => setAiDrawerOpen(false)}
                aria-label="Close AI analysis"
                className="rounded p-1 text-text-muted cursor-pointer hover:bg-overlay-default hover:text-text-secondary transition-colors duration-150"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>

            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
              {/* Brief panel or generate prompt */}
              {!dismissed.brief && (() => {
                const briefVisible = briefLive.status !== "idle" || !!(analysis.brief?.narrative || analysis.brief?.content);
                return briefVisible ? (
                  <AiInsightsPanel
                    type="brief"
                    live={briefLive}
                    narrative={analysis.brief?.narrative ?? null}
                    risks={storedBriefRisks}
                    content={analysis.brief?.content ?? null}
                    generatedAt={analysis.brief?.completedAt ?? null}
                    isStale={analysis.isStale(analysis.brief, currentDonePoints, currentTodoCount)}
                    onDismiss={() => setDismissed((d) => ({ ...d, brief: true }))}
                    onRetry={() => triggerGenerate("brief")}
                    defaultCollapsed={false}
                    inDrawer
                  />
                ) : (
                  <GeneratePrompt type="brief" disabled={anyRunning} onGenerate={() => triggerGenerate("brief")} />
                );
              })()}

              {/* Divider between sections when both are visible */}
              {!dismissed.brief && !dismissed["deep-dive"] && (
                <div className="h-px bg-overlay-default" />
              )}

              {/* Deep Dive panel or generate prompt */}
              {!dismissed["deep-dive"] && (() => {
                const deepDiveVisible = deepDiveLive.status !== "idle" || !!analysis.deepDive?.content;
                return deepDiveVisible ? (
                  <AiInsightsPanel
                    type="deep-dive"
                    live={deepDiveLive}
                    narrative={null}
                    risks={[]}
                    content={analysis.deepDive?.content ?? null}
                    generatedAt={analysis.deepDive?.completedAt ?? null}
                    isStale={analysis.isStale(analysis.deepDive, currentDonePoints, currentTodoCount)}
                    onDismiss={() => setDismissed((d) => ({ ...d, "deep-dive": true }))}
                    onRetry={() => triggerGenerate("deep-dive")}
                    defaultCollapsed={false}
                    inDrawer
                  />
                ) : (
                  <GeneratePrompt type="deep-dive" disabled={anyRunning} onGenerate={() => triggerGenerate("deep-dive")} />
                );
              })()}
            </div>
          </div>
        </>,
        document.body,
      )}
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
