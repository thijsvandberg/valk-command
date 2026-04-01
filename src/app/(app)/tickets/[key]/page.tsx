"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import {
  EPIC_COLORS,
  type Ticket,
  type TicketDetail,
} from "@/types/ticket";
import {
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Flag,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { useTicketDetail, useJiraSprints, useTicketReviews } from "@/hooks/useSprintBoard";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { JIRA_STATUS_COLORS } from "@/components/shared/StatusBadge";
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

export default function TicketDetailPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = use(params);

  const { data: apiData, isLoading: ticketLoading, mutate: mutateTicket } = useTicketDetail(key);

  const ticket: Ticket | undefined = apiData ? {
    key: apiData.key,
    title: apiData.title,
    type: apiData.type,
    epic: apiData.epic ?? null,
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

  const [hasLocalTitleEdit, setHasLocalTitleEdit] = useState(false);
  const [hasLocalDescEdit, setHasLocalDescEdit] = useState(false);
  const [activeTab, setActiveTab] = useState<"content" | "history" | "review" | "refinement">("content");
  const [showConflictDiff, setShowConflictDiff] = useState(false);
  const [versionCount, setVersionCount] = useState(0);

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

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleTitleLocalEdit = useCallback((has: boolean) => setHasLocalTitleEdit(has), []);
  const handleDescLocalEdit = useCallback((has: boolean) => setHasLocalDescEdit(has), []);

  const showConflictWarning = ticket?.editState === "conflict";

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
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h1 className="font-[var(--font-display)] text-2xl font-semibold text-white/80">Ticket not found</h1>
          <p className="mt-2 text-sm text-white/40">No ticket with key &quot;{key}&quot; exists in the current data.</p>
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

  const jiraStatusColor = JIRA_STATUS_COLORS[ticket.jiraStatus] ?? JIRA_STATUS_COLORS["TO DO"];
  const epicColor = ticket.epic ? EPIC_COLORS[ticket.epic] : null;
  const hasLocalEdits = hasLocalTitleEdit || hasLocalDescEdit;

  return (
    <ErrorBoundary>
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-8 py-6">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs">
            <Link
              href="/sprint-board"
              className="text-white/40 cursor-pointer hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              Sprint Board
            </Link>
            <ChevronRight size={10} strokeWidth={1} className="text-white/15" />
            {ticketSprintId && (
              <>
                <Link
                  href={`/sprint-board?sprint=${encodeURIComponent(ticketSprintId)}`}
                  className="text-white/40 cursor-pointer hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                >
                  {ticketSprintLabel}
                </Link>
                <ChevronRight size={10} strokeWidth={1} className="text-white/15" />
              </>
            )}
            <span className="font-mono text-white/60">{key}</span>
          </nav>

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
            <div className="flex items-center gap-2.5">
              <IssueTypeIcon type={ticket.type} size={20} />
              <span className="font-mono text-sm text-white/40">{key}</span>
              {ticket.flagged && (
                <Flag size={16} className="text-[#e5534b]" fill="currentColor" strokeWidth={0} />
              )}
              {hasLocalEdits && (
                <span className="rounded bg-[var(--color-brand-500)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-brand-400)]">
                  Modified locally
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRefreshFromJira}
                  disabled={isRefreshing}
                  className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-white/40 cursor-pointer hover:bg-white/[0.04] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RefreshCw size={14} strokeWidth={1.2} className={isRefreshing ? "animate-spin" : ""} />
                  {isRefreshing ? "Syncing..." : "Refresh from Jira"}
                </button>
                <a
                  href={getJiraUrl(key)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-white/40 cursor-pointer hover:bg-white/[0.04] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98]"
                >
                  <ExternalLink size={14} strokeWidth={1.2} />
                  Open in Jira
                </a>
              </div>
            </div>

            <div className="mt-3">
              <EditableTitle
                ticketKey={key}
                initialTitle={ticket.title}
                onLocalEdit={handleTitleLocalEdit}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium"
                style={{ backgroundColor: jiraStatusColor.bg, color: jiraStatusColor.text }}
              >
                {ticket.jiraStatus}
              </span>
              {epicColor && (
                <span
                  className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium"
                  style={{ backgroundColor: epicColor.bg, color: epicColor.text }}
                >
                  {ticket.epic}
                </span>
              )}
              {ticket.storyPoints !== null && (
                <span className="inline-flex items-center rounded-md bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-white/50">
                  {ticket.storyPoints} pts
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
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                  activeTab === tab.id
                    ? "text-white/80"
                    : "text-white/30 hover:text-white/50"
                }`}
                style={{ transition: "color 0.15s ease" }}
              >
                {tab.label}
                {tab.badge !== undefined && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-white/[0.06] px-1 text-[10px] tabular-nums text-white/30">
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
                onLocalEdit={handleDescLocalEdit}
                hasConflict={showConflictWarning}
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
              onConflictResolved={(action) => {
                setShowConflictDiff(false);
                mutateTicket();
                if (action === "discard") {
                  setActiveTab("content");
                }
              }}
            />
          )}
          {activeTab === "review" && <TicketReview ticketKey={key} />}
          {activeTab === "refinement" && <TicketRefinement ticketKey={key} />}

          <div className="h-12" />
        </div>
      </div>

      <div className="sticky top-0 min-h-full self-stretch overflow-y-auto">
        <TicketSidebar ticket={ticket} detail={detail} onNavigateToReview={() => setActiveTab("review")} />
      </div>
    </div>
    </ErrorBoundary>
  );
}
