"use client";

import { useState, useEffect, useCallback, useMemo, useRef, use } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import Link from "next/link";
import {
  type Ticket,
  type TicketDetail,
} from "@/types/ticket";
import {
  CloudDownload,
  CloudUpload,
  Copy,
  Flag,
  Loader2,
  AlertTriangle,
  MoreHorizontal,
  NotebookPen,
  Zap,
  IterationCw,
  Trash2,
  Star,
  Check,
  PanelRightClose,
} from "lucide-react";
import { useTicketDetail, useJiraSprints, useTicketReviews, useActiveWriterSessions, useTicketVersionCount } from "@/hooks/useSprintBoard";
import { useFollowedTickets, useFollowTicket } from "@/hooks/usePipelines";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { Tooltip } from "@/components/shared/Tooltip";
import { ViewHeader, ViewHeaderDivider } from "@/components/shared/ViewHeader";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { EditableTitle } from "@/components/ticket-detail/EditableTitle";
import { EditableDescription } from "@/components/ticket-detail/EditableDescription";
import { AttachmentsSection } from "@/components/ticket-detail/AttachmentsSection";
import { SubtasksSection } from "@/components/ticket-detail/SubtasksSection";
import { LinkedIssuesSection } from "@/components/ticket-detail/LinkedIssuesSection";
import { EpicChildrenSection } from "@/components/ticket-detail/EpicChildrenSection";
import { CommentsSection } from "@/components/ticket-detail/CommentsSection";
import { TicketSidebar, SIDEBAR_COLLAPSED_KEY } from "@/components/ticket-detail/TicketSidebar";
import dynamic from "next/dynamic";

function TabLoadingFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} strokeWidth={1.5} className="animate-spin text-text-muted" />
    </div>
  );
}

const TicketHistory = dynamic(
  () => import("@/components/ticket-detail/TicketHistory").then((m) => ({ default: m.TicketHistory })),
  { loading: TabLoadingFallback },
);
const TicketReview = dynamic(
  () => import("@/components/ticket-detail/TicketReview").then((m) => ({ default: m.TicketReview })),
  { loading: TabLoadingFallback },
);
const TicketRefinement = dynamic(
  () => import("@/components/ticket-detail/TicketRefinement").then((m) => ({ default: m.TicketRefinement })),
  { loading: TabLoadingFallback },
);
const TicketDevelopment = dynamic(
  () => import("@/components/ticket-detail/TicketDevelopment").then((m) => ({ default: m.TicketDevelopment })),
  { loading: TabLoadingFallback },
);
import { SearchModal } from "@/components/sprint-board/SearchModal";
import { Tab } from "@/components/shared/TabBar";
import { Button } from "@/components/ui/Button";
import { Popover } from "@/components/shared/Popover";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { getJiraUrl } from "@/components/sprint-board/TicketTableCells";
import { apiFetch, jira, tickets } from "@/lib/api-client";
import { useLocalStorage } from "@/hooks/useLocalStorage";


