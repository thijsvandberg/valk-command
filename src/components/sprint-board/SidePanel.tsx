"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Ticket, POStatus, TicketReadiness, IssueType, JiraStatus } from "@/types/ticket";
import Link from "next/link";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { Tooltip } from "@/components/shared/Tooltip";
import { Popover } from "@/components/shared/Popover";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useTicketDetailPage } from "@/hooks/useTicketDetailPage";
import { useRefinementSessions } from "@/hooks/useRefinementSessions";
import { prefetchTicketPage } from "@/lib/prefetch";
import { TicketTabContent, type TicketTab } from "@/components/ticket-detail/TicketTabContent";
import { TicketMetaContent } from "@/components/ticket-detail/TicketMetaContent";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  ArrowUpRight,
  X,
  Gem,
  NotebookPen,
  MoreHorizontal,
  Star,
  Copy,
  Check,
  CloudDownload,
  CloudUpload,
  Flag,
  MessageSquare,
  Loader2,
  Trash2,
  ChevronRight,
  PanelRightClose,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

const AddToRefinementModal = dynamic(
  () => import("@/components/refinement-session/AddToRefinementModal").then((m) => ({ default: m.AddToRefinementModal })),
  { ssr: false },
);

const PANEL_STORAGE_KEY = "sprintBoardPanelWidth";
const DEFAULT_PANEL_WIDTH = 400;
const MIN_PANEL_WIDTH = 320;

// Meta sidebar (interior column) persistence + bounds. Distinct keys from the
// full ticket page (`ticket-sidebar-*`) so the panel and page never clash.
const META_WIDTH_KEY = "sprintBoardMetaWidth";
const META_COLLAPSED_KEY = "sprintBoardMetaCollapsed";
const DEFAULT_META_WIDTH = 340;
const MIN_META_WIDTH = 280;
// The tabbed content keeps at least this width; below it the meta drops below
// the content (stacked) instead of sitting in its own column.
const CONTENT_MIN_WIDTH = 360;

