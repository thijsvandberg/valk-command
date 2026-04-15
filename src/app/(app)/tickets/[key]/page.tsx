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
  NotebookPen,
  Zap,
  IterationCw,
  Trash2,
  Star,
  Check,
} from "lucide-react";
import { useTicketDetail, useJiraSprints, useTicketReviews, useActiveWriterSessions, useTicketVersionCount } from "@/hooks/useSprintBoard";
import { useFollowedTickets, useFollowTicket } from "@/hooks/usePipelines";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { IssueTypePicker } from "@/components/shared/IssueTypePicker";
import { JIRA_STATUS_COLORS } from "@/components/shared/StatusBadge";
import { Avatar } from "@/components/shared/Avatar";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { Tooltip } from "@/components/shared/Tooltip";
import { ViewHeader, ViewHeaderDivider } from "@/components/shared/ViewHeader";
import { TicketKeyPill } from "@/components/shared/TicketKeyPill";
import { EditableTitle } from "@/components/ticket-detail/EditableTitle";
import { EditableDescription } from "@/components/ticket-detail/EditableDescription";
import { AttachmentsSection } from "@/components/ticket-detail/AttachmentsSection";
import { SubtasksSection } from "@/components/ticket-detail/SubtasksSection";
import { LinkedIssuesSection } from "@/components/ticket-detail/LinkedIssuesSection";
import { EpicChildrenSection } from "@/components/ticket-detail/EpicChildrenSection";
import { CommentsSection } from "@/components/ticket-detail/CommentsSection";
import { TicketHistory } from "@/components/ticket-detail/TicketHistory";
import { TicketReview } from "@/components/ticket-detail/TicketReview";
import { TicketRefinement } from "@/components/ticket-detail/TicketRefinement";
import { TicketSidebar } from "@/components/ticket-detail/TicketSidebar";
import { TicketDevelopment } from "@/components/ticket-detail/TicketDevelopment";
import { SearchModal } from "@/components/sprint-board/SearchModal";
import { Tab } from "@/components/shared/TabBar";
import { Button } from "@/components/ui/Button";
import { getJiraUrl } from "@/components/sprint-board/TicketTableCells";


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
    poStatus: apiData.poStatus ?? null,
    qualityScore: apiData.qualityScore ?? null,
    editState: apiData.editState ?? "clean",
    notes: apiData.notes ?? "",
    sprintId: apiData.sprintId,
  } : undefined, [apiData]);

  const detail: TicketDetail | undefined = apiData ? {
    description: apiData.description ?? "",
    reporter: apiData.reporter ?? null,
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
  const localEdits: Record<string, { value: string; isDraft: boolean }> | undefined = apiData?.localEdits;

  // Auto-fetch from Jira when ticket is not in local DB
  const [jiraCheckState, setJiraCheckState] = useState<"idle" | "checking" | "not-found">("idle");
  const jiraCheckStarted = useRef(false);
  useEffect(() => {
    if (ticketLoading || apiData || jiraCheckStarted.current) return;
    jiraCheckStarted.current = true;
    setJiraCheckState("checking");
    let cancelled = false;
    async function tryFetchFromJira() {
      try {
        const res = await fetch("/api/jira/sync-tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticketKeys: [key] }),
        });
        if (cancelled) return;
        const data = await res.json();
        if (data.ok && data.count > 0) {
          await mutateTicket();
          return;
        }
        setJiraCheckState("not-found");
      } catch {
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
    await fetch(`/api/tickets/${encodeURIComponent(key)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: newType }),
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
      await fetch(`/api/tickets/${key}/story-writer?deleteConversation=true`, { method: "DELETE" });
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

  const [isPushing, setIsPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const [draftDiscardKey, setDraftDiscardKey] = useState(0);


  const handleTitleLocalEdit = useCallback((has: boolean) => setHasLocalTitleEdit(has), []);
  const handleDescLocalEdit = useCallback((has: boolean) => setHasLocalDescEdit(has), []);

  const showConflictWarning = ticket?.editState === "conflict";

  const handleRemoteChanged = useCallback((contentChanged: boolean) => {
    setActiveTab("history");
    setShowConflictDiff(true);
    setMetadataOnlyConflict(!contentChanged);
    mutateTicket();
  }, [mutateTicket]);

  const handleDiscardDraft = useCallback(async () => {
    try {
      await fetch(`/api/tickets/${key}/local-edits`, { method: "DELETE" });
      setHasLocalTitleEdit(false);
      setHasLocalDescEdit(false);
      setPushError(null);
      setOverrideConfirmed(false);
      // Remount editables so they reflect fresh Jira state
      setDraftDiscardKey((k) => k + 1);
      await mutateTicket();
    } catch (err) {
      console.error("Failed to discard draft:", err);
    }
  }, [key, mutateTicket]);

  const handlePushToJira = useCallback(async () => {
    setIsPushing(true);
    setPushError(null);
    try {
      const res = await fetch(`/api/tickets/${key}/push-to-jira`, { method: "POST" });
      const data = await res.json();
      if (data.conflict) {
        handleRemoteChanged(data.contentChanged ?? true);
      } else if (data.success) {
        setHasLocalTitleEdit(false);
        setHasLocalDescEdit(false);
        setOverrideConfirmed(false);
        setDraftDiscardKey((k) => k + 1);
        await mutateTicket();
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
      await fetch("/api/jira/sync-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketKeys: [key] }),
      });
      await mutateTicket();
    } catch (err) {
      console.error("Failed to refresh from Jira:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [key, mutateTicket]);

  const { data: rawSprints } = useJiraSprints();
  const ticketSprintId = ticket?.sprintId ?? null;
  const ticketSprintLabel = rawSprints?.find((s) => String(s.id) === ticketSprintId)?.name ?? ticketSprintId;

  if (ticketLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} strokeWidth={2} className="animate-spin text-white/20" />
          <span className="text-sm text-white/30">Loading ticket...</span>
        </div>
      </div>
    );
  }

  if (!ticket) {
    if (jiraCheckState === "idle" || jiraCheckState === "checking") {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={32} strokeWidth={2} className="animate-spin text-white/20" />
            <span className="text-sm text-white/30">Checking Jira...</span>
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h1 className="font-[var(--font-display)] text-2xl font-semibold text-white/80">Ticket not found</h1>
          <p className="mt-2 text-sm text-white/40">No ticket with key &quot;{key}&quot; exists in Jira or the local data.</p>
          <Link
            href="/sprint-board"
            className="mt-4 inline-block rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white cursor-pointer hover:bg-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98]"
          >
            Back to Sprint Board
          </Link>
        </div>
      </div>
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
        icon={<IssueTypePicker type={ticket.type} size={15} onTypeChange={handleTypeChange} />}
        actions={
          <div className="flex shrink-0 items-center gap-2">
            {(ticketSprintId || ticket.epic) && (
              <nav className="hidden lg:flex shrink-0 items-center gap-1.5">
                {ticketSprintId && (
                  <Tooltip content={ticketSprintLabel || "Sprint"}>
                    <Link
                      href={`/sprint-board?sprint=${encodeURIComponent(ticketSprintId)}`}
                      className="flex items-center gap-1.5 rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-white/35 cursor-pointer hover:bg-white/[0.09] hover:text-white/50 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
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
                        className="flex items-center gap-1.5 rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-white/35 cursor-pointer hover:bg-white/[0.09] hover:text-white/50 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                      >
                        <Zap size={12} strokeWidth={1.5} />
                        <span className="max-w-[120px] truncate">{ticket.epic}</span>
                      </Link>
                    ) : (
                      <span className="flex items-center gap-1.5 rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-white/35">
                        <Zap size={12} strokeWidth={1.5} />
                        <span className="max-w-[120px] truncate">{ticket.epic}</span>
                      </span>
                    )}
                  </Tooltip>
                )}
              </nav>
            )}
            {(ticketSprintId || ticket.epic) && (
              <div className="h-5 w-px shrink-0 bg-white/[0.06]" />
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
            <Button
              variant="ghost"
              size="md"
              iconOnly
              onClick={() => isFollowed ? unfollow(key) : follow(key)}
              title={isFollowed ? "Unfollow ticket" : "Follow ticket for notifications"}
              icon={
                <Star
                  size={14}
                  strokeWidth={1.5}
                  className={isFollowed ? "text-amber-400 fill-amber-400" : ""}
                />
              }
            />
            <Button
              variant="ghost"
              size="md"
              iconOnly
              onClick={handleCopyLink}
              title="Copy title and Jira link"
              icon={
                linkCopied
                  ? <Check size={14} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
                  : <Copy size={14} strokeWidth={1.5} />
              }
            />
            <Button
              variant="secondary"
              size="md"
              iconOnly
              onClick={handleRefreshFromJira}
              disabled={isRefreshing}
              title={isRefreshing ? "Pulling from Jira..." : "Pull from Jira"}
              icon={<CloudDownload size={15} strokeWidth={1.5} className={isRefreshing ? "animate-spin" : ""} />}
            />
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
                  className="!rounded-l-none !rounded-r-md !border-0 !text-[var(--color-brand-400)]/35 hover:!text-red-400/80"
                  title="Delete session"
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
          </div>
        }
      >
        {/* Combined key + status pill */}
        {(() => {
          const sc = JIRA_STATUS_COLORS[ticket.jiraStatus] ?? JIRA_STATUS_COLORS["TO DO"];
          return (
            <TicketKeyPill ticketKey={key} statusLabel={ticket.jiraStatus} statusBg={sc.bg} statusColor={sc.text} />
          );
        })()}
        <ViewHeaderDivider />
        <span className="min-w-0 flex-1 truncate font-[var(--font-display)] text-[15px] font-semibold tracking-tight text-white/90">
          {ticket.title}
        </span>
      </ViewHeader>

      <div className="flex flex-1 overflow-hidden">
        <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
          {/* Tab bar - scoped to content column only, not spanning sidebar */}
          <div className="border-b border-white/[0.06]">
          <div className="mx-auto flex h-[50px] max-w-4xl items-stretch gap-1 px-8">
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

          <div className="flex-1 overflow-y-auto" style={{ overflowX: "hidden", scrollbarGutter: "stable" }}>
          <div className={`mx-auto max-w-4xl px-8 ${activeTab === "history" ? "pt-6" : "py-6"}`}>

          {/* Conflict warning: clickable, opens conflict diff */}
          {showConflictWarning && (
            <button
              type="button"
              onClick={() => {
                setActiveTab("history");
                setShowConflictDiff(true);
              }}
              className="mt-3 flex w-full items-start gap-2.5 rounded-lg border border-[#ea8744]/20 bg-[#ea8744]/[0.06] px-4 py-3 text-left cursor-pointer hover:bg-[#ea8744]/[0.09] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ea8744]/50 active:scale-[0.995]"
              style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
            >
              <AlertTriangle size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-[#ea8744]" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#ea8744]">Conflict</p>
                <p className="mt-0.5 text-xs text-white/40">
                  Jira was updated since your local edit. Click to review and resolve.
                </p>
              </div>
            </button>
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
              />
              {ticket.flagged && (
                <Flag size={16} className="mt-2 shrink-0 text-[#e5534b]" fill="currentColor" strokeWidth={0} />
              )}
            </div>

            {/* Metadata strip */}
            {ticket.assignee && (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-white/40">
                  <Avatar assignee={ticket.assignee} size={18} />
                  <span className="truncate">{ticket.assignee.name}</span>
                </span>
              </div>
            )}

          </div>
          )}

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
              />
              {detail && <AttachmentsSection attachments={detail.attachments} />}
              {ticket?.type === "epic"
                ? detail && <EpicChildrenSection items={detail.epicChildren} />
                : <>
                    {detail && <SubtasksSection subtasks={detail.subtasks} />}
                    {detail && <LinkedIssuesSection issues={detail.linkedIssues} />}
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
                await mutateTicket();
                setActiveTab("content");
              }}
            />
          )}
          {activeTab === "review" && <TicketReview ticketKey={key} />}
          {activeTab === "refinement" && <TicketRefinement ticketKey={key} />}
          {activeTab === "development" && <TicketDevelopment ticketKey={key} />}

          {activeTab !== "history" && <div className="h-12" />}
        </div>
          </div>
        </div>

      <div className="sticky top-0 min-h-full self-stretch overflow-visible">
        <TicketSidebar ticket={ticket} detail={detail} onNavigateToReview={() => setActiveTab("review")} onNavigateToDev={() => setActiveTab("development")} />
      </div>
      </div>
    </div>
    </ErrorBoundary>
    <SearchModal
      open={searchOpen}
      onClose={() => setSearchOpen(false)}
      onSelectTicket={() => {}}
    />
    </>
  );
}
