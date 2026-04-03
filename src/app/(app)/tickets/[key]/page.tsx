"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import Link from "next/link";
import {
  type Ticket,
  type TicketDetail,
} from "@/types/ticket";
import {
  ExternalLink,
  CloudSync,
  Flag,
  Loader2,
  AlertTriangle,
  NotebookPen,
  Zap,
  KanbanSquare,
  IterationCw,
  Link2,
} from "lucide-react";
import { useTicketDetail, useJiraSprints, useTicketReviews, useActiveWriterSessions } from "@/hooks/useSprintBoard";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { JIRA_STATUS_COLORS } from "@/components/shared/StatusBadge";
import { Avatar } from "@/components/shared/Avatar";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { Tooltip } from "@/components/shared/Tooltip";
import { getJiraUrl } from "@/components/sprint-board/TicketTable";
import {
  EditableTitle,
  EditableDescription,
  AttachmentsSection,
  SubtasksSection,
  LinkedIssuesSection,
  CommentsSection,
} from "@/components/ticket-detail/TicketContent";
import { TicketHistory } from "@/components/ticket-detail/TicketHistory";
import { TicketReview } from "@/components/ticket-detail/TicketReview";
import { TicketRefinement } from "@/components/ticket-detail/TicketRefinement";
import { TicketSidebar } from "@/components/ticket-detail/TicketSidebar";
import { SearchModal } from "@/components/sprint-board/SearchModal";