export function SidePanel({
  ticket,
  readiness,
  onReadinessChange,
  onClose,
  onMutate,
  onSelectTicket,
  adjacentKeys,
}: {
  ticket: Ticket;
  poStatus: POStatus;
  readiness?: TicketReadiness | null;
  onPoStatusChange: (v: POStatus) => void;
  onReadinessChange?: (v: TicketReadiness | null) => void;
  onNotesChange: (notes: string) => void;
  onClose: () => void;
  onShowToast: (message: string) => void;
  onMutate?: () => void;
  onSelectTicket?: (key: string) => void;
  adjacentKeys?: { prev: string | null; next: string | null };
}) {
  const router = useRouter();

  // All ticket state and handlers come from the same hook the full ticket page
  // uses, so behaviour (editing, conflict, push, flag, follow, review/versions,
  // status/type) stays identical to /tickets/[key].
  const h = useTicketDetailPage(ticket.key);
  const t = h.ticket ?? ticket;
  const detail = h.detail;

  // Refresh the panel's own detail cache and the board list together.
  const handleMutate = useCallback(() => {
    h.mutateTicket();
    onMutate?.();
  }, [h, onMutate]);

  // Refinement eligibility for the "Add to refinement" shortcut.
  const { sessions: refinementSessions } = useRefinementSessions();
  const isInRefinementSession = refinementSessions.some(
    (s) => s.status !== "completed" && s.ticketKeys.includes(ticket.key),
  );

  // Readiness flows through the board (optimistic row update + persist); we then
  // revalidate the panel's own detail so the header pill reflects the new value.
  const handleReadinessChange = useCallback((v: TicketReadiness | null) => {
    onReadinessChange?.(v);
    h.mutateTicket();
  }, [onReadinessChange, h]);

  const handleJiraStatusChange = useCallback(async (status: JiraStatus) => {
    await h.handleJiraStatusChange(status);
    onMutate?.();
  }, [h, onMutate]);

  const handleTypeChange = useCallback(async (type: IssueType) => {
    await h.handleTypeChange(type);
    onMutate?.();
  }, [h, onMutate]);

  // Prefetch adjacent ticket details when this panel opens.
  useEffect(() => {
    if (adjacentKeys?.prev) prefetchTicketPage(adjacentKeys.prev);
    if (adjacentKeys?.next) prefetchTicketPage(adjacentKeys.next);
  }, [adjacentKeys]);

  // -- Panel width / resize --
  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_PANEL_WIDTH;
    const saved = localStorage.getItem(PANEL_STORAGE_KEY);
    if (!saved) return DEFAULT_PANEL_WIDTH;
    const parsed = parseInt(saved, 10);
    return !isNaN(parsed) ? Math.max(MIN_PANEL_WIDTH, parsed) : DEFAULT_PANEL_WIDTH;
  });
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    function handleMouseMove(e: MouseEvent) {
      const newWidth = Math.max(MIN_PANEL_WIDTH, window.innerWidth - e.clientX);
      setPanelWidth(newWidth);
      localStorage.setItem(PANEL_STORAGE_KEY, String(newWidth));
    }
    function handleMouseUp() {
      setIsDragging(false);
    }
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // -- Meta sidebar (interior column) width / collapse --
  // Mirrors the full ticket page's `TicketSidebar` shell, but the resize is
  // measured against the panel's right edge (not the window) and feeds an
  // auto-stack decision, so the shell logic lives here rather than in a shared
  // component (which would have to touch the out-of-scope `TicketSidebar`).
  const [metaWidth, setMetaWidth] = useLocalStorage(META_WIDTH_KEY, DEFAULT_META_WIDTH);
  const [metaCollapsed, setMetaCollapsed] = useLocalStorage(META_COLLAPSED_KEY, false);
  const [isMetaDragging, setIsMetaDragging] = useState(false);

  // Bound the persisted meta width so a stale value can never starve the
  // content column below its minimum.
  const clampedMetaWidth = Math.max(
    MIN_META_WIDTH,
    Math.min(panelWidth - CONTENT_MIN_WIDTH, metaWidth),
  );

  // Column when there is room for both; stacked when too narrow; hidden when
  // the user has explicitly collapsed the meta (collapse wins over stacking).
  const metaMode: "column" | "stacked" | "hidden" = metaCollapsed
    ? "hidden"
    : panelWidth - clampedMetaWidth >= CONTENT_MIN_WIDTH
      ? "column"
      : "stacked";

  const handleMetaMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsMetaDragging(true);
  }, []);

  const handleMetaDoubleClick = useCallback(() => {
    setMetaCollapsed(true);
  }, [setMetaCollapsed]);

  useEffect(() => {
    if (!isMetaDragging) return;
    function handleMouseMove(e: MouseEvent) {
      if (!panelRef.current) return;
      const rect = panelRef.current.getBoundingClientRect();
      const maxWidth = panelWidth - CONTENT_MIN_WIDTH;
      const newWidth = Math.max(MIN_META_WIDTH, Math.min(maxWidth, rect.right - e.clientX));
      setMetaWidth(newWidth);
    }
    function handleMouseUp() {
      setIsMetaDragging(false);
    }
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isMetaDragging, panelWidth, setMetaWidth]);

  // -- Tabs + conflict/diff plumbing (mirrors /tickets/[key]) --
  const [activeTab, setActiveTab] = useState<TicketTab>("content");
  const [historyResetKey, setHistoryResetKey] = useState(0);
  const [openDraftDiff, setOpenDraftDiff] = useState(false);

  const handleTabChange = (tab: TicketTab) => {
    if (tab === "history" && activeTab === "history") setHistoryResetKey((k) => k + 1);
    if (tab === "history" && h.showConflictWarning) h.setShowConflictDiff(true);
    if (tab === "history") setOpenDraftDiff(false);
    setActiveTab(tab);
  };

  const handleViewDiff = () => {
    setOpenDraftDiff(true);
    setActiveTab("history");
  };

  // -- Header action menus / dialogs --
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [showAddToRefinement, setShowAddToRefinement] = useState(false);
  const [showFlagDialog, setShowFlagDialog] = useState(false);

  const hasLocalEdits = h.hasLocalTitleEdit || h.hasLocalDescEdit;
  const isEditing = h.isTitleEditing || h.isDescEditing;
  const isDraftOnly = t.editState === "draft";
  const showPushButton = hasLocalEdits && !h.showConflictWarning && !isEditing && !isDraftOnly;

  const isReadOnly = Boolean(t.removedFromJiraAt);
  const refineEligible = !t.removedFromJiraAt && t.jiraStatus !== "DONE" && t.jiraStatus !== "DEPRECATED"
    && t.readiness === "ready_to_refine" && !isInRefinementSession;

  const handleSelectTicket = useCallback((key: string) => {
    if (onSelectTicket) onSelectTicket(key);
    else router.push(`/tickets/${key}`);
  }, [onSelectTicket, router]);

  // The shared meta panel (identical to the full ticket page's sidebar). In
  // stacked mode it renders bare and is injected under the Content tab; in
  // column mode it is wrapped in the resizable/collapsible shell below.
  const metaContent = (
    <TicketMetaContent
      ticket={t}
      detail={detail}
      reviewData={h.reviewData}
      onReadinessChange={handleReadinessChange}
      onNavigateToReview={() => setActiveTab("review")}
      onNavigateToDev={() => setActiveTab("development")}
      onMutate={handleMutate}
      className={metaMode === "column"
        ? "h-full overflow-y-auto bg-[var(--color-surface-elevated)] py-5 px-5"
        : ""}
      style={metaMode === "column"
        ? { opacity: isMetaDragging ? 0.7 : 1, transition: isMetaDragging ? "none" : "opacity 150ms ease" }
        : undefined}
    />
  );

  const metaColumn = (
    <div
      className="group/meta relative shrink-0"
      style={{
        width: clampedMetaWidth,
        height: "100%",
        transition: isMetaDragging ? "none" : "width 200ms cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
    >
      {/* Resize drag handle (content/meta divider). Double-click collapses. */}
      <div
        onMouseDown={handleMetaMouseDown}
        onDoubleClick={handleMetaDoubleClick}
        className="absolute top-0 left-0 z-20 h-full w-1 cursor-col-resize hover:bg-[var(--color-brand-500)]/30 active:bg-[var(--color-brand-500)]/50"
        style={isMetaDragging ? { backgroundColor: "var(--color-drag-active)" } : {}}
      />
      <div className="absolute top-0 left-0 h-full w-px bg-border-default" />
      <button
        type="button"
        onClick={() => setMetaCollapsed(true)}
        className="absolute left-0 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full border border-border-default bg-[var(--color-surface-elevated)] text-text-muted cursor-pointer opacity-0 group-hover/meta:opacity-100 hover:text-text-secondary hover:border-[var(--color-brand-500)]/40 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        style={{ transition: "opacity 0.15s ease, color 0.15s ease, border-color 0.15s ease" }}
        aria-label="Collapse sidebar"
        title="Collapse sidebar"
      >
        <ChevronRight className="h-3 w-3" strokeWidth={2} />
      </button>
      {metaContent}
    </div>
  );

  const tabContent = (
    <TicketTabContent
      layout="panel"
      metaContent={metaMode === "stacked" ? metaContent : undefined}
      ticketKey={ticket.key}
      ticket={t}
      detail={detail}
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
      autoOpenDraftDiff={openDraftDiff}
      metadataOnlyConflict={h.metadataOnlyConflict}
      onViewDiff={handleViewDiff}
      isDiscarding={h.isDiscarding}
      discardError={h.discardError}
      isPushing={h.isPushing}
      pushError={h.pushError}
      overrideConfirmed={h.overrideConfirmed}
      onOverrideChange={h.setOverrideConfirmed}
      onDiscardDraft={h.handleDiscardDraft}
      onPushToJira={h.handlePushToJira}
      onMutate={handleMutate}
      onConflictResolved={h.handleConflictResolved}
      onSelectTicket={handleSelectTicket}
      reviewCount={h.reviewCount}
      versionCount={h.versionCount}
      historyResetKey={historyResetKey}
      isFlagged={h.isFlagged}
    />
  );

  return (
    <div
      ref={panelRef}
      className="relative z-10 flex h-full shrink-0 flex-col border-l border-border-default bg-[var(--color-surface-elevated)]"
      style={{ width: `${panelWidth}px`, minWidth: MIN_PANEL_WIDTH }}
    >
      {/* Resize drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 left-0 z-20 h-full w-1 cursor-col-resize hover:bg-[var(--color-brand-500)]/30 active:bg-[var(--color-brand-500)]/50"
        style={isDragging ? { backgroundColor: "var(--color-drag-active)" } : {}}
      />

      {/* Header */}
      <div className="flex h-[44px] shrink-0 items-center justify-between gap-2 border-b border-border-default px-4">
        <div className="flex min-w-0 items-center gap-2">
          <TicketStatusPill
            ticketKey={ticket.key}
            jiraStatus={t.jiraStatus}
            readiness={isReadOnly ? null : t.readiness}
            onJiraStatusChange={isReadOnly ? undefined : handleJiraStatusChange}
            onReadinessChange={isReadOnly ? undefined : handleReadinessChange}
            issueType={t.type}
            onIssueTypeChange={isReadOnly ? undefined : handleTypeChange}
            title={t.title}
            removedFromJira={isReadOnly}
            onHeader
          />
          {t.editState === "draft" && (
            <span className="rounded px-1.5 py-0.5 text-caption" style={{ backgroundColor: "var(--color-status-info-subtle)", color: "var(--color-icon-task)", opacity: 0.5 }} title="Unsaved draft">
              draft
            </span>
          )}
          {t.editState === "local_edits" && (
            <span className="rounded px-1.5 py-0.5 text-caption" style={{ backgroundColor: "var(--color-status-info-subtle)", color: "var(--color-icon-task)", opacity: 0.7 }} title="Has local changes not yet pushed to Jira">
              local changes
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {showPushButton && (
            <Tooltip content="Push local edits to Jira">
              <Button
                variant="primary"
                size="md"
                iconOnly
                onClick={h.handlePushToJira}
                disabled={h.isPushing}
                aria-label="Push to Jira"
                icon={h.isPushing
                  ? <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />
                  : <CloudUpload size={13} strokeWidth={1.5} />}
              />
            </Tooltip>
          )}

          <Tooltip content={h.hasActiveSession ? "Resume story writer session" : "Open story writer"}>
            <Link
              href={`/tickets/${ticket.key}/write`}
              aria-label={h.hasActiveSession ? "Resume story writer session" : "Open story writer"}
              className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-brand-400)] cursor-pointer hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] transition-colors duration-150"
            >
              <NotebookPen className="h-3.5 w-3.5" strokeWidth={1.5} />
              {h.hasActiveSession && (
                <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-brand-400)] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-brand-500)]" />
                </span>
              )}
            </Link>
          </Tooltip>

          <div className="relative">
            <Button
              variant="ghost"
              size="md"
              iconOnly
              onClick={() => setMoreMenuOpen((v) => !v)}
              aria-label="More actions"
              title="More actions"
              icon={h.isRefreshing
                ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
                : <MoreHorizontal size={14} strokeWidth={1.5} />}
            />
            <Popover open={moreMenuOpen} onClose={() => setMoreMenuOpen(false)} align="right">
              <div className="min-w-[220px] py-1">
                <button
                  onClick={() => { setMoreMenuOpen(false); h.isFollowed ? h.unfollow(ticket.key) : h.follow(ticket.key); }}
                  className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong"
                  style={{ transition: "background-color 0.1s ease" }}
                >
                  <Star size={13} strokeWidth={1.5} className={h.isFollowed ? "text-amber-400 fill-amber-400" : "text-text-muted"} />
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
                    : <Copy size={13} strokeWidth={1.5} className="text-text-muted" />}
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
                {refineEligible && (
                  <>
                    <div className="mx-2 my-1 h-px bg-overlay-default" />
                    <button
                      onClick={() => { setMoreMenuOpen(false); setShowAddToRefinement(true); }}
                      className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong"
                      style={{ transition: "background-color 0.1s ease" }}
                    >
                      <Gem size={13} strokeWidth={1.5} className="text-text-muted" />
                      Add to refinement
                    </button>
                  </>
                )}
                {h.hasActiveSession && (
                  <button
                    onClick={(e) => { setMoreMenuOpen(false); h.handleDeleteSession(e); }}
                    disabled={h.isDeletingSession}
                    className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong disabled:opacity-50"
                    style={{ transition: "background-color 0.1s ease" }}
                  >
                    <Trash2 size={13} strokeWidth={1.5} className="text-text-muted" />
                    Delete writer session
                  </button>
                )}
                <div className="mx-2 my-1 h-px bg-overlay-default" />
                <a
                  href={`/chat?ticket=${ticket.key}`}
                  className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong"
                  style={{ transition: "background-color 0.1s ease" }}
                >
                  <MessageSquare size={13} strokeWidth={1.5} className="text-text-muted" />
                  Chat about this ticket
                </a>
              </div>
            </Popover>
          </div>

          {metaCollapsed && (
            <Tooltip content="Show sidebar">
              <Button
                variant="ghost"
                size="md"
                iconOnly
                onClick={() => setMetaCollapsed(false)}
                aria-label="Show sidebar"
                icon={<PanelRightClose size={14} strokeWidth={1.5} />}
              />
            </Tooltip>
          )}

          <button
            type="button"
            onClick={() => router.push(`/tickets/${ticket.key}`)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-muted cursor-pointer hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] transition-colors duration-150"
            title="Open full view"
            aria-label="Open full view"
          >
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          <Button
            variant="ghost"
            size="md"
            iconOnly
            icon={<X className="h-3.5 w-3.5" strokeWidth={1.5} />}
            onClick={onClose}
            aria-label="Close panel"
          />
        </div>
      </div>

      {/* Body: tabbed content (+ meta column when wide; meta stacks under the
          Content tab when narrow; hidden entirely when the user collapses it) */}
      {metaMode === "column" ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {tabContent}
          {metaColumn}
        </div>
      ) : (
        tabContent
      )}

      {/* Flag dialog */}
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

      <AddToRefinementModal
        open={showAddToRefinement}
        onClose={() => setShowAddToRefinement(false)}
        ticketKeys={[ticket.key]}
      />
    </div>
  );
}
