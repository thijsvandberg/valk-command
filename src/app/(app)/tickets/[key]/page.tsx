"use client";

import { useState, use } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import Link from "next/link";
import {
  CloudUpload,
  Flag,
  Loader2,
  MoreHorizontal,
  NotebookPen,
  Zap,
  IterationCw,
  Trash2,
  Star,
  Check,
  PanelRightClose,
  MessageSquareText,
  Gem,
  Copy,
  CloudDownload,
  CornerLeftUp,
} from "lucide-react";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { Tooltip } from "@/components/shared/Tooltip";
import { ViewHeader, ViewHeaderDivider } from "@/components/shared/ViewHeader";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import dynamic from "next/dynamic";
import { TicketSidebar, SIDEBAR_COLLAPSED_KEY } from "@/components/ticket-detail/TicketSidebar";
import { TicketTabContent, type TicketTab } from "@/components/ticket-detail/TicketTabContent";

const TicketPreviewPanel = dynamic(
  () => import("@/components/ticket-detail/TicketPreviewPanel").then((m) => ({ default: m.TicketPreviewPanel })),
  { ssr: false },
);
const TicketChatPane = dynamic(
  () => import("@/components/shared/TicketChatPane").then((m) => ({ default: m.TicketChatPane })),
  { ssr: false },
);
const AddToRefinementModal = dynamic(
  () => import("@/components/refinement-session/AddToRefinementModal").then((m) => ({ default: m.AddToRefinementModal })),
  { ssr: false },
);
const SearchModal = dynamic(
  () => import("@/components/sprint-board/SearchModal").then((m) => ({ default: m.SearchModal })),
  { ssr: false },
);
import { Button } from "@/components/ui/Button";
import { Popover } from "@/components/shared/Popover";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useTicketDetailPage } from "@/hooks/useTicketDetailPage";
import { useRefinementSessions } from "@/hooks/useRefinementSessions";


