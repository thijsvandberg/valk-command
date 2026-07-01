"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Ticket, POStatus, TicketReadiness } from "@/types/ticket";
import { Tooltip } from "@/components/shared/Tooltip";
import { Popover } from "@/components/shared/Popover";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useTicketDetailPage } from "@/hooks/useTicketDetailPage";
import { useRefinementSessions } from "@/hooks/useRefinementSessions";
import { prefetchTicketPage } from "@/lib/prefetch";
import { recordTicketView } from "@/lib/recently-viewed-store";
import { TicketTabContent, type TicketTab } from "@/components/ticket-detail/TicketTabContent";
import { EditStateDot } from "@/components/sprint-board/TicketTableCells";
import { TicketMetaContent } from "@/components/ticket-detail/TicketMetaContent";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  Maximize2,
  X,
  Boxes,
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
  ChevronLeft,
  ChevronRight,
  PanelRightClose,
  Filter,
  FilterX,
  Layers,
  ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

const AddToRefinementModal = dynamic(
  () => import("@/components/refinement-session/AddToRefinementModal").then((m) => ({ default: m.AddToRefinementModal })),
  { ssr: false },
);

// Device-local (BRDG-343): panel widths depend on screen geometry, so syncing
// them across a laptop and a large monitor would be worse, not better.
const PANEL_STORAGE_KEY = "sprintBoardPanelWidth";
const DEFAULT_PANEL_WIDTH = 400;
const MIN_PANEL_WIDTH = 320;

// Meta sidebar (interior column) persistence + bounds. Distinct keys from the
// full ticket page (`ticket-sidebar-*`) so the panel and page never clash.
const META_WIDTH_KEY = "sprintBoardMetaWidth";
const META_COLLAPSED_KEY = "sprintBoardMetaCollapsed";
const DEFAULT_META_WIDTH = 340;
const MIN_META_WIDTH = 280;
// The tabbed content keeps at least this width before a meta column is allowed;
// below it the meta drops under the content (stacked) instead of sitting in its
// own column. Set generously so a side column only appears once the content can
// still breathe (panel ~940px+); narrower drawers stack and hide the toggle (BRDG).
const CONTENT_MIN_WIDTH = 600;