export default function TicketDetailPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = use(params);

  const { data: apiData, isLoading: ticketLoading, mutate: mutateTicket } = useTicketDetail(key);
  const pageTitle = usePageTitle(apiData ? `${key} - ${apiData.title}` : key);

  const ticket: Ticket | undefined = apiData ? {
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
  } : undefined;

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
  } : undefined;

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

  const [hasLocalTitleEdit, setHasLocalTitleEdit] = useState(false);
  const [hasLocalDescEdit, setHasLocalDescEdit] = useState(false);
  const [activeTab, setActiveTab] = useState<"content" | "history" | "review" | "refinement">("content");
  const [showConflictDiff, setShowConflictDiff] = useState(false);
  const [metadataOnlyConflict, setMetadataOnlyConflict] = useState(false);
  const [versionCount, setVersionCount] = useState(0);
  const [historyResetKey, setHistoryResetKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadVersionCount() {
      try {
        const res = await fetch(`/api/tickets/${key}/versions`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          setVersionCount(data.length);
        }
      } catch (err) {
        console.error("Failed to load version count:", err);
      }
    }
    loadVersionCount();
    return () => { cancelled = true; };
  }, [key]);

  const { data: reviewData } = useTicketReviews(key);
  const reviewCount = reviewData?.reviews?.length ?? 0;

  const { data: activeSessions } = useActiveWriterSessions();
  const hasActiveSession = activeSessions?.some((s) => s.ticketKey === key) ?? false;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Cmd+K opens search modal
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleTitleLocalEdit = useCallback((has: boolean) => setHasLocalTitleEdit(has), []);
  const handleDescLocalEdit = useCallback((has: boolean) => setHasLocalDescEdit(has), []);

  const showConflictWarning = ticket?.editState === "conflict";

  const handleRemoteChanged = useCallback((contentChanged: boolean) => {
    setActiveTab("history");
    setShowConflictDiff(true);
    setMetadataOnlyConflict(!contentChanged);
    mutateTicket();
  }, [mutateTicket]);

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

  return (
    <>
      {pageTitle}
      <ErrorBoundary>
    <div className="flex h-full flex-col">

      {/* Unified context header — matches Sprint Board header style */}
      <div className="relative flex items-center justify-between overflow-hidden border-b border-white/[0.06] bg-[var(--color-surface-elevated)]/60 px-5 py-3.5">
        <div className="pointer-events-none absolute left-0 top-0 h-full w-64 bg-[radial-gradient(ellipse_at_left_center,rgba(46,145,73,0.08)_0%,transparent_70%)]" />

        <div className="relative flex min-w-0 flex-1 items-center gap-4">
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-brand-500)]/20 shadow-[0_2px_12px_rgba(46,145,73,0.20),inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-[var(--color-brand-500)]/25">
              <IssueTypeIcon type={ticket.type} size={16} />
            </div>
            <span className="font-mono text-sm font-medium text-white/55">{key}</span>
          </div>

          <div className="h-6 w-px shrink-0 bg-gradient-to-b from-transparent via-white/[0.12] to-transparent" />

          <span className="min-w-0 flex-1 truncate font-[var(--font-display)] text-[15px] font-semibold tracking-tight text-white/90">
            {ticket.title}
          </span>

          <div className="flex shrink-0 items-center gap-2.5">
            {(() => {
              const sc = JIRA_STATUS_COLORS[ticket.jiraStatus] ?? JIRA_STATUS_COLORS["TO DO"];
              return (
                <span
                  className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: sc.bg, color: sc.text }}
                >
                  {ticket.jiraStatus}
                </span>
              );
            })()}
            {ticketSprintLabel && (
              <span className="text-xs text-white/25">{ticketSprintLabel}</span>
            )}
          </div>
        </div>

        <div className="relative ml-4 flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={handleRefreshFromJira}
            disabled={isRefreshing}
            className="flex items-center justify-center rounded-md p-1.5 text-white/40 cursor-pointer hover:bg-white/[0.06] hover:text-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.95] disabled:opacity-40 disabled:cursor-not-allowed"
            title={isRefreshing ? "Syncing..." : "Refresh from Jira"}
          >
            <CloudSync size={15} strokeWidth={1.5} className={isRefreshing ? "animate-spin" : ""} />
          </button>
          <a
            href={getJiraUrl(key)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center rounded-md p-1.5 text-white/40 cursor-pointer hover:bg-white/[0.06] hover:text-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.95]"
            title="Open in Jira"
          >
            <ExternalLink size={15} strokeWidth={1.5} />
          </a>
          <Link
            href={`/tickets/${key}/write`}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] shadow-[0_2px_8px_rgba(46,145,73,0.12)] ${
              hasActiveSession
                ? "border-[var(--color-brand-500)]/40 bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] hover:bg-[var(--color-brand-500)]/25 hover:border-[var(--color-brand-500)]/60"
                : "border-[var(--color-brand-500)]/25 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)] hover:bg-[var(--color-brand-500)]/20 hover:border-[var(--color-brand-500)]/40"
            }`}
            style={{ transition: "background-color 0.15s ease, border-color 0.15s ease, transform 0.1s ease" }}
          >
            {hasActiveSession ? (
              <>
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-brand-400)] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-brand-500)]" />
                </span>
                Resume session
              </>
            ) : (
              <>
                <NotebookPen size={13} strokeWidth={1.5} />
                Story writer
              </>
            )}
          </Link>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-8 py-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 border-b border-white/[0.06] pb-3">
            <nav className="flex items-center gap-2 text-xs">
              <Link
                href="/sprint-board"
                className="flex items-center gap-1 text-white/40 cursor-pointer hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              >
                <KanbanSquare size={12} strokeWidth={1.5} className="shrink-0" />
                Sprint Board
              </Link>
              {ticketSprintId && (
                <>
                  <span className="text-white/15">/</span>
                  <Link
                    href={`/sprint-board?sprint=${encodeURIComponent(ticketSprintId)}`}
                    className="flex items-center gap-1 text-white/40 cursor-pointer hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                  >
                    <IterationCw size={12} strokeWidth={1.5} className="shrink-0" style={{ color: "#d4904a" }} />
                    {ticketSprintLabel}
                  </Link>
                </>
              )}
              {ticket.epic && (
                <>
                  <span className="text-white/15">/</span>
                  <Tooltip content={ticket.epic}>
                    {ticket.epicKey ? (
                      <Link
                        href={`/tickets/${ticket.epicKey}`}
                        className="flex items-center gap-1 text-white/40 cursor-pointer hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                      >
                        <Zap size={12} strokeWidth={1.5} className="shrink-0 text-[#9b6cd4]" />
                        <span className="max-w-[140px] truncate">{ticket.epic}</span>
                      </Link>
                    ) : (
                      <span className="flex items-center gap-1 text-white/40">
                        <Zap size={12} strokeWidth={1.5} className="shrink-0 text-[#9b6cd4]" />
                        <span className="max-w-[140px] truncate">{ticket.epic}</span>
                      </span>
                    )}
                  </Tooltip>
                </>
              )}
              <span className="text-white/15">/</span>
              <span className="group/key flex items-center gap-1.5 font-mono text-white/60">
                <IssueTypeIcon type={ticket.type} size={14} />
                {key}
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/tickets/${key}`);
                  }}
                  className="text-white/0 group-hover/key:text-white/25 cursor-pointer hover:!text-white/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.9]"
                  style={{ transition: "color 0.15s ease, transform 0.1s ease" }}
                  title="Copy link"
                >
                  <Link2 size={15} strokeWidth={1.5} />
                </button>
              </span>
            </nav>
          </div>

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

          {/* Header */}
          <div className="mt-4">

            <div className="mt-3 flex items-start gap-2.5">
              <EditableTitle
                ticketKey={key}
                initialTitle={ticket.title}
                onLocalEdit={handleTitleLocalEdit}
              />
              {ticket.flagged && (
                <Flag size={16} className="mt-2 shrink-0 text-[#e5534b]" fill="currentColor" strokeWidth={0} />
              )}
            </div>

            {/* Metadata strip */}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              {(() => {
                const sc = JIRA_STATUS_COLORS[ticket.jiraStatus] ?? JIRA_STATUS_COLORS["TO DO"];
                return (
                  <span
                    className="inline-flex items-center rounded-md px-2 py-0.5 font-medium"
                    style={{ backgroundColor: sc.bg, color: sc.text }}
                  >
                    {ticket.jiraStatus}
                  </span>
                );
              })()}
              <span className="flex items-center gap-1 text-white/40">
                <span className="text-white/20">Points</span>
                <span className="tabular-nums text-white/60">{ticket.storyPoints ?? "--"}</span>
              </span>
              {ticket.assignee && (
                <span className="flex items-center gap-1.5 text-white/40">
                  <Avatar assignee={ticket.assignee} size={18} />
                  <span className="truncate">{ticket.assignee.name}</span>
                </span>
              )}
            </div>

          </div>

          {/* Tab bar */}
          <div className="mt-6 flex items-center gap-1 border-b border-white/[0.06]">
            {([
              { id: "content" as const, label: "Content" },
              { id: "history" as const, label: "History", badge: versionCount },
              { id: "review" as const, label: "Review", badge: reviewCount || undefined },
              { id: "refinement" as const, label: "Refinement" },
            ]).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (tab.id === "history" && activeTab === "history") {
                    setHistoryResetKey((k) => k + 1);
                  }
                  setActiveTab(tab.id);
                }}
                className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                  activeTab === tab.id
                    ? "text-white/80"
                    : "text-white/30 hover:text-white/50"
                }`}
                style={{ transition: "color 0.15s ease" }}
              >
                {tab.label}
                {tab.badge !== undefined && (
                  <span className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] tabular-nums ${
                    tab.id === "review" && tab.badge > 0
                      ? "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)]"
                      : activeTab === tab.id
                        ? "bg-white/[0.10] text-white/50"
                        : "bg-white/[0.06] text-white/30"
                  }`}>
                    {tab.badge}
                  </span>
                )}
                {activeTab === tab.id && (
                  <span className="absolute right-0 bottom-0 left-0 h-0.5 rounded-full bg-[var(--color-brand-500)]" />
                )}
              </button>
            ))}
          </div>

          {activeTab === "content" && (
            <>
              <EditableDescription
                ticketKey={key}
                initialDescription={detail?.description ?? "No description available."}
                attachments={detail?.attachments}
                onLocalEdit={handleDescLocalEdit}
                hasConflict={showConflictWarning}
                onViewDiff={() => setActiveTab("history")}
                onRemoteChanged={handleRemoteChanged}
                onPushSuccess={() => { mutateTicket(); }}
              />
              {detail && <AttachmentsSection attachments={detail.attachments} />}
              {detail && <SubtasksSection subtasks={detail.subtasks} />}
              {detail && <LinkedIssuesSection issues={detail.linkedIssues} />}
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

          <div className="h-12" />
        </div>
      </div>

      <div className="sticky top-0 min-h-full self-stretch overflow-y-auto">
        <TicketSidebar ticket={ticket} detail={detail} sprintLabel={ticketSprintLabel} onNavigateToReview={() => setActiveTab("review")} />
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
