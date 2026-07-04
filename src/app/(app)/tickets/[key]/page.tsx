"use client";

import { useState, use, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { usePageTitle } from "@/hooks/usePageTitle";
import Link from "next/link";
import {
  CloudUpload,
  FileCheck2,
  Flag,
  Loader2,
  MoreHorizontal,
  NotebookPen,
  Trash2,
  Star,
  Check,
  PanelRightClose,
  MessageSquareText,
  Boxes,
  Copy,
  CloudDownload,
  CornerLeftUp,
} from "lucide-react";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { Tooltip } from "@/components/shared/Tooltip";
import { ViewHeader } from "@/components/shared/ViewHeader";
import { Toast } from "@/components/ui/Toast";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import dynamic from "next/dynamic";
import { TicketSidebar, SIDEBAR_COLLAPSED_KEY, SIDEBAR_WIDTH_KEY, DEFAULT_SIDEBAR_WIDTH } from "@/components/ticket-detail/TicketSidebar";
import { TicketTabContent, type TicketTab } from "@/components/ticket-detail/TicketTabContent";

// The clicked child issue opens in the same rich panel the sprint board uses,
// so child-ticket management is identical across both surfaces (BRDG-275).
// The persisted meta-sidebar width, read eagerly so the lazy panel's loading
// placeholder can reserve the exact column footprint (avoids a cold-cache flash).
function readSidebarWidth(): number {
  if (typeof window === "undefined") return DEFAULT_SIDEBAR_WIDTH;
  const saved = parseInt(localStorage.getItem(SIDEBAR_WIDTH_KEY) ?? "", 10);
  return Number.isNaN(saved) ? DEFAULT_SIDEBAR_WIDTH : saved;
}

const SidePanel = dynamic(
  () => import("@/components/sprint-board/SidePanel").then((m) => ({ default: m.SidePanel })),
  {
    ssr: false,
    // On the very first open after a hard reload the chunk is not cached yet;
    // hold the sidebar's width so the content column does not flash to full
    // width before the panel mounts. Warm-cache opens never show this.
    loading: () => (
      <div
        className="h-full shrink-0 border-l border-border-default bg-surface-elevated"
        style={{ width: readSidebarWidth() }}
      />
    ),
  },
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
const TestDocReviewModal = dynamic(
  () => import("@/components/sprint-board/TestDocReviewModal").then((m) => ({ default: m.TestDocReviewModal })),
  { ssr: false },
);
import { Button } from "@/components/ui/Button";
import { Popover } from "@/components/shared/Popover";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useTicketDetailPage } from "@/hooks/useTicketDetailPage";
import { useTicketDetail } from "@/hooks/useSprintBoard";
import { useHoverData } from "@/hooks/useTicketHoverData";
import type { Ticket } from "@/types/ticket";
import { saveTicketMetadata } from "@/components/sprint-board/sprint-board-utils";
import { useRefinementSessions } from "@/hooks/useRefinementSessions";
import { buildTicketDetailUrl, defaultTicketTab, resolveTicketTab } from "@/lib/ticket-detail-url";


const TICKET_CHAT_STORAGE_KEY = "ticket-chat-width";
const TICKET_CHAT_DEFAULT_WIDTH = 400;
const TICKET_CHAT_MIN_WIDTH = 320;
const TICKET_CHAT_MAX_WIDTH = 600;

function clampChatWidth(width: number): number {
  return Math.max(TICKET_CHAT_MIN_WIDTH, Math.min(TICKET_CHAT_MAX_WIDTH, width));
}

export default function TicketDetailPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key: routeKey } = use(params);
  const h = useTicketDetailPage(routeKey);
  // A DRAFT-xxx key that has been finalized resolves server-side to its real
  // Jira key (exposed as apiData.key). Adopt that key for display, navigation
  // and the URL so the page reflects the real ticket instead of the dead draft
  // key. Mirrors the silent URL swap the /write page does via useDraftSync.
  const key = h.apiData?.key ?? routeKey;
  useEffect(() => {
    if (routeKey.startsWith("DRAFT-") && key !== routeKey) {
      // Keep ?ticket=/?tab= view state alive across the silent key swap.
      window.history.replaceState(null, "", `/tickets/${encodeURIComponent(key)}${window.location.search}`);
    }
  }, [routeKey, key]);
  // URL is the source of truth for the active tab and the open child panel
  // (BRDG-329): refresh, share and back/forward reproduce the exact view.
  // Both are derived during render (no state, no effects), which also keeps
  // the React Compiler's no-setState-in-effect rule happy. useSearchParams()
  // stays in sync with history.pushState, so no popstate listener is needed
  // (same mechanism the sprint board relies on, BRDG-270).
  const searchParams = useSearchParams();
  const { sessions: refinementSessions } = useRefinementSessions();
  // A ticket already in an unfinished refinement should not offer the shortcut;
  // completed sessions are historical and don't block re-adding it later.
  const isInRefinementSession = refinementSessions.some(
    (s) => s.status !== "completed" && s.ticketKeys.includes(key),
  );
  const pageTitle = usePageTitle(h.apiData ? `${key} - ${h.effectiveTitle ?? h.apiData.title}` : key);

  // Same editable hover card the sprint board shows on the key pill, resolved
  // on-demand for just this ticket (BRDG-412). Returns undefined for
  // Jira-only/removed tickets, in which case the pill simply renders no card.
  const getHoverData = useHoverData(key ? [key] : []);

  const [chatPaneOpen, setChatPaneOpen] = useState(false);
  const [chatPaneWidth, setChatPaneWidth] = useState(() => {
    if (typeof window === "undefined") return TICKET_CHAT_DEFAULT_WIDTH;
    const saved = localStorage.getItem(TICKET_CHAT_STORAGE_KEY);
    if (!saved) return TICKET_CHAT_DEFAULT_WIDTH;
    const parsed = parseInt(saved, 10);
    return !isNaN(parsed) ? clampChatWidth(parsed) : TICKET_CHAT_DEFAULT_WIDTH;
  });
  const [isChatResizing, setIsChatResizing] = useState(false);
  const chatResizeStartX = useRef(0);
  const chatResizeStartWidth = useRef(0);

  const handleChatResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      chatResizeStartX.current = e.clientX;
      chatResizeStartWidth.current = chatPaneWidth;
      setIsChatResizing(true);
    },
    [chatPaneWidth],
  );

  useEffect(() => {
    if (!isChatResizing) return;

    // Dragging the left edge leftwards grows the sidebar, so width increases as
    // the cursor moves toward smaller clientX. Delta-from-start keeps the drag
    // stable regardless of where the pane sits in the row layout.
    function handleMouseMove(e: MouseEvent) {
      const delta = chatResizeStartX.current - e.clientX;
      const newWidth = clampChatWidth(chatResizeStartWidth.current + delta);
      setChatPaneWidth(newWidth);
      localStorage.setItem(TICKET_CHAT_STORAGE_KEY, String(newWidth));
    }

    function handleMouseUp() {
      setIsChatResizing(false);
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
  }, [isChatResizing]);
  // Epics lead with their child-issue breakdown; everything else lands on
  // Content. An invalid, stale, or type-unavailable ?tab= degrades to that
  // default; the default itself is kept out of the URL (canonical bare link).
  const activeTab = resolveTicketTab(searchParams.get("tab"), h.ticket?.type ?? "");
  const [historyResetKey, setHistoryResetKey] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage(SIDEBAR_COLLAPSED_KEY, false);
  // The open child panel is URL-driven (?ticket=). An unknown or stale key
  // degrades gracefully: previewTicket resolves to null and no panel renders.
  const previewTicketKey = searchParams.get("ticket") || null;
  // Open/close the panel and switch tabs by writing to the URL with pushState
  // rather than router.push: a route navigation would remount this heavy page,
  // while pushState keeps it mounted and back/forward still walk the history
  // (mirrors selectTicket on the sprint board). Tab changes preserve the open
  // panel and vice versa; an invalid ?tab= is dropped instead of carried along.
  const ticketType = h.ticket?.type ?? "";
  const selectTicket = useCallback((next: string | null) => {
    const tab = searchParams.get("tab");
    const keepTab = tab && resolveTicketTab(tab, ticketType) === tab ? tab : null;
    window.history.pushState(null, "", buildTicketDetailUrl(key, { ticket: next, tab: keepTab }));
  }, [key, searchParams, ticketType]);
  const selectTab = useCallback((tab: TicketTab) => {
    const next = tab === defaultTicketTab(ticketType) ? null : tab;
    window.history.pushState(null, "", buildTicketDetailUrl(key, { ticket: searchParams.get("ticket"), tab: next }));
  }, [key, searchParams, ticketType]);
  // Build a lightweight Ticket from the child row the page already has so the panel
  // opens instantly and switching between children never blanks out (no close-then-open).
  // The panel re-derives full content via its own useTicketDetailPage; this only needs to
  // satisfy the initial header render. Fall back to a fetch only for keys that are not in
  // the current child list (e.g. a drill-down to a referenced ticket inside the panel).
  const previewLightTicket = useMemo<Ticket | null>(() => {
    if (!previewTicketKey || !h.detail) return null;
    const epicChild = h.detail.epicChildren?.find((c) => c.key === previewTicketKey) ?? null;
    const subtask = epicChild ? null : (h.detail.subtasks?.find((s) => s.key === previewTicketKey) ?? null);
    const child = epicChild ?? subtask;
    if (!child) return null;
    return {
      key: child.key,
      title: child.title,
      type: child.type,
      epic: null,
      epicKey: null,
      jiraStatus: child.jiraStatus,
      storyPoints: epicChild?.storyPoints ?? null,
      assignee: child.assignee,
      flagged: false,
      readiness: epicChild?.readiness ?? null,
      poStatus: null,
      qualityScore: null,
      businessValue: epicChild?.businessValue ?? null,
      editState: "clean",
      notes: "",
    };
  }, [previewTicketKey, h.detail]);
  const previewFetch = useTicketDetail(previewTicketKey && !previewLightTicket ? previewTicketKey : null);
  const previewTicket = previewLightTicket ?? previewFetch.data ?? null;
  // Adjacency drives the panel's neighbour prefetch. Derive prev/next from the
  // page's own child list (epic children or subtasks), mirroring the board.
  const previewAdjacentKeys = useMemo(() => {
    if (!previewTicketKey || !h.detail) return undefined;
    const list = h.ticket?.type === "epic"
      ? (h.detail.epicChildren ?? []).map((c) => c.key)
      : (h.detail.subtasks ?? []).map((s) => s.key);
    const idx = list.indexOf(previewTicketKey);
    if (idx === -1) return undefined;
    return {
      prev: idx > 0 ? list[idx - 1] : null,
      next: idx < list.length - 1 ? list[idx + 1] : null,
    };
  }, [previewTicketKey, h.detail, h.ticket?.type]);
  // Warm the lazy SidePanel chunk as soon as the ticket has openable children,
  // so the first child click after a hard reload swaps in without waiting on the
  // chunk download. The dynamic import dedupes this with the real open.
  const hasOpenableChildren = Boolean(
    (h.detail?.epicChildren?.length ?? 0) > 0 || (h.detail?.subtasks?.length ?? 0) > 0,
  );
  useEffect(() => {
    if (hasOpenableChildren) void import("@/components/sprint-board/SidePanel");
  }, [hasOpenableChildren]);

  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [showAddToRefinement, setShowAddToRefinement] = useState(false);
  const [showFlagDialog, setShowFlagDialog] = useState(false);
  // Test-doc review modal (BRDG-426), reusing the board's generate/review flow.
  // autoGenerate is false when a doc/draft already exists (open read-only).
  const [testDocReview, setTestDocReview] = useState<{ autoGenerate: boolean } | null>(null);

  // editState is the persisted truth (title or description), so a title-only edit
  // still surfaces the push button after a remount when the client-only flags reset.
  const hasLocalEdits = h.hasLocalTitleEdit || h.hasLocalDescEdit || h.ticket?.editState === "local_edits";
  const isEditing = h.isTitleEditing || h.isDescEditing;
  const showPushButton = hasLocalEdits && !h.showConflictWarning && !isEditing;

  const handleTabChange = (tab: TicketTab) => {
    if (tab === "history" && activeTab === "history") {
      setHistoryResetKey((k) => k + 1);
    }
    if (tab === "history" && h.showConflictWarning) {
      h.setShowConflictDiff(true);
    }
    selectTab(tab);
  };

  if (h.ticketLoading) {
    return (
      <>
        {pageTitle}
        <div className="flex h-full flex-col">
          <ViewHeader hideContextDivider>
            <div className="h-5 w-16 animate-pulse rounded bg-overlay-strong" />
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
            <div className="w-[320px] shrink-0 border-l border-border-default bg-surface-chrome">
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
            <ViewHeader hideContextDivider>
              <div className="h-5 w-16 animate-pulse rounded bg-overlay-strong" />
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
              <div className="w-[320px] shrink-0 border-l border-border-default bg-surface-chrome" />
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
                className="mt-4 inline-block rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-body-lg font-medium text-white cursor-pointer hover:bg-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
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

  // Epics are worked out in the Epic Writer, everything else in the Story Writer.
  const isEpic = ticket.type === "epic";
  const writeHref = isEpic ? `/epics/${key}/write` : `/tickets/${key}/write`;

  return (
    <>
      {pageTitle}
      <ErrorBoundary>
    <div className="flex h-full flex-col">

      <ViewHeader
        hideContextDivider
        actions={
          <div className="flex shrink-0 items-center gap-2">
            {h.detail?.parent && (
              <nav className="hidden lg:flex shrink-0 items-center gap-1.5">
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
                  className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--color-status-error)]/25 bg-[var(--color-status-error)]/10 px-2 py-0.5 text-label font-semibold text-[var(--color-status-error)] hover:bg-[var(--color-status-error)]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-status-error)]/40 active:scale-[0.97]"
                  style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
                >
                  <Flag size={11} strokeWidth={1.5} fill="var(--color-status-error)" />
                  Flagged
                </button>
              </Tooltip>
            )}
            {(h.detail?.parent || h.isFlagged) && (
              <div className="h-5 w-px shrink-0 bg-overlay-default" />
            )}
            {showPushButton && (
              <Button
                variant="primary"
                size="md"
                onClick={() => h.handlePushToJira()}
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
            {!ticket.removedFromJiraAt && ticket.jiraStatus !== "DONE" && ticket.jiraStatus !== "DEPRECATED" && ticket.readiness === "ready_to_refine" && !isInRefinementSession && (
              <button
                onClick={() => setShowAddToRefinement(true)}
                className="flex h-7 items-center gap-1.5 rounded-md border border-[var(--color-brand-500)]/25 bg-[var(--color-brand-500)]/10 px-2.5 text-body-sm font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-[var(--color-brand-500)]/20 hover:border-[var(--color-brand-500)]/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
                style={{ transition: "background-color 0.15s ease, border-color 0.15s ease, transform 0.1s ease" }}
              >
                <Boxes size={13} strokeWidth={1.5} />
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
                    onClick={() => { setMoreMenuOpen(false); setChatPaneOpen((v) => !v); }}
                    className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                    style={{ transition: "background-color 0.1s ease" }}
                  >
                    <MessageSquareText
                      size={13}
                      strokeWidth={1.5}
                      className={chatPaneOpen ? "text-[var(--color-chat-accent)]" : "text-text-muted"}
                    />
                    {chatPaneOpen ? "Close ticket chat" : "Open ticket chat"}
                  </button>
                  <div className="mx-2 my-1 h-px bg-overlay-default" />
                  <button
                    onClick={() => { setMoreMenuOpen(false); h.isFollowed ? h.unfollow(key) : h.follow(key); }}
                    className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
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
                    className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
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
                  <div className="mx-2 my-1 h-px bg-overlay-default" />
                  <button
                    onClick={() => { setMoreMenuOpen(false); setShowAddToRefinement(true); }}
                    className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                    style={{ transition: "background-color 0.1s ease" }}
                  >
                    <Boxes size={13} strokeWidth={1.5} className="text-text-muted" />
                    Add to refinement
                  </button>
                  {ticket.type !== "subtask" && !isEpic && (() => {
                    const hasTestDoc = ticket.testDocState === "draft" || ticket.testDocState === "accepted";
                    return (
                      <button
                        onClick={() => { setMoreMenuOpen(false); setTestDocReview({ autoGenerate: !hasTestDoc }); }}
                        className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary hover:bg-overlay-default active:bg-overlay-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                        style={{ transition: "background-color 0.1s ease" }}
                      >
                        <FileCheck2 size={13} strokeWidth={1.5} className={hasTestDoc ? "text-[var(--color-brand-400)]" : "text-text-muted"} />
                        {hasTestDoc ? "View test doc" : "Generate test doc"}
                      </button>
                    );
                  })()}
                </div>
              </Popover>
            </div>
            {h.hasActiveSession ? (
              <div
                className="group/session flex h-7 items-center rounded-md border border-[var(--color-brand-500)]/40 bg-[var(--color-brand-500)]/15 shadow-[0_2px_8px_color-mix(in_srgb,var(--color-brand-600)_12%,transparent)]"
                style={{ transition: "border-color 0.15s ease" }}
              >
                <Link
                  href={writeHref}
                  className="flex h-7 items-center gap-1.5 rounded-l-md px-2.5 text-body-sm font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-[var(--color-brand-500)]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
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
                href={writeHref}
                className="flex h-7 items-center gap-1.5 rounded-md border border-[var(--color-brand-500)]/25 bg-[var(--color-brand-500)]/10 px-2.5 text-body-sm font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-[var(--color-brand-500)]/20 hover:border-[var(--color-brand-500)]/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] shadow-[0_2px_8px_color-mix(in_srgb,var(--color-brand-600)_12%,transparent)]"
                style={{ transition: "background-color 0.15s ease, border-color 0.15s ease, transform 0.1s ease" }}
              >
                <NotebookPen size={13} strokeWidth={1.5} />
                {isEpic ? "Epic writer" : "Story writer"}
              </Link>
            )}
            {/* Epics have no meta sidebar to reopen (BRDG-386); the affordance
                only applies to types that still carry the right-rail. */}
            {sidebarCollapsed && !isEpic && (
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
        <span className={`inline-flex rounded-full ${h.liveChangeKinds.has("status") ? "live-pulse" : ""}`}>
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
            onHeader
            removedFromJira={Boolean(ticket.removedFromJiraAt)}
            hoverData={getHoverData(key)}
          />
        </span>
        <span className="min-w-0 flex-1 truncate font-[var(--font-display)] text-heading-sm font-semibold tracking-tight text-text-primary">
          {h.effectiveTitle ?? ticket.title}
        </span>
      </ViewHeader>

      <div className="flex flex-1 overflow-hidden">
        <TicketTabContent
          ticketKey={key}
          ticket={ticket}
          detail={h.detail}
          reviewData={h.reviewData}
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
          onClearPushError={h.clearPushError}
          overrideConfirmed={h.overrideConfirmed}
          onOverrideChange={h.setOverrideConfirmed}
          onDiscardDraft={h.handleDiscardDraft}
          onPushToJira={h.handlePushToJira}
          onMutate={h.mutateTicket}
          onSubtaskStatusOptimistic={h.handleSubtaskJiraStatusChange}
          onEpicChildOptimistic={h.handleEpicChildPatch}
          onConflictResolved={h.handleConflictResolved}
          onRestored={h.handleRestored}
          editSaver={h.editSaver}
          onDraftConflictReload={h.handleDraftConflictReload}
          onSelectTicket={selectTicket}
          onReadinessChange={h.handleReadinessChange}
          activeChildKey={previewTicketKey}
          reviewCount={h.reviewCount}
          versionCount={h.versionCount}
          historyResetKey={historyResetKey}
          isFlagged={h.isFlagged}
          liveCommentHighlight={h.liveChangeKinds.has("comment")}
        />

      {chatPaneOpen && ticket && (
        <div
          className="relative shrink-0 border-l border-border-default bg-surface-elevated overflow-hidden"
          style={{ width: `${chatPaneWidth}px`, animation: "fadeInUp 0.15s ease" }}
        >
          {/* Resize drag handle on the left edge */}
          <div
            onMouseDown={handleChatResizeMouseDown}
            className="absolute top-0 left-0 z-20 h-full w-1 cursor-col-resize hover:bg-[var(--color-brand-500)]/30 active:bg-[var(--color-brand-500)]/50"
            style={isChatResizing ? { backgroundColor: "var(--color-drag-active)" } : { transition: "background-color 0.15s ease" }}
          />
          <TicketChatPane
            ticketKey={key}
            onClose={() => setChatPaneOpen(false)}
          />
        </div>
      )}

      {/* The child preview panel takes the right column when open; the page's
          own meta sidebar steps aside so we mirror the board's content+panel
          layout instead of stacking two sidebars. */}
      {previewTicketKey && previewTicket ? (
        // The child panel inherits the meta sidebar's persisted width + storage
        // key so it opens on the exact footprint the sidebar vacated, leaving the
        // content column to its left unmoved. The opacity-only fade (re-keyed per
        // child) softens the swap without nudging layout.
        <div key={previewTicketKey} className="h-full shrink-0" style={{ animation: "fadeIn 0.15s ease" }}>
          <SidePanel
            ticket={previewTicket}
            poStatus={previewTicket.poStatus ?? null}
            readiness={previewTicket.readiness ?? null}
            onPoStatusChange={(v) => { void saveTicketMetadata(previewTicketKey, { poStatus: v }); }}
            onReadinessChange={(v) => { void saveTicketMetadata(previewTicketKey, { readiness: v }); h.mutateTicket(); }}
            onNotesChange={(notes) => { void saveTicketMetadata(previewTicketKey, { poNotes: notes }); }}
            onClose={() => selectTicket(null)}
            onShowToast={() => {}}
            onMutate={h.mutateTicket}
            onSelectTicket={selectTicket}
            adjacentKeys={previewAdjacentKeys}
            defaultWidth={DEFAULT_SIDEBAR_WIDTH}
            storageKey={SIDEBAR_WIDTH_KEY}
          />
        </div>
      ) : !isEpic ? (
        <div key="ticket-meta" className="sticky top-0 min-h-full self-stretch overflow-visible" style={{ animation: "fadeIn 0.15s ease" }}>
          <TicketSidebar ticket={ticket} detail={h.detail} reviewData={h.reviewData} collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} onNavigateToReview={() => selectTab("review")} onNavigateToDev={() => selectTab("development")} onReadinessChange={h.handleReadinessChange} />
        </div>
      ) : null}
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
          className="w-full resize-none rounded-lg border border-border-default bg-surface-base px-3 py-2 text-body-sm leading-relaxed text-text-primary placeholder:text-text-muted focus:border-[var(--color-brand-400)] focus:outline-none"
        />
      }
    />
    <AddToRefinementModal
      open={showAddToRefinement}
      onClose={() => setShowAddToRefinement(false)}
      ticketKeys={[key]}
    />
    {testDocReview && (
      <TestDocReviewModal
        keys={[key]}
        autoGenerate={testDocReview.autoGenerate}
        onClose={() => setTestDocReview(null)}
      />
    )}
    <Toast toast={h.toast} loading={h.toastLoading} onDismiss={h.dismissToast} />
    </>
  );
}