export default function TicketDetailPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = use(params);

  const { data: apiData, isLoading: ticketLoading, mutate: mutateTicket } = useTicketDetail(key);
  const pageTitle = usePageTitle(apiData ? `${key} - ${apiData.title}` : key);

  const ticket: Ticket | undefined = useMemo(() => apiData ? {
    key: apiData.key,
    title: apiData.title,
    type: apiData.type,
    epic: apiData.epic ?? null,
    epicKey: apiData.epicKey ?? null,
    jiraStatus: apiData.jiraStatus,
    storyPoints: apiData.storyPoints ?? null,
    assignee: apiData.assignee ?? null,
    flagged: apiData.flagged ?? false,
    readiness: apiData.readiness ?? null,
    poStatus: apiData.poStatus ?? null,
    qualityScore: apiData.qualityScore ?? null,
    editState: apiData.editState ?? "clean",
    notes: apiData.notes ?? "",
    sprintId: apiData.sprintId,
    businessValue: apiData.businessValue ?? null,
    removedFromJiraAt: apiData.removedFromJiraAt ?? null,
  } : undefined, [apiData]);

  const detail: TicketDetail | undefined = apiData ? {
    description: apiData.description ?? "",
    reporter: apiData.reporter ?? null,
    parent: apiData.parent ?? null,
    labels: apiData.labels ?? [],
    components: apiData.components ?? [],
    priority: apiData.priority ?? "Medium",
    createdAt: apiData.createdAt ?? "",
    updatedAt: apiData.updatedAt ?? "",
    attachments: apiData.attachments ?? [],
    subtasks: apiData.subtasks ?? [],
    linkedIssues: apiData.linkedIssues ?? [],
    jiraComments: apiData.jiraComments ?? [],
    epicChildren: apiData.epicChildren ?? [],
  } : undefined;

  // Local edits are now included in the API response to avoid flicker
  const localEdits: Record<string, { value: string; isDraft: boolean }> | undefined = (apiData as Record<string, unknown> | undefined)?.localEdits as Record<string, { value: string; isDraft: boolean }> | undefined;

  // Auto-fetch from Jira when ticket is not in local DB
  const [jiraCheckState, setJiraCheckState] = useState<"idle" | "checking" | "not-found">("idle");
  const jiraCheckStarted = useRef(false);
  useEffect(() => {
    if (ticketLoading || apiData || jiraCheckStarted.current) return;
    jiraCheckStarted.current = true;
    setJiraCheckState("checking");
    let cancelled = false;
    async function tryFetchFromJira() {
      const abortCtrl = new AbortController();
      const timer = setTimeout(() => abortCtrl.abort(), 10_000);
      try {
        const data = await jira.syncTickets({ ticketKeys: [key] }, abortCtrl.signal) as { count?: number };
        clearTimeout(timer);
        if (cancelled) return;
        if ((data.count ?? 0) > 0) {
          await mutateTicket();
          return;
        }
        setJiraCheckState("not-found");
      } catch {
        clearTimeout(timer);
        if (!cancelled) setJiraCheckState("not-found");
      }
    }
    tryFetchFromJira();
    return () => { cancelled = true; };
  }, [ticketLoading, apiData, key, mutateTicket]);

  const { data: followedTickets } = useFollowedTickets();
  const { follow, unfollow } = useFollowTicket();
  const isFollowed = followedTickets?.includes(key) ?? false;

  const [hasLocalTitleEdit, setHasLocalTitleEdit] = useState(false);
  const [hasLocalDescEdit, setHasLocalDescEdit] = useState(false);
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [isDescEditing, setIsDescEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<"content" | "history" | "review" | "refinement" | "development">("content");
  const [showConflictDiff, setShowConflictDiff] = useState(false);
  const [metadataOnlyConflict, setMetadataOnlyConflict] = useState(false);
  const [historyResetKey, setHistoryResetKey] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);
  const linkCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTypeChange = useCallback(async (newType: import("@/types/ticket").IssueType) => {
    await apiFetch(`/api/tickets/${encodeURIComponent(key)}`, {
      method: "PATCH",
      body: { type: newType },
    });
    mutateTicket();
  }, [key, mutateTicket]);

  const handleCopyLink = useCallback(async () => {
    if (!ticket) return;
    const url = getJiraUrl(key);
    const text = `${ticket.title} - ${url}`;
    try {
      await navigator.clipboard.writeText(text);
      setLinkCopied(true);
      if (linkCopyTimer.current) clearTimeout(linkCopyTimer.current);
      linkCopyTimer.current = setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      console.warn("Clipboard write failed");
    }
  }, [ticket, key]);

  const { data: reviewData } = useTicketReviews(key);
  const reviewCount = reviewData?.reviews?.length ?? 0;

  const { data: versionMeta } = useTicketVersionCount(key);
  const versionCount = versionMeta?.length ?? 0;

  const { data: activeSessions, mutate: mutateActiveSessions } = useActiveWriterSessions();
  const hasActiveSession = activeSessions?.some((s) => s.ticketKey === key) ?? false;

  const [isDeletingSession, setIsDeletingSession] = useState(false);

  const handleDeleteSession = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDeletingSession(true);
    try {
      // Optimistically remove from UI immediately
      await mutateActiveSessions(
        (current) => current?.filter((s) => s.ticketKey !== key) ?? [],
        { revalidate: false },
      );
      await apiFetch(`/api/tickets/${key}/story-writer?deleteConversation=true`, { method: "DELETE" });
      await mutateActiveSessions();
    } catch (err) {
      console.error("Failed to delete session:", err);
      await mutateActiveSessions();
    } finally {
      setIsDeletingSession(false);
    }
  }, [key, mutateActiveSessions]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage(SIDEBAR_COLLAPSED_KEY, false);

  const [isPushing, setIsPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const [draftDiscardKey, setDraftDiscardKey] = useState(0);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [showFlagDialog, setShowFlagDialog] = useState(false);
  const [flagReasonInput, setFlagReasonInput] = useState("");
  const [flagOverride, setFlagOverride] = useState<boolean | null>(null);
  const isFlagged = flagOverride ?? ticket?.flagged ?? false;


  const handleTitleLocalEdit = useCallback((has: boolean) => setHasLocalTitleEdit(has), []);
  const handleDescLocalEdit = useCallback((has: boolean) => setHasLocalDescEdit(has), []);

  const handleReadinessChange = useCallback(async (v: import("@/types/ticket").TicketReadiness | null) => {
    mutateTicket((prev) => prev ? { ...prev, readiness: v } : prev, { revalidate: false });
    try {
      await apiFetch(`/api/tickets/${key}/metadata`, { method: "PUT", body: { readiness: v } });
    } catch {
      mutateTicket();
    }
  }, [key, mutateTicket]);

  const handleJiraStatusChange = useCallback(async (status: import("@/types/ticket").JiraStatus) => {
    mutateTicket((prev) => prev ? { ...prev, jiraStatus: status } : prev, { revalidate: false });
    try {
      await apiFetch(`/api/tickets/${key}/status`, { method: "PUT", body: { status } });
    } catch {
      mutateTicket();
    }
  }, [key, mutateTicket]);

  const showConflictWarning = ticket?.editState === "conflict";

  const handleRemoteChanged = useCallback((contentChanged: boolean) => {
    setActiveTab("history");
    setShowConflictDiff(true);
    setMetadataOnlyConflict(!contentChanged);
    mutateTicket();
  }, [mutateTicket]);

  const handleDiscardDraft = useCallback(async () => {
    try {
      await apiFetch(`/api/tickets/${key}/local-edits`, { method: "DELETE" });
      setHasLocalTitleEdit(false);
      setHasLocalDescEdit(false);
      setPushError(null);
      setOverrideConfirmed(false);
      // Await fresh data before remounting so editables initialize without stale localEdits
      await mutateTicket();
      setDraftDiscardKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to discard draft:", err);
    }
  }, [key, mutateTicket]);

  const handlePushToJira = useCallback(async () => {
    setIsPushing(true);
    setPushError(null);
    try {
      const data = await tickets.pushToJira(key) as { conflict?: boolean; contentChanged?: boolean; success?: boolean; error?: string };
      if (data.conflict) {
        handleRemoteChanged(data.contentChanged ?? true);
      } else if (data.success) {
        setHasLocalTitleEdit(false);
        setHasLocalDescEdit(false);
        setOverrideConfirmed(false);
        // Await fresh data before remounting so editables initialize without stale localEdits
        await mutateTicket();
        setDraftDiscardKey((k) => k + 1);
      } else {
        setPushError(data.error ?? "Push failed");
      }
    } catch {
      setPushError("Failed to push to Jira");
    } finally {
      setIsPushing(false);
    }
  }, [key, handleRemoteChanged, mutateTicket]);

  const handleRefreshFromJira = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await jira.syncTickets({ ticketKeys: [key] });
      await mutateTicket();
    } catch (err) {
      console.error("Failed to refresh from Jira:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [key, mutateTicket]);

  const handleFlag = useCallback(async () => {
    const reason = flagReasonInput.trim();
    setFlagOverride(true);
    setShowFlagDialog(false);
    setFlagReasonInput("");
    try {
      await tickets.toggleFlag(key, true, reason || undefined);
      await mutateTicket();
      setFlagOverride(null);
    } catch (err) {
      console.error("Operation failed:", err);
      setFlagOverride(null);
    }
  }, [key, flagReasonInput, mutateTicket]);

  const handleUnflag = useCallback(async () => {
    setFlagOverride(false);
    try {
      await tickets.toggleFlag(key, false);
      await mutateTicket();
      setFlagOverride(null);
    } catch (err) {
      console.error("Operation failed:", err);
      setFlagOverride(null);
    }
  }, [key, mutateTicket]);

  const { data: rawSprints } = useJiraSprints();
  const ticketSprintId = ticket?.sprintId ?? null;
  const ticketSprintLabel = rawSprints?.find((s) => String(s.id) === ticketSprintId)?.name ?? ticketSprintId;

  if (ticketLoading) {
    return (
      <>
        {pageTitle}
        <div className="flex h-full flex-col">
          <ViewHeader>
            <div className="h-5 w-16 animate-pulse rounded bg-overlay-strong" />
            <ViewHeaderDivider />
            <div className="h-5 w-48 animate-pulse rounded bg-overlay-strong" />
          </ViewHeader>

          <div className="flex flex-1 overflow-hidden">
            <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
              <div className="border-b border-border-default">
                <div className="mx-auto flex h-[44px] max-w-4xl items-center gap-4 px-8">
                  {["w-16", "w-14", "w-14", "w-20", "w-24"].map((w, i) => (
                    <div key={i} className={`h-3.5 ${w} animate-pulse rounded bg-overlay-strong`} />
                  ))}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-4xl px-8 py-6">
                  <div className="mt-3 space-y-3">
                    <div className="h-7 w-3/4 animate-pulse rounded bg-overlay-strong" />
                    <div className="h-4 w-1/3 animate-pulse rounded bg-overlay-default" />
                  </div>
                  <div className="mt-8 space-y-2.5">
                    <div className="h-3.5 w-full animate-pulse rounded bg-overlay-default" />
                    <div className="h-3.5 w-5/6 animate-pulse rounded bg-overlay-default" />
                    <div className="h-3.5 w-4/6 animate-pulse rounded bg-overlay-default" />
                    <div className="h-3.5 w-full animate-pulse rounded bg-overlay-default" />
                    <div className="h-3.5 w-2/3 animate-pulse rounded bg-overlay-default" />
                  </div>
                </div>
              </div>
            </div>
            <div className="w-[320px] shrink-0 border-l border-border-default bg-[var(--color-surface-chrome)]">
              <div className="p-5 space-y-5">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-3 w-16 animate-pulse rounded bg-overlay-strong" />
                    <div className="h-4 w-24 animate-pulse rounded bg-overlay-default" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!ticket) {
    if (jiraCheckState === "idle" || jiraCheckState === "checking") {
      return (
        <>
          {pageTitle}
          <div className="flex h-full flex-col">
            <ViewHeader>
              <div className="h-5 w-16 animate-pulse rounded bg-overlay-strong" />
              <ViewHeaderDivider />
              <div className="h-5 w-48 animate-pulse rounded bg-overlay-strong" />
            </ViewHeader>

            <div className="flex flex-1 overflow-hidden">
              <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
                <div className="border-b border-border-default">
                  <div className="mx-auto flex h-[44px] max-w-4xl items-center gap-4 px-8">
                    {["w-16", "w-14", "w-14", "w-20", "w-24"].map((w, i) => (
                      <div key={i} className={`h-3.5 ${w} animate-pulse rounded bg-overlay-strong`} />
                    ))}
                  </div>
                </div>
                <div className="flex-1 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 size={32} strokeWidth={2} className="animate-spin text-text-muted" />
                    <span className="text-sm text-text-tertiary">Checking Jira...</span>
                  </div>
                </div>
              </div>
              <div className="w-[320px] shrink-0 border-l border-border-default bg-[var(--color-surface-chrome)]" />
            </div>
          </div>
        </>
      );
    }
    return (
      <>
        {pageTitle}
        <div className="flex h-full flex-col">
          <ViewHeader>
            <span className="text-sm font-medium text-text-tertiary">{key}</span>
          </ViewHeader>

          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <h1 className="font-[var(--font-display)] text-2xl font-semibold text-text-primary">Ticket not found</h1>
              <p className="mt-2 text-sm text-text-tertiary">No ticket with key &quot;{key}&quot; exists in Jira or the local data.</p>
              <Link
                href="/sprint-board"
                className="mt-4 inline-block rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white cursor-pointer hover:bg-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98]"
              >
                Back to Sprint Board
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  const hasLocalEdits = hasLocalTitleEdit || hasLocalDescEdit;
  const isEditing = isTitleEditing || isDescEditing;
  const isDraftOnly = ticket?.editState === "draft";
  const showPushButton = hasLocalEdits && !showConflictWarning && !isEditing && !isDraftOnly;

  return (
    <>
      {pageTitle}
      <ErrorBoundary>
    <div className="flex h-full flex-col">

      <ViewHeader
        actions={
          <div className="flex shrink-0 items-center gap-2">
            {((ticketSprintId && ticket.type !== "epic") || ticket.epic || ticket.type === "epic") && (
              <nav className="hidden lg:flex shrink-0 items-center gap-1.5">
                {ticket.type === "epic" && (
                  <span
                    className="flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
                    style={{ backgroundColor: "rgba(155,108,212,0.12)", color: "#9b6cd4", border: "1px solid rgba(155,108,212,0.25)" }}
                  >
                    <Zap size={11} strokeWidth={2} />
                    Epic
                  </span>
                )}
                {ticketSprintId && ticket.type !== "epic" && (
                  <Tooltip content={ticketSprintLabel || "Sprint"}>
                    <Link
                      href={`/sprint-board?sprint=${encodeURIComponent(ticketSprintId)}`}
                      className="flex items-center gap-1.5 rounded-md bg-overlay-default px-2 py-0.5 text-label font-medium text-text-tertiary cursor-pointer hover:bg-overlay-strong hover:text-text-secondary transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                    >
                      <IterationCw size={12} strokeWidth={1.5} />
                      <span className="max-w-[110px] truncate">{ticketSprintLabel}</span>
                    </Link>
                  </Tooltip>
                )}
                {ticket.epic && (
                  <Tooltip content={ticket.epic}>
                    {ticket.epicKey ? (
                      <Link
                        href={`/tickets/${ticket.epicKey}`}
                        className="flex items-center gap-1.5 rounded-md bg-overlay-default px-2 py-0.5 text-label font-medium text-text-tertiary cursor-pointer hover:bg-overlay-strong hover:text-text-secondary transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                      >
                        <Zap size={12} strokeWidth={1.5} />
                        <span className="max-w-[120px] truncate">{ticket.epic}</span>
                      </Link>
                    ) : (
                      <span className="flex items-center gap-1.5 rounded-md bg-overlay-default px-2 py-0.5 text-label font-medium text-text-tertiary">
                        <Zap size={12} strokeWidth={1.5} />
                        <span className="max-w-[120px] truncate">{ticket.epic}</span>
                      </span>
                    )}
                  </Tooltip>
                )}
              </nav>
            )}
            {isFlagged && (
              <Tooltip content="Click to scroll to flag comment">
                <button
                  onClick={() => {
                    const flagComment = detail?.jiraComments
                      ?.slice().reverse()
                      .find((c) => /flag_on|Flag added/i.test(c.content));
                    if (flagComment) {
                      const el = document.getElementById(`jira-comment-${flagComment.id}`);
                      if (el) {
                        el.scrollIntoView({ behavior: "smooth", block: "center" });
                        el.classList.add("ring-2", "ring-[#e5534b]/40");
                        setTimeout(() => el.classList.remove("ring-2", "ring-[#e5534b]/40"), 2000);
                      }
                    }
                  }}
                  className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[#e5534b]/25 bg-[#e5534b]/10 px-2 py-0.5 text-[11px] font-semibold text-[#e5534b] hover:bg-[#e5534b]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e5534b]/40 active:scale-[0.97]"
                  style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
                >
                  <Flag size={11} strokeWidth={1.5} fill="#e5534b" />
                  Flagged
                </button>
              </Tooltip>
            )}
            {((ticketSprintId && ticket.type !== "epic") || ticket.epic || ticket.type === "epic" || isFlagged) && (
              <div className="h-5 w-px shrink-0 bg-overlay-default" />
            )}
            {showPushButton && (
              <Button
                variant="primary"
                size="md"
                onClick={handlePushToJira}
                disabled={isPushing}
                title="Push local edits to Jira"
                icon={isPushing
                  ? <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />
                  : <CloudUpload size={13} strokeWidth={1.5} />
                }
              >
                Push to Jira
              </Button>
            )}
            <Tooltip
              content={isFollowed
                ? "Following this ticket. You will receive PR, pipeline, deployment, and story writer notifications for it. Click to unfollow."
                : "Follow this ticket to receive notifications about PRs, pipelines, deployments, and story writer updates."
              }
            >
              <Button
                variant="ghost"
                size="md"
                iconOnly
                onClick={() => isFollowed ? unfollow(key) : follow(key)}
                aria-label={isFollowed ? "Unfollow ticket" : "Follow ticket"}
                icon={
                  <Star
                    size={14}
                    strokeWidth={1.5}
                    className={isFollowed ? "text-amber-400 fill-amber-400" : ""}
                  />
                }
              />
            </Tooltip>
            <div className="relative">
              <Button
                variant="ghost"
                size="md"
                iconOnly
                onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                title="More actions"
                aria-label="More actions"
                icon={isRefreshing
                  ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
                  : <MoreHorizontal size={14} strokeWidth={1.5} />
                }
              />
              <Popover open={moreMenuOpen} onClose={() => setMoreMenuOpen(false)} align="right">
                <div className="min-w-[220px] py-1">
                  <button
                    onClick={() => { setMoreMenuOpen(false); handleCopyLink(); }}
                    className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:bg-overlay-default active:bg-overlay-strong"
                    style={{ transition: "background-color 0.1s ease" }}
                  >
                    {linkCopied
                      ? <Check size={13} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
                      : <Copy size={13} strokeWidth={1.5} className="text-text-muted" />
                    }
                    {linkCopied ? "Copied!" : "Copy title and Jira link"}
                  </button>
                  <button
                    onClick={() => { setMoreMenuOpen(false); handleRefreshFromJira(); }}
                    disabled={isRefreshing}
                    className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:bg-overlay-default active:bg-overlay-strong disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ transition: "background-color 0.1s ease" }}
                  >
                    <CloudDownload size={13} strokeWidth={1.5} className="text-text-muted" />
                    Pull from Jira
                  </button>
                  {!isFlagged ? (
                    <button
                      onClick={() => { setMoreMenuOpen(false); setShowFlagDialog(true); }}
                      className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:bg-overlay-default active:bg-overlay-strong"
                      style={{ transition: "background-color 0.1s ease" }}
                    >
                      <Flag size={13} strokeWidth={1.5} className="text-text-muted" />
                      Flag this ticket
                    </button>
                  ) : (
                    <button
                      onClick={() => { setMoreMenuOpen(false); handleUnflag(); }}
                      className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:bg-overlay-default active:bg-overlay-strong"
                      style={{ transition: "background-color 0.1s ease" }}
                    >
                      <Flag size={13} strokeWidth={1.5} className="text-[#e5534b]" fill="#e5534b" />
                      Remove flag
                    </button>
                  )}
                </div>
              </Popover>
            </div>
            {hasActiveSession ? (
              <div
                className="group/session flex h-7 items-center rounded-md border border-[var(--color-brand-500)]/40 bg-[var(--color-brand-500)]/15 shadow-[0_2px_8px_rgba(46,145,73,0.12)]"
                style={{ transition: "border-color 0.15s ease" }}
              >
                <Link
                  href={`/tickets/${key}/write`}
                  className="flex h-7 items-center gap-1.5 rounded-l-md px-2.5 text-xs font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-[var(--color-brand-500)]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98]"
                  style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
                >
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-brand-400)] opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-brand-500)]" />
                  </span>
                  Resume session
                </Link>
                <div className="h-4 w-px bg-[var(--color-brand-500)]/25" />
                <Button
                  variant="ghost"
                  size="md"
                  iconOnly
                  onClick={handleDeleteSession}
                  disabled={isDeletingSession}
                  className="!rounded-l-none !rounded-r-md !border-0 !bg-transparent !text-[var(--color-brand-400)]/35 hover:!bg-transparent hover:!text-red-400/80"
                  title="Delete session"
                  aria-label="Delete session"
                  icon={isDeletingSession
                    ? <Loader2 size={11} strokeWidth={1.5} className="animate-spin" />
                    : <Trash2 size={11} strokeWidth={1.5} />
                  }
                />
              </div>
            ) : (
              <Link
                href={`/tickets/${key}/write`}
                className="flex h-7 items-center gap-1.5 rounded-md border border-[var(--color-brand-500)]/25 bg-[var(--color-brand-500)]/10 px-2.5 text-xs font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-[var(--color-brand-500)]/20 hover:border-[var(--color-brand-500)]/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] shadow-[0_2px_8px_rgba(46,145,73,0.12)]"
                style={{ transition: "background-color 0.15s ease, border-color 0.15s ease, transform 0.1s ease" }}
              >
                <NotebookPen size={13} strokeWidth={1.5} />
                Story writer
              </Link>
            )}
            {sidebarCollapsed && (
              <Button
                variant="ghost"
                size="md"
                iconOnly
                onClick={() => setSidebarCollapsed(false)}
                aria-label="Open sidebar"
                title="Open sidebar  [  "
                icon={<PanelRightClose size={14} strokeWidth={1.5} />}
              />
            )}
          </div>
        }
      >
        <TicketStatusPill
          ticketKey={key}
          jiraStatus={ticket.jiraStatus}
          readiness={ticket.removedFromJiraAt ? null : ticket.readiness}
          onJiraStatusChange={ticket.removedFromJiraAt ? undefined : handleJiraStatusChange}
          onReadinessChange={ticket.removedFromJiraAt ? undefined : handleReadinessChange}
          issueType={ticket.type}
          onIssueTypeChange={ticket.removedFromJiraAt ? undefined : handleTypeChange}
          title={ticket.title}
          size="lg"
          removedFromJira={Boolean(ticket.removedFromJiraAt)}
        />
        <ViewHeaderDivider />
        <span className="min-w-0 flex-1 truncate font-[var(--font-display)] text-heading-sm font-semibold tracking-tight text-text-primary">
          {ticket.title}
        </span>
      </ViewHeader>

      <div className="flex flex-1 overflow-hidden">
        <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
          {/* Tab bar - scoped to content column only, not spanning sidebar */}
          <div className="border-b border-border-default">
          <div className="mx-auto flex h-[44px] max-w-4xl items-stretch gap-1 px-8">
            {([
              { id: "content" as const, label: "Content", badge: undefined as number | undefined, badgeHighlight: false },
              { id: "history" as const, label: "History", badge: versionCount as number | undefined, badgeHighlight: false },
              { id: "review" as const, label: "Review", badge: (reviewCount || undefined) as number | undefined, badgeHighlight: (reviewCount ?? 0) > 0 },
              { id: "refinement" as const, label: "Refinement", badge: undefined as number | undefined, badgeHighlight: false },
              { id: "development" as const, label: "Development", badge: undefined as number | undefined, badgeHighlight: false },
            ]).map((tab) => (
              <Tab
                key={tab.id}
                active={activeTab === tab.id}
                onClick={() => {
                  if (tab.id === "history" && activeTab === "history") {
                    setHistoryResetKey((k) => k + 1);
                  }
                  setActiveTab(tab.id);
                }}
                label={tab.label}
                badge={tab.badge}
                badgeHighlight={tab.badgeHighlight}
              />
            ))}
          </div>
          </div>

          {/* Portal target: full-width editor toolbar mounts here when editing a description */}
          <div id="ticket-toolbar-portal" className="relative z-10 shrink-0" />

          <div className="flex flex-1 flex-col overflow-y-auto" style={{ overflowX: "hidden", scrollbarGutter: "stable" }}>
          <div className={`mx-auto w-full max-w-4xl px-8 ${activeTab === "history" ? "pt-6 pb-4" : "py-6"}`}>

          {/* Conflict warning: clickable, opens conflict diff */}
          {showConflictWarning && (
            <div className="mt-3 flex w-full items-start gap-2.5 rounded-lg border border-[#ea8744]/20 bg-[#ea8744]/[0.06] px-4 py-3">
              <AlertTriangle size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-[#ea8744]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#ea8744]">Conflict</p>
                <p className="mt-0.5 text-xs text-text-tertiary">
                  Jira was updated since your local edit. Click to review and resolve.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={handleDiscardDraft}
                  className="cursor-pointer rounded px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-overlay-default hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-strong"
                  style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
                >
                  Accept Jira version
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("history");
                    setShowConflictDiff(true);
                  }}
                  className="cursor-pointer rounded px-2.5 py-1 text-xs font-medium text-[#ea8744]/80 hover:bg-[#ea8744]/10 hover:text-[#ea8744] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ea8744]/50"
                  style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
                >
                  Review diff
                </button>
              </div>
            </div>
          )}

          {/* Header - content tab only */}
          {activeTab === "content" && (
          <div className={isDescEditing ? "hidden" : "mt-3"}>

            <div className="mt-3 flex items-start gap-2.5">
              <EditableTitle
                key={draftDiscardKey}
                ticketKey={key}
                initialTitle={ticket.title}
                serverLocalEdit={localEdits?.title}
                onLocalEdit={handleTitleLocalEdit}
                onEditingChange={setIsTitleEditing}
                onViewDiff={() => {
                  setActiveTab("history");
                  setShowConflictDiff(true);
                }}
              />
            </div>

            {/* Metadata strip */}
            {ticket.assignee && (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-text-tertiary">
                  <Avatar assignee={ticket.assignee} size={18} />
                  <span className="truncate">{ticket.assignee.name}</span>
                </span>
              </div>
            )}

          </div>
          )}

          {/* Flagged banner in main content */}
          {activeTab === "content" && isFlagged && (() => {
            const flagComment = detail?.jiraComments
              ?.slice().reverse()
              .find((c) => /flag_on|Flag added/i.test(c.content));
            const flagReason = flagComment?.content
              ?.replace(/^:?flag_on:?\s*Flag added\s*/i, "")
              ?.trim() || null;
            return (
              <div className="mt-4 rounded-lg border border-[#e5534b]/20 bg-[#e5534b]/[0.04] px-4 py-3">
                <div className="flex items-center gap-2">
                  <Flag size={14} strokeWidth={1.5} className="shrink-0 text-[#e5534b]" fill="#e5534b" />
                  <span className="text-sm font-semibold text-[#e5534b]">Flagged</span>
                  {flagComment && (
                    <span className="text-xs text-text-muted">
                      by {flagComment.authorName}, {new Date(flagComment.createdAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {flagReason && (
                  <div className="mt-2 text-sm leading-relaxed text-text-secondary">
                    {flagReason.split(/\n{2,}/).map((para, i) => {
                      const parts = para.split(/(\[.*?\]\(.*?\)|https?:\/\/\S+)/g);
                      const elements = parts.map((part, j) => {
                        const mdLink = part.match(/^\[(.*?)\]\((.*?)\)$/);
                        if (mdLink) return <a key={j} href={mdLink[2]} target="_blank" rel="noopener noreferrer" className="text-[var(--color-brand-400)] underline decoration-[var(--color-brand-400)]/30 hover:decoration-[var(--color-brand-400)]">{mdLink[1]}</a>;
                        if (/^https?:\/\/\S+$/.test(part)) return <a key={j} href={part} target="_blank" rel="noopener noreferrer" className="text-[var(--color-brand-400)] underline decoration-[var(--color-brand-400)]/30 hover:decoration-[var(--color-brand-400)] break-all">{part}</a>;
                        return part;
                      });
                      return <p key={i} className={i > 0 ? "mt-2" : ""}>{elements}</p>;
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {activeTab === "content" && (
            <>
              <EditableDescription
                key={draftDiscardKey}
                ticketKey={key}
                initialDescription={detail?.description ?? "No description available."}
                serverLocalEdit={localEdits?.description}
                attachments={detail?.attachments}
                onLocalEdit={handleDescLocalEdit}
                onEditingChange={setIsDescEditing}
                onDiscard={handleDiscardDraft}
                onPushToJira={handlePushToJira}
                isPushing={isPushing}
                pushError={pushError}
                showConflictWarning={showConflictWarning}
                overrideConfirmed={overrideConfirmed}
                onOverrideChange={setOverrideConfirmed}
                onViewDiff={() => {
                  setActiveTab("history");
                  setShowConflictDiff(true);
                }}
              />
              {detail && <AttachmentsSection attachments={detail.attachments} />}
              {ticket?.type === "epic"
                ? detail && <EpicChildrenSection items={detail.epicChildren} />
                : <>
                    {detail && <SubtasksSection subtasks={detail.subtasks} ticketKey={key} onMutate={() => mutateTicket()} />}
                    {detail && <LinkedIssuesSection issues={detail.linkedIssues} ticketKey={key} onMutate={() => mutateTicket()} />}
                  </>
              }
              <CommentsSection
                ticketKey={key}
                jiraComments={detail?.jiraComments ?? []}
              />
            </>
          )}

          {activeTab === "history" && (
            <TicketHistory
              ticket={ticket}
              showConflictDiff={showConflictDiff}
              metadataOnlyConflict={metadataOnlyConflict}
              resetKey={historyResetKey}
              onConflictResolved={async () => {
                setShowConflictDiff(false);
                setMetadataOnlyConflict(false);
                setHasLocalTitleEdit(false);
                setHasLocalDescEdit(false);
                await mutateTicket();
                setDraftDiscardKey((k) => k + 1);
                setActiveTab("content");
              }}
            />
          )}
          {activeTab === "review" && <TicketReview ticketKey={key} />}
          {activeTab === "refinement" && <TicketRefinement ticketKey={key} />}
          {activeTab === "development" && <TicketDevelopment ticketKey={key} />}

          {activeTab !== "history" && <div className="h-12" />}
        </div>
          <div id="diff-footer-portal" className="sticky bottom-0 z-10 mt-auto empty:hidden" />
          </div>
        </div>

      <div className="sticky top-0 min-h-full self-stretch overflow-visible">
        <TicketSidebar ticket={ticket} detail={detail} reviewData={reviewData} collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} onNavigateToReview={() => setActiveTab("review")} onNavigateToDev={() => setActiveTab("development")} onReadinessChange={handleReadinessChange} />
      </div>
      </div>
    </div>
    </ErrorBoundary>
    <SearchModal
      open={searchOpen}
      onClose={() => setSearchOpen(false)}
      onSelectTicket={() => {}}
    />
    <ConfirmDialog
      open={showFlagDialog}
      onClose={() => { setShowFlagDialog(false); setFlagReasonInput(""); }}
      title="Flag this ticket"
      description="Add an optional reason for flagging. This will be synced to Jira as a comment."
      confirmLabel="Flag"
      confirmVariant="destructive"
      onConfirm={handleFlag}
      extra={
        <textarea
          value={flagReasonInput}
          onChange={(e) => setFlagReasonInput(e.target.value)}
          placeholder="Reason (optional)..."
          rows={3}
          maxLength={2000}
          className="w-full resize-none rounded-lg border border-border-default bg-[var(--color-surface-base)] px-3 py-2 text-xs leading-relaxed text-text-primary placeholder:text-text-muted focus:border-[var(--color-brand-400)] focus:outline-none"
        />
      }
    />
    </>
  );
}