export function SidePanel({
  ticket,
  readiness,
  onReadinessChange,
  onClose,
  onMutate,
  onSelectTicket,
  adjacentKeys,
  defaultWidth,
  storageKey,
  epicActions,
  dragHandle,
  enableBackNavigation = false,
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
  /** Initial width when no width has been persisted yet (e.g. match a host pane). */
  defaultWidth?: number;
  /** localStorage key for the persisted width. Defaults to the shared board key. */
  storageKey?: string;
  /** Epic filter actions, surfaced in the more-menu when the open ticket is an
      epic (BRDG-131). Omitted outside the sprint board. */
  epicActions?: {
    onShowOnly: (epicName: string) => void;
    onShowAcrossAllSprints: (epicName: string) => void;
    onClear: () => void;
    isFiltered: boolean;
  };
  /** Optional drag handle rendered in the tab bar actions (BRDG-336: drag the
      open ticket onto a refinement session). The host page owns the DndContext
      and the draggable, keeping this panel dnd-agnostic. */
  dragHandle?: React.ReactNode;
  /** When true, drilling into a linked/child/related item opens it inside this
      same panel and pushes a back-stack entry, instead of bubbling the key to
      the host. A back control then returns to the previous item; Close still
      dismisses the whole panel. Hosts where "select" means "open here" (board,
      inbox, cleanup) opt in; hosts where it means "navigate elsewhere" (full
      ticket page, refinement preview) leave it off. */
  enableBackNavigation?: boolean;
}) {
  const router = useRouter();

  // Back-stack for in-panel drill-down (BRDG-456). Internal navigation keeps the
  // host's selection at the entry point, so the panel can walk into linked items
  // and step back without the host swapping (and remounting) the panel. Only the
  // top of the stack is displayed. The stack resets when the host opens a
  // different ticket (external key change); internal drill-downs never touch the
  // `ticket` prop, so this guard fires only on genuine external changes.
  const [navStack, setNavStack] = useState<string[]>([ticket.key]);
  const [rootKey, setRootKey] = useState(ticket.key);
  if (ticket.key !== rootKey) {
    setRootKey(ticket.key);
    setNavStack([ticket.key]);
  }
  const currentKey = navStack[navStack.length - 1];
  const canGoBack = navStack.length > 1;
  const previousKey = canGoBack ? navStack[navStack.length - 2] : null;

  // All ticket state and handlers come from the same hook the full ticket page
  // uses, so behaviour (editing, conflict, push, flag, follow, review/versions,
  // status/type) stays identical to /tickets/[key]. Keyed on the currently
  // displayed item so drill-down/back re-fetch the right ticket.
  const h = useTicketDetailPage(currentKey);
  const t = h.ticket ?? ticket;
  const detail = h.detail;
  // Subtasks have no review workflow, so the panel's "..." menu omits the Review entry (BRDG-333).
  const isSubtask = t.type === "subtask";

  // Refresh the panel's own detail cache and the board list together.
  const handleMutate = useCallback(() => {
    h.mutateTicket();
    onMutate?.();
  }, [h, onMutate]);

  // Refinement eligibility for the "Add to refinement" shortcut.
  const { sessions: refinementSessions } = useRefinementSessions();
  const isInRefinementSession = refinementSessions.some(
    (s) => s.status !== "completed" && s.ticketKeys.includes(currentKey),
  );

  // Readiness flows through the board (optimistic row update + persist); we then
  // revalidate the panel's own detail so the header pill reflects the new value.
  const handleReadinessChange = useCallback((v: TicketReadiness | null) => {
    onReadinessChange?.(v);
    h.mutateTicket();
  }, [onReadinessChange, h]);

  // Prefetch adjacent ticket details when this panel opens.
  useEffect(() => {
    if (adjacentKeys?.prev) prefetchTicketPage(adjacentKeys.prev);
    if (adjacentKeys?.next) prefetchTicketPage(adjacentKeys.next);
  }, [adjacentKeys]);

  // This panel opening IS the "ticket viewed" moment, both for board selection
  // and for child/linked previews on the ticket detail page (BRDG-330). Records
  // the currently displayed item so in-panel drill-downs count as views too.
  useEffect(() => {
    recordTicketView(currentKey, t.title);
  }, [currentKey, t.title]);

  // -- Panel width / resize --
  const widthKey = storageKey ?? PANEL_STORAGE_KEY;
  const initialWidth = defaultWidth ?? DEFAULT_PANEL_WIDTH;
  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window === "undefined") return initialWidth;
    const saved = localStorage.getItem(widthKey);
    if (!saved) return initialWidth;
    const parsed = parseInt(saved, 10);
    return !isNaN(parsed) ? Math.max(MIN_PANEL_WIDTH, parsed) : initialWidth;
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
      // Measure from the panel's own right edge rather than the viewport, so the
      // drag stays accurate when the panel is right-anchored to a host pane that
      // does not reach the viewport edge (e.g. the centered refinement layout).
      // On the board/ticket page the right edge equals the viewport edge, so
      // behaviour there is unchanged.
      const rightEdge = panelRef.current?.getBoundingClientRect().right ?? window.innerWidth;
      const newWidth = Math.max(MIN_PANEL_WIDTH, rightEdge - e.clientX);
      setPanelWidth(newWidth);
      localStorage.setItem(widthKey, String(newWidth));
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
  }, [isDragging, widthKey]);

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

  // Whether a meta column can fit at all: even at its minimum width it must
  // leave the content its minimum. When it can't, a column is never an option,
  // so the meta always stacks under the content and the "Show sidebar" toggle
  // is suppressed (offering it would only re-stack the same panel, BRDG).
  const canFitMetaColumn = panelWidth - MIN_META_WIDTH >= CONTENT_MIN_WIDTH;

  // Column only when not collapsed and there is room for both; otherwise the
  // meta drops below the content in a single scroll. Collapsing the meta (the
  // divider control / header button) and a too-narrow panel both fall back to
  // the stacked layout, so a collapsed meta stays visible under the content
  // rather than disappearing.
  const metaMode: "column" | "stacked" = !metaCollapsed && panelWidth - clampedMetaWidth >= CONTENT_MIN_WIDTH
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

  // Epics lead with their child-issue breakdown; everything else lands on Content.
  // Keyed on the displayed ticket so a panel that swaps tickets (drill-down or a
  // reused MultiSprintView instance) re-defaults, without clobbering user tab clicks.
  // Uses the adjust-state-during-render pattern keyed on the displayed ticket.
  const [tabDefaultedKey, setTabDefaultedKey] = useState<string | null>(null);
  if (t.key !== tabDefaultedKey) {
    setTabDefaultedKey(t.key);
    setActiveTab(t.type === "epic" ? "children" : "content");
  }

  const handleTabChange = (tab: TicketTab) => {
    if (tab === "history" && activeTab === "history") setHistoryResetKey((k) => k + 1);
    if (tab === "history" && h.showConflictWarning) h.setShowConflictDiff(true);
    setActiveTab(tab);
  };

  // -- Header action menus / dialogs --
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [showAddToRefinement, setShowAddToRefinement] = useState(false);
  const [showFlagDialog, setShowFlagDialog] = useState(false);
  // The merged tab/action bar scrolls away with the content; once it clears the
  // top a floating close button takes over so the panel is always dismissable.
  const [scrolled, setScrolled] = useState(false);

  // editState is the persisted truth (title or description), so a title-only edit
  // still surfaces the push button after a remount when the client-only flags reset.
  const hasLocalEdits = h.hasLocalTitleEdit || h.hasLocalDescEdit || t.editState === "local_edits";
  const isEditing = h.isTitleEditing || h.isDescEditing;
  const showPushButton = hasLocalEdits && !h.showConflictWarning && !isEditing;

  // Availability mirrors the board row / bulk menus: offer refinement for any
  // live ticket not already in a session. Readiness is not a gate here -- a PO
  // often wants to queue a not-yet-ready ticket precisely so it gets refined.
  const refineEligible = !t.removedFromJiraAt && t.jiraStatus !== "DONE" && t.jiraStatus !== "DEPRECATED"
    && !isInRefinementSession;

  const handleSelectTicket = useCallback((key: string) => {
    // In back-navigation mode, drilling stays inside this panel: push the key so
    // it becomes the displayed item and a step-back is possible. Clicking the
    // already-open item is a no-op rather than a duplicate stack entry.
    if (enableBackNavigation) {
      setNavStack((s) => (s[s.length - 1] === key ? s : [...s, key]));
      return;
    }
    if (onSelectTicket) onSelectTicket(key);
    else router.push(`/tickets/${key}`);
  }, [enableBackNavigation, onSelectTicket, router]);

  const handleBack = useCallback(() => {
    setNavStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  // Transparent icon buttons keep the header bar light; the boxed "ghost"
  // Button (persistent bg + border) reads as cluttered when several sit
  // side by side.
  const iconBtnClass = "inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-muted cursor-pointer hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] transition-colors duration-150";

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
        ? "h-full overflow-y-auto bg-surface-elevated py-5 px-5"
        // Stacked: a self-contained card lifts the meta off the surrounding
        // content/comments. overflow-hidden clips the full-bleed footer (PO Note /
        // Confluence / Development) to the rounded corners so the bottom edge
        // follows the card's radius and shadow instead of poking past them. The
        // field pickers render their dropdowns through a portal, so clipping the
        // card does not cut them off.
        : "overflow-hidden rounded-2xl border border-border-default bg-surface-elevated px-5 pt-5 pb-4"}
      style={metaMode === "column"
        ? { opacity: isMetaDragging ? 0.7 : 1, transition: isMetaDragging ? "none" : "opacity 150ms ease" }
        : { boxShadow: "var(--shadow-md)" }}
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
        className="absolute left-0 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full border border-border-default bg-surface-elevated text-text-muted cursor-pointer opacity-0 group-hover/meta:opacity-100 hover:text-text-secondary hover:border-[var(--color-brand-500)]/40 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        style={{ transition: "opacity 0.15s ease, color 0.15s ease, border-color 0.15s ease" }}
        aria-label="Collapse sidebar"
        title="Collapse sidebar"
      >
        <ChevronRight className="h-3 w-3" strokeWidth={2} />
      </button>
      {metaContent}
    </div>
  );

  // In-panel back control (BRDG-456): steps one item up the drill-down stack.
  // Rendered at the start of the tab bar, so it scrolls away with it; the
  // floating back button below keeps it reachable once the bar clears the top.
  const backControl = canGoBack ? (
    <Tooltip content={`Back to ${previousKey}`}>
      <button
        type="button"
        onClick={handleBack}
        aria-label={`Back to ${previousKey}`}
        className="inline-flex h-7 max-w-[8rem] items-center gap-1 rounded-lg pl-1 pr-2 text-caption font-medium text-text-muted cursor-pointer hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] transition-colors duration-150"
      >
        <ChevronLeft className="h-4 w-4 shrink-0" strokeWidth={2} />
        <span className="truncate">{previousKey}</span>
      </button>
    </Tooltip>
  ) : null;

  // Action buttons live on the right of the (scrolling) tab bar. They scroll
  // away with it; the floating close below keeps the panel dismissable.
  const headerActions = (
    <>
      {dragHandle}
      {t.editState === "local_edits" && (
        <span className="mr-1 inline-flex items-center">
          <EditStateDot state="local_edits" />
        </span>
      )}
      {showPushButton && (
        <Tooltip content="Push local edits to Jira">
          <Button
            variant="primary"
            size="md"
            iconOnly
            onClick={() => h.handlePushToJira()}
            disabled={h.isPushing}
            aria-label="Push to Jira"
            icon={h.isPushing
              ? <Loader2 size={13} strokeWidth={2} className="animate-spin" />
              : <CloudUpload size={13} strokeWidth={2.5} />}
          />
        </Tooltip>
      )}

      {metaCollapsed && canFitMetaColumn && (
        <Tooltip content="Show sidebar">
          <button
            type="button"
            onClick={() => setMetaCollapsed(false)}
            aria-label="Show sidebar"
            className={iconBtnClass}
          >
            <PanelRightClose size={14} strokeWidth={2} />
          </button>
        </Tooltip>
      )}

      <div className="relative">
        <button
          type="button"
          onClick={() => setMoreMenuOpen((v) => !v)}
          aria-label="More actions"
          title="More actions"
          className={iconBtnClass}
        >
          {h.isRefreshing
            ? <Loader2 size={14} strokeWidth={2} className="animate-spin" />
            : <MoreHorizontal size={14} strokeWidth={2} />}
        </button>
        <Popover open={moreMenuOpen} onClose={() => setMoreMenuOpen(false)} align="right">
          <div className="min-w-[220px] py-1">
            {/* Anchor (not a button) so cmd/ctrl/middle-click opens the full ticket
                in a new tab; plain click stays a client-side navigation. */}
            <Link
              href={`/tickets/${currentKey}`}
              className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong"
              style={{ transition: "background-color 0.1s ease" }}
            >
              <Maximize2 size={13} strokeWidth={1.5} className="text-text-muted" />
              Open full view
            </Link>
            <a
              href={`/tickets/${currentKey}/write`}
              className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong"
              style={{ transition: "background-color 0.1s ease" }}
            >
              <NotebookPen size={13} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
              {h.hasActiveSession ? "Resume story writer session" : "Open story writer"}
              {h.hasActiveSession && (
                <span className="relative ml-auto flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-[var(--color-brand-400)] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-brand-500)]" />
                </span>
              )}
            </a>
            {!isSubtask && (
              <button
                onClick={() => { setMoreMenuOpen(false); handleTabChange("review"); }}
                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                style={{ transition: "background-color 0.1s ease" }}
              >
                <ClipboardCheck size={13} strokeWidth={1.5} className={activeTab === "review" ? "text-[var(--color-brand-400)]" : "text-text-muted"} />
                Review
                {h.reviewCount > 0 && (
                  <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-brand-500)]/15 px-1 text-caption font-medium text-[var(--color-brand-400)]">
                    {h.reviewCount}
                  </span>
                )}
              </button>
            )}
            <div className="mx-2 my-1 h-px bg-overlay-default" />
            <button
              onClick={() => { setMoreMenuOpen(false); h.isFollowed ? h.unfollow(currentKey) : h.follow(currentKey); }}
              className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              style={{ transition: "background-color 0.1s ease" }}
            >
              <Star size={13} strokeWidth={1.5} className={h.isFollowed ? "text-amber-400 fill-amber-400" : "text-text-muted"} />
              {h.isFollowed ? "Unfollow ticket" : "Follow ticket"}
            </button>
            <button
              onClick={() => { setMoreMenuOpen(false); h.handleCopyLink(); }}
              className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
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
              className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              style={{ transition: "background-color 0.1s ease" }}
            >
              <CloudDownload size={13} strokeWidth={1.5} className="text-text-muted" />
              Pull from Jira
            </button>
            {!h.isFlagged ? (
              <button
                onClick={() => { setMoreMenuOpen(false); setShowFlagDialog(true); }}
                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                style={{ transition: "background-color 0.1s ease" }}
              >
                <Flag size={13} strokeWidth={1.5} className="text-text-muted" />
                Flag this ticket
              </button>
            ) : (
              <button
                onClick={() => { setMoreMenuOpen(false); h.handleUnflag(); }}
                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                style={{ transition: "background-color 0.1s ease" }}
              >
                <Flag size={13} strokeWidth={1.5} className="text-[var(--color-status-error)]" fill="var(--color-status-error)" />
                Remove flag
              </button>
            )}
            {(refineEligible || h.hasActiveSession) && (
              <div className="mx-2 my-1 h-px bg-overlay-default" />
            )}
            {refineEligible && (
              <button
                onClick={() => { setMoreMenuOpen(false); setShowAddToRefinement(true); }}
                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                style={{ transition: "background-color 0.1s ease" }}
              >
                <Boxes size={13} strokeWidth={1.5} className="text-text-muted" />
                Add to refinement
              </button>
            )}
            {h.hasActiveSession && (
              <button
                onClick={(e) => { setMoreMenuOpen(false); h.handleDeleteSession(e); }}
                disabled={h.isDeletingSession}
                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong disabled:opacity-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                style={{ transition: "background-color 0.1s ease" }}
              >
                <Trash2 size={13} strokeWidth={1.5} className="text-text-muted" />
                Delete writer session
              </button>
            )}
            <div className="mx-2 my-1 h-px bg-overlay-default" />
            <a
              href={`/chat?ticket=${currentKey}`}
              className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong"
              style={{ transition: "background-color 0.1s ease" }}
            >
              <MessageSquare size={13} strokeWidth={1.5} className="text-text-muted" />
              Chat about this ticket
            </a>
            {epicActions && t.type === "epic" && (
              <>
                <div className="mx-2 my-1 h-px bg-overlay-default" />
                <div className="px-3 pt-1 pb-0.5 text-caption font-medium uppercase tracking-wider text-text-muted">Epic</div>
                <button
                  onClick={() => { setMoreMenuOpen(false); epicActions.onShowOnly(t.title); }}
                  className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                  style={{ transition: "background-color 0.1s ease" }}
                >
                  <Filter size={13} strokeWidth={1.5} className="text-text-muted" />
                  Show only this epic
                </button>
                <button
                  onClick={() => { setMoreMenuOpen(false); epicActions.onShowAcrossAllSprints(t.title); }}
                  className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                  style={{ transition: "background-color 0.1s ease" }}
                >
                  <Layers size={13} strokeWidth={1.5} className="text-text-muted" />
                  Show across all sprints
                </button>
                {epicActions.isFiltered && (
                  <button
                    onClick={() => { setMoreMenuOpen(false); epicActions.onClear(); }}
                    className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                    style={{ transition: "background-color 0.1s ease" }}
                  >
                    <FilterX size={13} strokeWidth={1.5} className="text-text-muted" />
                    Clear epic filter
                  </button>
                )}
              </>
            )}
          </div>
        </Popover>
      </div>

      <Tooltip content="Close panel">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className={iconBtnClass}
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </Tooltip>
    </>
  );

  const tabContent = (
    <TicketTabContent
      layout="panel"
      renderTabBar={true}
      reviewInMenu={true}
      tabBarLeading={backControl}
      tabBarActions={headerActions}
      onScrolledChange={setScrolled}
      metaContent={metaMode === "stacked" ? metaContent : undefined}
      ticketKey={currentKey}
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
      metadataOnlyConflict={h.metadataOnlyConflict}
      isDiscarding={h.isDiscarding}
      discardError={h.discardError}
      isPushing={h.isPushing}
      pushError={h.pushError}
      overrideConfirmed={h.overrideConfirmed}
      onOverrideChange={h.setOverrideConfirmed}
      onDiscardDraft={h.handleDiscardDraft}
      onPushToJira={h.handlePushToJira}
      onMutate={handleMutate}
      onSubtaskStatusOptimistic={h.handleSubtaskJiraStatusChange}
      onEpicChildOptimistic={h.handleEpicChildPatch}
      onConflictResolved={h.handleConflictResolved}
      onRestored={h.handleRestored}
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
      className="relative z-10 flex h-full shrink-0 flex-col border-l border-border-default bg-surface-elevated"
      style={{ width: `${panelWidth}px`, minWidth: MIN_PANEL_WIDTH }}
    >
      {/* Resize drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 left-0 z-20 h-full w-1 cursor-col-resize hover:bg-[var(--color-brand-500)]/30 active:bg-[var(--color-brand-500)]/50"
        style={isDragging ? { backgroundColor: "var(--color-drag-active)" } : {}}
      />

      {/* Floating back: mirrors the floating close, but top-left, so stepping
          back up the drill-down stack stays reachable once the in-bar back has
          scrolled away. Same visibility gate as the floating close. */}
      {canGoBack && (
        <Tooltip content={`Back to ${previousKey}`}>
          <button
            type="button"
            onClick={handleBack}
            aria-label={`Back to ${previousKey}`}
            className={`absolute left-3 top-3 z-30 inline-flex h-7 max-w-[9rem] items-center gap-1 rounded-full border border-border-default bg-surface-elevated pl-2 pr-3 text-caption font-medium text-text-muted cursor-pointer hover:text-text-secondary hover:border-[var(--color-brand-500)]/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${scrolled && !h.isDescEditing && !h.isTitleEditing ? "opacity-100" : "pointer-events-none opacity-0"}`}
            style={{ transition: "opacity 0.2s ease, color 0.15s ease, border-color 0.15s ease", boxShadow: "0 6px 16px -4px rgba(15, 23, 42, 0.20)" }}
          >
            <ChevronLeft className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            <span className="truncate">{previousKey}</span>
          </button>
        </Tooltip>
      )}

      {/* Floating close: the in-bar close scrolls away with the merged tab bar,
          so this fades in once the bar clears the top to keep the panel
          dismissable. Hidden while editing, since the sticky editor toolbar
          (with its own Save/Done controls) occupies the same top-right corner. */}
      <Tooltip content="Close panel">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className={`absolute right-3 top-3 z-30 flex h-7 w-7 items-center justify-center rounded-full border border-border-default bg-surface-elevated text-text-muted cursor-pointer hover:text-text-secondary hover:border-[var(--color-brand-500)]/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${scrolled && !h.isDescEditing && !h.isTitleEditing ? "opacity-100" : "pointer-events-none opacity-0"}`}
          style={{ transition: "opacity 0.2s ease, color 0.15s ease, border-color 0.15s ease", boxShadow: "0 6px 16px -4px rgba(15, 23, 42, 0.20)" }}
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </Tooltip>

      {/* Body: tabbed content (+ meta column when wide and not collapsed; the
          meta stacks under the Content tab when narrow or when collapsed) */}
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
            className="w-full resize-none rounded-lg border border-border-default bg-surface-base px-3 py-2 text-body-sm leading-relaxed text-text-primary placeholder:text-text-muted focus:border-[var(--color-brand-400)] focus:outline-none"
          />
        }
      />

      <AddToRefinementModal
        open={showAddToRefinement}
        onClose={() => setShowAddToRefinement(false)}
        ticketKeys={[currentKey]}
      />
    </div>
  );
}