export default function TicketDetailPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = use(params);
  const h = useTicketDetailPage(key);
  const { sessions: refinementSessions } = useRefinementSessions();
  // A ticket already in an unfinished refinement should not offer the shortcut;
  // completed sessions are historical and don't block re-adding it later.
  const isInRefinementSession = refinementSessions.some(
    (s) => s.status !== "completed" && s.ticketKeys.includes(key),
  );
  const pageTitle = usePageTitle(h.apiData ? `${key} - ${h.apiData.title}` : key);

  const [chatPaneOpen, setChatPaneOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TicketTab>("content");
  const [historyResetKey, setHistoryResetKey] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage(SIDEBAR_COLLAPSED_KEY, false);
  const [previewTicketKey, setPreviewTicketKey] = useState<string | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [showAddToRefinement, setShowAddToRefinement] = useState(false);
  const [showFlagDialog, setShowFlagDialog] = useState(false);

  const hasLocalEdits = h.hasLocalTitleEdit || h.hasLocalDescEdit;
  const isEditing = h.isTitleEditing || h.isDescEditing;
  const isDraftOnly = h.ticket?.editState === "draft";
  const showPushButton = hasLocalEdits && !h.showConflictWarning && !isEditing && !isDraftOnly;

  const handleTabChange = (tab: TicketTab) => {
    if (tab === "history" && activeTab === "history") {
      setHistoryResetKey((k) => k + 1);
    }
    if (tab === "history" && h.showConflictWarning) {
      h.setShowConflictDiff(true);
    }
    setActiveTab(tab);
  };

  if (h.ticketLoading) {
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

  if (!h.ticket) {
    if (h.jiraCheckState === "idle" || h.jiraCheckState === "checking") {
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
                    <span className="text-body-lg text-text-tertiary">Checking Jira...</span>
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
            <span className="text-body-lg font-medium text-text-tertiary">{key}</span>
          </ViewHeader>

          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <h1 className="font-[var(--font-display)] text-heading-lg font-semibold text-text-primary">Ticket not found</h1>
              <p className="mt-2 text-body-lg text-text-tertiary">No ticket with key &quot;{key}&quot; exists in Jira or the local data.</p>
              <Link
                href="/sprint-board"
                className="mt-4 inline-block rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-body-lg font-medium text-white cursor-pointer hover:bg-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98]"
              >
                Back to Sprint Board
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  const { ticket } = h;

  return (
    <>
      {pageTitle}
      <ErrorBoundary>
    <div className="flex h-full flex-col">

      <ViewHeader
        actions={
          <div className="flex shrink-0 items-center gap-2">
            {((h.ticketSprintId && ticket.type !== "epic") || ticket.epic || ticket.type === "epic" || h.detail?.parent) && (
              <nav className="hidden lg:flex shrink-0 items-center gap-1.5">
                {ticket.type === "epic" && (
                  <span
                    className="flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
                    style={{ backgroundColor: "color-mix(in srgb, var(--color-icon-epic) 12%, transparent)", color: "var(--color-icon-epic)", border: "1px solid color-mix(in srgb, var(--color-icon-epic) 25%, transparent)" }}
                  >
                    <Zap size={11} strokeWidth={2} />
                    Epic
                  </span>
                )}
                {h.ticketSprintId && ticket.type !== "epic" && (
                  <Tooltip content={h.ticketSprintLabel || "Sprint"}>
                    <Link
                      href={`/sprint-board?sprint=${encodeURIComponent(h.ticketSprintId)}`}
                      className="flex items-center gap-1.5 rounded-md bg-overlay-default px-2 py-0.5 text-label font-medium text-text-tertiary cursor-pointer hover:bg-overlay-strong hover:text-text-secondary transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                    >
                      <IterationCw size={12} strokeWidth={1.5} />
                      <span className="max-w-[110px] truncate">{h.ticketSprintLabel}</span>
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
                {h.detail?.parent && (
                  <Tooltip content={`${h.detail.parent.key} ${h.detail.parent.title}`}>
                    <Link
                      href={`/tickets/${h.detail.parent.key}`}
                      className="flex items-center gap-1.5 rounded-md bg-overlay-default px-2 py-0.5 text-label font-medium text-text-tertiary cursor-pointer hover:bg-overlay-strong hover:text-text-secondary transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                    >
                      <CornerLeftUp size={12} strokeWidth={1.5} />
                      <span className="max-w-[140px] truncate">{h.detail.parent.key}</span>
                    </Link>
                  </Tooltip>
                )}
              </nav>
            )}
            {h.isFlagged && (
              <Tooltip content="Click to scroll to flag comment">
                <button
                  onClick={() => {
                    const flagComment = h.detail?.jiraComments
                      ?.slice().reverse()
                      .find((c) => /flag_on|Flag added/i.test(c.content));
                    if (flagComment) {
                      const el = document.getElementById(`jira-comment-${flagComment.id}`);
                      if (el) {
                        el.scrollIntoView({ behavior: "smooth", block: "center" });
                        el.classList.add("ring-2", "ring-[var(--color-status-error)]/40");
                        setTimeout(() => el.classList.remove("ring-2", "ring-[var(--color-status-error)]/40"), 2000);
                      }
                    }
                  }}
                  className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--color-status-error)]/25 bg-[var(--color-status-error)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-status-error)] hover:bg-[var(--color-status-error)]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-status-error)]/40 active:scale-[0.97]"
                  style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
                >
                  <Flag size={11} strokeWidth={1.5} fill="var(--color-status-error)" />
                  Flagged
                </button>
              </Tooltip>
            )}
            {((h.ticketSprintId && ticket.type !== "epic") || ticket.epic || ticket.type === "epic" || h.detail?.parent || h.isFlagged) && (
              <div className="h-5 w-px shrink-0 bg-overlay-default" />
            )}
            {showPushButton && (
              <Button
                variant="primary"
                size="md"
                onClick={h.handlePushToJira}
                disabled={h.isPushing}
                title="Push local edits to Jira"
                icon={h.isPushing
                  ? <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />
                  : <CloudUpload size={13} strokeWidth={1.5} />
                }
              >
                Push to Jira
              </Button>
            )}
            <Tooltip content={chatPaneOpen ? "Close ticket chat" : "Open ticket chat"}>
              <Button
                variant="ghost"
                size="md"
                iconOnly
                onClick={() => setChatPaneOpen((v) => !v)}
                aria-label={chatPaneOpen ? "Close ticket chat" : "Open ticket chat"}
                icon={
                  <MessageSquareText
                    size={14}
                    strokeWidth={1.5}
                    className={chatPaneOpen ? "text-[#a78bfa]" : ""}
                  />
                }
              />
            </Tooltip>
            {!ticket.removedFromJiraAt && ticket.jiraStatus !== "DONE" && ticket.jiraStatus !== "DEPRECATED" && ticket.readiness === "ready_to_refine" && !isInRefinementSession && (
              <button
                onClick={() => setShowAddToRefinement(true)}
                className="flex h-7 items-center gap-1.5 rounded-md border border-[var(--color-brand-500)]/25 bg-[var(--color-brand-500)]/10 px-2.5 text-body-sm font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-[var(--color-brand-500)]/20 hover:border-[var(--color-brand-500)]/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98]"
                style={{ transition: "background-color 0.15s ease, border-color 0.15s ease, transform 0.1s ease" }}
              >
                <Gem size={13} strokeWidth={1.5} />
                Add to refinement
              </button>
            )}
            <div className="relative">
              <Button
                variant="ghost"
                size="md"
                iconOnly
                onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                title="More actions"
                aria-label="More actions"
                icon={h.isRefreshing
                  ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
                  : <MoreHorizontal size={14} strokeWidth={1.5} />
                }
              />
              <Popover open={moreMenuOpen} onClose={() => setMoreMenuOpen(false)} align="right">
                <div className="min-w-[220px] py-1">
                  <button
                    onClick={() => { setMoreMenuOpen(false); h.isFollowed ? h.unfollow(key) : h.follow(key); }}
                    className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong"
                    style={{ transition: "background-color 0.1s ease" }}
                  >
                    <Star
                      size={13}
                      strokeWidth={1.5}
                      className={h.isFollowed ? "text-amber-400 fill-amber-400" : "text-text-muted"}
                    />
                    {h.isFollowed ? "Unfollow ticket" : "Follow ticket"}
                  </button>
                  <div className="mx-2 my-1 h-px bg-overlay-default" />
                  <button
                    onClick={() => { setMoreMenuOpen(false); h.handleCopyLink(); }}
                    className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong"
                    style={{ transition: "background-color 0.1s ease" }}
                  >
                    {h.linkCopied
                      ? <Check size={13} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
                      : <Copy size={13} strokeWidth={1.5} className="text-text-muted" />
                    }
                    {h.linkCopied ? "Copied!" : "Copy title and Jira link"}
                  </button>
                  <button
                    onClick={() => { setMoreMenuOpen(false); h.handleRefreshFromJira(); }}
                    disabled={h.isRefreshing}
                    className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ transition: "background-color 0.1s ease" }}
                  >
                    <CloudDownload size={13} strokeWidth={1.5} className="text-text-muted" />
                    Pull from Jira
                  </button>
                  {!h.isFlagged ? (
                    <button
                      onClick={() => { setMoreMenuOpen(false); setShowFlagDialog(true); }}
                      className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong"
                      style={{ transition: "background-color 0.1s ease" }}
                    >
                      <Flag size={13} strokeWidth={1.5} className="text-text-muted" />
                      Flag this ticket
                    </button>
                  ) : (
                    <button
                      onClick={() => { setMoreMenuOpen(false); h.handleUnflag(); }}
                      className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong"
                      style={{ transition: "background-color 0.1s ease" }}
                    >
                      <Flag size={13} strokeWidth={1.5} className="text-[var(--color-status-error)]" fill="var(--color-status-error)" />
                      Remove flag
                    </button>
                  )}
                  <div className="mx-2 my-1 h-px bg-overlay-default" />
                  <button
                    onClick={() => { setMoreMenuOpen(false); setShowAddToRefinement(true); }}
                    className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong"
                    style={{ transition: "background-color 0.1s ease" }}
                  >
                    <Gem size={13} strokeWidth={1.5} className="text-text-muted" />
                    Add to refinement
                  </button>
                </div>
              </Popover>
            </div>
            {h.hasActiveSession ? (
              <div
                className="group/session flex h-7 items-center rounded-md border border-[var(--color-brand-500)]/40 bg-[var(--color-brand-500)]/15 shadow-[0_2px_8px_color-mix(in_srgb,var(--color-brand-600)_12%,transparent)]"
                style={{ transition: "border-color 0.15s ease" }}
              >
                <Link
                  href={`/tickets/${key}/write`}
                  className="flex h-7 items-center gap-1.5 rounded-l-md px-2.5 text-body-sm font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-[var(--color-brand-500)]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98]"
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
                  onClick={h.handleDeleteSession}
                  disabled={h.isDeletingSession}
                  className="!rounded-l-none !rounded-r-md !border-0 !bg-transparent !text-[var(--color-brand-400)]/35 hover:!bg-transparent hover:!text-red-400/80"
                  title="Delete session"
                  aria-label="Delete session"
                  icon={h.isDeletingSession
                    ? <Loader2 size={11} strokeWidth={1.5} className="animate-spin" />
                    : <Trash2 size={11} strokeWidth={1.5} />
                  }
                />
              </div>
            ) : (
              <Link
                href={`/tickets/${key}/write`}
                className="flex h-7 items-center gap-1.5 rounded-md border border-[var(--color-brand-500)]/25 bg-[var(--color-brand-500)]/10 px-2.5 text-body-sm font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-[var(--color-brand-500)]/20 hover:border-[var(--color-brand-500)]/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] shadow-[0_2px_8px_color-mix(in_srgb,var(--color-brand-600)_12%,transparent)]"
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
          onJiraStatusChange={ticket.removedFromJiraAt ? undefined : h.handleJiraStatusChange}
          onReadinessChange={ticket.removedFromJiraAt ? undefined : h.handleReadinessChange}
          issueType={ticket.type}
          onIssueTypeChange={ticket.removedFromJiraAt ? undefined : h.handleTypeChange}
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
        <TicketTabContent
          ticketKey={key}
          ticket={ticket}
          detail={h.detail}
          localEdits={h.localEdits}
          activeTab={activeTab}
          onActiveTabChange={handleTabChange}
          draftDiscardKey={h.draftDiscardKey}
          isTitleEditing={h.isTitleEditing}
          isDescEditing={h.isDescEditing}
          onTitleEditingChange={h.setIsTitleEditing}
          onDescEditingChange={h.setIsDescEditing}
          onTitleLocalEdit={h.handleTitleLocalEdit}
          onDescLocalEdit={h.handleDescLocalEdit}
          showConflictWarning={h.showConflictWarning}
          showConflictDiff={h.showConflictDiff}
          metadataOnlyConflict={h.metadataOnlyConflict}
          isDiscarding={h.isDiscarding}
          discardError={h.discardError}
          isPushing={h.isPushing}
          pushError={h.pushError}
          overrideConfirmed={h.overrideConfirmed}
          onOverrideChange={h.setOverrideConfirmed}
          onDiscardDraft={h.handleDiscardDraft}
          onPushToJira={h.handlePushToJira}
          onMutate={h.mutateTicket}
          onConflictResolved={h.handleConflictResolved}
          onSelectTicket={setPreviewTicketKey}
          reviewCount={h.reviewCount}
          versionCount={h.versionCount}
          historyResetKey={historyResetKey}
          isFlagged={h.isFlagged}
        />

      {chatPaneOpen && ticket && (
        <div
          className="w-80 shrink-0 border-l border-border-subtle bg-[var(--color-surface-elevated)] overflow-hidden"
          style={{ animation: "fadeInUp 0.15s ease" }}
        >
          <TicketChatPane
            ticketKey={key}
            ticketTitle={ticket.title}
            onClose={() => setChatPaneOpen(false)}
          />
        </div>
      )}

      <div className="sticky top-0 min-h-full self-stretch overflow-visible">
        <TicketSidebar ticket={ticket} detail={h.detail} reviewData={h.reviewData} collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} onNavigateToReview={() => setActiveTab("review")} onNavigateToDev={() => setActiveTab("development")} onReadinessChange={h.handleReadinessChange} />
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
      onClose={() => { setShowFlagDialog(false); h.setFlagReasonInput(""); }}
      title="Flag this ticket"
      description="Add an optional reason for flagging. This will be synced to Jira as a comment."
      confirmLabel="Flag"
      confirmVariant="destructive"
      onConfirm={h.handleFlag}
      extra={
        <textarea
          value={h.flagReasonInput}
          onChange={(e) => h.setFlagReasonInput(e.target.value)}
          placeholder="Reason (optional)..."
          rows={3}
          maxLength={2000}
          className="w-full resize-none rounded-lg border border-border-default bg-[var(--color-surface-base)] px-3 py-2 text-body-sm leading-relaxed text-text-primary placeholder:text-text-muted focus:border-[var(--color-brand-400)] focus:outline-none"
        />
      }
    />
    {previewTicketKey && (
      <TicketPreviewPanel
        ticketKey={previewTicketKey}
        onClose={() => setPreviewTicketKey(null)}
      />
    )}
    <AddToRefinementModal
      open={showAddToRefinement}
      onClose={() => setShowAddToRefinement(false)}
      ticketKeys={[key]}
    />
    </>
  );
}
