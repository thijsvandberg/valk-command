"use client";

import { use, useEffect, useCallback, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useRefinementSession } from "@/contexts/RefinementSessionContext";
import { useTicketDetail, useTickets } from "@/hooks/useSprintBoard";
import { refinementSessions as refinementSessionsApi } from "@/lib/api-client";
import { SessionTicketView, SessionMetadataPanel } from "@/components/refinement-session/SessionTicketView";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { StoryPointPicker } from "@/components/shared/StoryPointPicker";
import { SessionEndModal } from "@/components/refinement-session/SessionEndModal";
import { SubtasksSection } from "@/components/ticket-detail/SubtasksSection";
import { TicketChatPane } from "@/components/shared/TicketChatPane";
import { tickets, apiFetch } from "@/lib/api-client";
import { mutate as globalMutate } from "swr";
import type { TicketReadiness } from "@/types/ticket";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { BridgeMark } from "@/components/shared/BridgeMark";
import {
  MoreHorizontal,
  LogOut,
  ChevronLeft,
  ChevronRight,
  StickyNote,
  SquareMinus,
  List,
  GripVertical,
  Info,
  MessageSquareText,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";

function SortableQueueItem({
  ticketKey,
  title,
  isCurrent,
  onClick,
}: {
  ticketKey: string;
  title: string;
  isCurrent: boolean;
  onClick: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ticketKey });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    zIndex: isDragging ? 10 : undefined,
    position: "relative" as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex w-full items-center gap-2 px-3 py-2 hover:bg-hover-list-item active:bg-overlay-default ${
        isCurrent ? "bg-overlay-subtle" : ""
      } ${isDragging ? "bg-[var(--color-surface-elevated)] shadow-[var(--shadow-lg)] rounded-lg" : ""}`}
    >
      <span
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab text-text-muted opacity-40 hover:opacity-100 active:cursor-grabbing"
        style={{ transition: "opacity 0.15s ease" }}
      >
        <GripVertical size={12} strokeWidth={1.5} />
      </span>
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
      >
        <span className="shrink-0 font-mono text-body-sm text-[var(--color-brand-400)]">{ticketKey}</span>
        <span className="min-w-0 flex-1 truncate text-body-sm text-text-secondary">{title}</span>
        {isCurrent && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand-500)]" />
        )}
      </button>
    </div>
  );
}

const MIN_PANE_WIDTH = 320;
const MAX_PANE_WIDTH_RATIO = 0.5;

function getDefaultPaneWidth() {
  if (typeof window === "undefined") return 400;
  return Math.max(MIN_PANE_WIDTH, Math.round(window.innerWidth * 0.3));
}

function SubtasksPaneResizable({ children, width, onWidthChange }: { children: React.ReactNode; width: number; onWidthChange: (w: number) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const paneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDragging) return;
    function handleMouseMove(e: MouseEvent) {
      if (!paneRef.current) return;
      const rect = paneRef.current.getBoundingClientRect();
      const maxW = window.innerWidth * MAX_PANE_WIDTH_RATIO;
      const newW = Math.max(MIN_PANE_WIDTH, Math.min(maxW, rect.right - e.clientX));
      onWidthChange(newW);
    }
    function handleMouseUp() { setIsDragging(false); }
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
  }, [isDragging, onWidthChange]);

  return (
    <div
      ref={paneRef}
      className="group/pane relative shrink-0 overflow-y-auto border-l border-border-subtle bg-[var(--color-surface-elevated)] px-6 pt-4 pb-6"
      style={{
        width,
        animation: isDragging ? undefined : "fadeInUp 0.15s ease",
        transition: isDragging ? "none" : "width 200ms cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={(e) => { e.preventDefault(); setIsDragging(true); }}
        className="absolute top-0 left-0 z-20 h-full w-1 cursor-col-resize hover:bg-[var(--color-brand-500)]/30 active:bg-[var(--color-brand-500)]/50"
        style={isDragging ? { backgroundColor: "rgba(46, 145, 73, 0.5)" } : {}}
      />
      {children}
    </div>
  );
}

export default function RefinementSessionTicketPage({
  params,
}: {
  params: Promise<{ sessionId: string; ticketKey: string }>;
}) {
  const { sessionId, ticketKey: rawTicketKey } = use(params);
  const ticketKeyFromUrl = decodeURIComponent(rawTicketKey);
  const pageTitle = usePageTitle("Refinement Session");
  const router = useRouter();
  const {
    queue,
    queueMeta,
    currentIndex,
    sessionActive,
    showingEndModal,
    activeSidebarPanel,
    savedSessionId,
    startSession,
    nextTicket,
    prevTicket,
    goToTicket,
    toggleSidebarPanel,
    reorderQueue,
    openEndModal,
    closeEndModal,
    saveSession,
    finishSession,
  } = useRefinementSession();

  // Persisted sidebar width (shared across all sidebar panels and sessions)
  const [sidebarWidth, setSidebarWidth] = useLocalStorage("bridge:refinement-sidebar-width", getDefaultPaneWidth());

  // Persisted zoom level for refinement session content
  const [zoomLevel, setZoomLevel] = useLocalStorage<100 | 120>("bridge:refinement-zoom", 120);

  // Re-hydrate session from DB when context is empty (page refresh)
  const [rehydrating, setRehydrating] = useState(false);
  const rehydratedRef = useRef(false);
  const { data: allTickets } = useTickets("__all__");

  useEffect(() => {
    if (queue.length > 0 || rehydratedRef.current || rehydrating) return;
    if (!allTickets || allTickets.length === 0) return;

    rehydratedRef.current = true;
    setRehydrating(true);

    refinementSessionsApi.get(sessionId).then((session) => {
      if (!session || session.ticketKeys.length === 0) {
        router.replace(`/refinement/${sessionId}`);
        return;
      }

      const meta = session.ticketKeys.map((key) => {
        const t = allTickets.find((ticket) => ticket.key === key);
        return { key, title: t?.title ?? key };
      });

      const startIdx = session.ticketKeys.indexOf(ticketKeyFromUrl);
      startSession(
        session.ticketKeys,
        meta,
        sessionId,
        startIdx >= 0 ? startIdx : 0,
      );
      setRehydrating(false);
    }).catch(() => {
      router.replace(`/refinement/${sessionId}`);
    });
  }, [queue.length, rehydrating, allTickets, sessionId, ticketKeyFromUrl, startSession, router]);

  // Sync context index when URL ticketKey doesn't match current queue position
  const urlSyncedRef = useRef(false);
  useEffect(() => {
    if (queue.length === 0) return;
    const currentKey = queue[currentIndex];
    if (currentKey === ticketKeyFromUrl) {
      urlSyncedRef.current = true;
      return;
    }
    // URL has a different ticket than context; sync context to URL (only on initial load)
    if (!urlSyncedRef.current) {
      const idx = queue.indexOf(ticketKeyFromUrl);
      if (idx >= 0) {
        goToTicket(idx);
      }
      urlSyncedRef.current = true;
    }
  }, [queue, currentIndex, ticketKeyFromUrl, goToTicket]);

  // Sync URL when context currentIndex changes (user navigated via next/prev/goTo)
  const prevIndexRef = useRef(currentIndex);
  useEffect(() => {
    if (queue.length === 0) return;
    if (prevIndexRef.current === currentIndex) return;
    prevIndexRef.current = currentIndex;

    const newKey = queue[currentIndex];
    if (newKey && newKey !== ticketKeyFromUrl) {
      router.replace(`/refinement/${sessionId}/session/${encodeURIComponent(newKey)}`);
    }
  }, [currentIndex, queue, ticketKeyFromUrl, sessionId, router]);

  // Fullscreen: hide sidebar + header
  useEffect(() => {
    document.body.classList.add("refinement-session-active");
    return () => document.body.classList.remove("refinement-session-active");
  }, []);

  // Redirect if no session and not rehydrating
  useEffect(() => {
    if (queue.length === 0 && !rehydrating && rehydratedRef.current) {
      router.replace(`/refinement/${sessionId}`);
    }
  }, [queue.length, rehydrating, router, sessionId]);

  const currentKey = queue[currentIndex] ?? null;
  const isLastTicket = currentIndex >= queue.length - 1;

  const { data: ticketData, mutate } = useTicketDetail(currentKey);

  // Push / save / discard state
  const [isPushing, setIsPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const [draftDiscardKey, setDraftDiscardKey] = useState(0);
  const [hasLocalTitleEdit, setHasLocalTitleEdit] = useState(false);
  const [hasLocalDescEdit, setHasLocalDescEdit] = useState(false);

  // Extract local edits from API response
  const localEdits = (ticketData as Record<string, unknown> | undefined)?.localEdits as
    Record<string, { value: string; isDraft: boolean }> | undefined;
  const showConflictWarning = ticketData?.editState === "conflict";

  // Reset push state when navigating between tickets
  useEffect(() => {
    setIsPushing(false);
    setPushError(null);
    setOverrideConfirmed(false);
    setHasLocalTitleEdit(false);
    setHasLocalDescEdit(false);
  }, [currentKey]);

  const handleDiscardDraft = useCallback(async () => {
    if (!currentKey) return;
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(currentKey)}/local-edits`, { method: "DELETE" });
      setHasLocalTitleEdit(false);
      setHasLocalDescEdit(false);
      setPushError(null);
      setOverrideConfirmed(false);
      await mutate();
      setDraftDiscardKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to discard draft:", err);
    }
  }, [currentKey, mutate]);

  const handlePushToJira = useCallback(async () => {
    if (!currentKey) return;
    setIsPushing(true);
    setPushError(null);
    try {
      const data = await tickets.pushToJira(currentKey) as {
        success?: boolean; conflict?: boolean; contentChanged?: boolean; error?: string;
      };
      if (data.conflict) {
        setPushError("Jira version changed. Review the diff or check override to push anyway.");
      } else if (data.success) {
        setHasLocalTitleEdit(false);
        setHasLocalDescEdit(false);
        setOverrideConfirmed(false);
        await mutate();
        setDraftDiscardKey((k) => k + 1);
        // Invalidate list caches so sprint board reflects any changes
        await globalMutate(
          (key) => typeof key === "string" && key.startsWith("/api/tickets?"),
          undefined,
          { revalidate: true },
        );
      } else {
        setPushError(data.error ?? "Push failed");
      }
    } catch {
      setPushError("Failed to push to Jira");
    } finally {
      setIsPushing(false);
    }
  }, [currentKey, mutate]);

  // Header state
  const [storyPoints, setStoryPoints] = useState<number | null>(ticketData?.storyPoints ?? null);

  // Sync story points when ticket changes
  useEffect(() => {
    if (ticketData) setStoryPoints(ticketData.storyPoints);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync on key/storyPoints change
  }, [ticketData?.key, ticketData?.storyPoints]);

  const handleStoryPointsChange = useCallback(
    async (v: number | null) => {
      const prev = storyPoints;
      setStoryPoints(v);
      try {
        await tickets.updateStoryPoints(currentKey!, v);
        if (v != null) {
          await tickets.updateMetadata(currentKey!, { readiness: null });
        }
        mutate();
      } catch (err) {
        console.error("Failed to update story points:", err);
        setStoryPoints(prev);
      }
    },
    [currentKey, storyPoints, mutate],
  );

  const handleReadinessChange = useCallback(
    async (v: TicketReadiness | null) => {
      if (!currentKey) return;
      try {
        await tickets.updateMetadata(currentKey, { readiness: v });
        mutate();
      } catch (err) {
        console.error("Failed to update readiness:", err);
      }
    },
    [currentKey, mutate],
  );

  // PO Notes: reset when ticket key changes
  const [poNotes, setPoNotes] = useState("");
  const [syncedKey, setSyncedKey] = useState<string | null>(null);

  // Overflow menu
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  // Navigation dropdown
  const [navDropdownOpen, setNavDropdownOpen] = useState(false);
  const navDropdownRef = useRef<HTMLDivElement>(null);

  // DnD for queue reorder
  const queueSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );
  const handleQueueDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIdx = queue.indexOf(active.id as string);
    const toIdx = queue.indexOf(over.id as string);
    if (fromIdx === -1 || toIdx === -1) return;
    reorderQueue(fromIdx, toIdx);
  }, [queue, reorderQueue]);

  useEffect(() => {
    if (!ticketData || syncedKey === ticketData.key) return;
    setSyncedKey(ticketData.key);
    setPoNotes(ticketData.notes ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally sync only on key change
  }, [ticketData?.key, ticketData?.notes]);

  const handleNotesBlur = useCallback(async () => {
    if (!currentKey) return;
    try {
      await tickets.updateMetadata(currentKey, { poNotes: poNotes });
    } catch (err) {
      console.error("Failed to save PO notes:", err);
    }
  }, [currentKey, poNotes]);

  const handleNext = useCallback(() => {
    if (isLastTicket) {
      openEndModal();
    } else {
      nextTicket();
    }
  }, [isLastTicket, openEndModal, nextTicket]);

  const handleExitSession = useCallback(() => {
    openEndModal();
  }, [openEndModal]);

  // Close overflow menu on click outside
  useEffect(() => {
    if (!overflowOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) setOverflowOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOverflowOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [overflowOpen]);

  // Close nav dropdown on click outside
  useEffect(() => {
    if (!navDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (navDropdownRef.current && !navDropdownRef.current.contains(e.target as Node)) {
        setNavDropdownOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setNavDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [navDropdownOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.getAttribute("contenteditable");

      // Cmd+Enter: next ticket / end session
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && sessionActive) {
        e.preventDefault();
        handleNext();
        return;
      }

      if (isInput) return;

      // P: toggle notes
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        toggleSidebarPanel("notes");
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, toggleSidebarPanel, sessionActive]);

  if (queue.length === 0) return null;

  // Session ended: navigate back to refinement
  if (!sessionActive && !showingEndModal) {
    return null;
  }

  // End modal: shown when exiting or after last ticket
  if (showingEndModal) {
    return (
      <>
        {pageTitle}
        <div className="flex h-full flex-col bg-[var(--color-surface-elevated)]">
          <SessionEndModal />
        </div>
      </>
    );
  }

  // Badge counts
  const subtaskCount = ticketData?.subtasks?.length ?? 0;
  const chatCount = ticketData?.chatMessageCount ?? 0;
  const notesCount = poNotes.trim() ? 1 : 0;

  return (
    <>
      {pageTitle}
      <div className="flex h-full flex-col bg-[var(--color-surface-elevated)]">
        {/* Top bar - matches ViewHeader styling */}
        <div className="relative flex shrink-0 items-center justify-between border-b border-border-strong bg-[var(--color-surface-chrome)] px-5 py-3.5">
          {/* Decorative accents (from ViewHeader) */}
          <div className="pointer-events-none absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[rgba(14,142,136,0.35)] to-transparent" />
          <div className="pointer-events-none absolute left-0 top-0 h-full w-72 bg-[radial-gradient(ellipse_at_left_center,rgba(14,142,136,0.10)_0%,transparent_70%)]" />
          <div className="pointer-events-none absolute right-0 top-0 h-full w-48 bg-[radial-gradient(ellipse_at_right_center,rgba(14,142,136,0.05)_0%,transparent_70%)]" />

          {/* Left: brand + exit + previous + ticket info */}
          <div className="relative flex items-center gap-3">
            {/* Brand mark */}
            <div className="flex shrink-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-600)] text-white shadow-[0_2px_10px_rgba(14,142,136,0.35),inset_0_1px_0_var(--color-text-muted)]">
                <BridgeMark size={22} />
              </div>
              <span className="hidden font-[var(--font-display)] text-heading-sm font-extrabold tracking-[-0.04em] text-text-primary lg:inline">
                Bridge
              </span>
            </div>

            <div className="h-6 w-px shrink-0 bg-gradient-to-b from-transparent via-border-strong to-transparent" />

            {ticketData && (
              <>
                <div className="h-4 w-px bg-border-subtle" />
                <TicketStatusPill
                  ticketKey={ticketData.key}
                  jiraStatus={ticketData.jiraStatus}
                  readiness={ticketData.readiness}
                  onReadinessChange={handleReadinessChange}
                  issueType={ticketData.type}
                  title={ticketData.title}
                  size="lg"
                />
                <StoryPointPicker
                  value={storyPoints}
                  onChange={handleStoryPointsChange}
                  align="left"
                  size="lg"
                />
              </>
            )}
          </div>

          {/* Center: progress + navigation */}
          <div className="relative flex items-center gap-3">
            <span className="text-body-sm font-medium tabular-nums text-text-secondary">
              Ticket {currentIndex + 1} of {queue.length}
            </span>
            <button
              type="button"
              onClick={() => prevTicket()}
              disabled={currentIndex === 0}
              className="flex cursor-pointer items-center justify-center rounded-md p-1 text-text-muted hover:bg-overlay-subtle hover:text-text-secondary disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              style={{ transition: "background-color 0.15s ease, color 0.15s ease, opacity 0.15s ease" }}
              aria-label="Previous ticket"
            >
              <ChevronLeft size={14} strokeWidth={2} />
            </button>
            <div className="flex items-center gap-1.5">
              {queue.map((key, idx) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => goToTicket(idx)}
                  className="group relative cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                  aria-label={`Go to ticket ${idx + 1}: ${key}`}
                >
                  <div
                    className={`h-1.5 rounded-full ${
                      idx === currentIndex
                        ? "w-8 bg-[var(--color-brand-500)]"
                        : idx < currentIndex
                          ? "w-4 bg-[var(--color-brand-500)]/40"
                          : "w-4 bg-overlay-strong"
                    }`}
                    style={{ transition: "width 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.2s ease" }}
                  />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleNext}
              className={`flex cursor-pointer items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                storyPoints != null
                  ? "gap-1 bg-[var(--color-brand-600)] text-white hover:bg-[var(--color-brand-500)] active:bg-[var(--color-brand-700)]"
                  : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
              }`}
              style={{
                padding: storyPoints != null ? "4px 10px" : "4px",
                transition: "background-color 0.25s ease, color 0.25s ease, padding 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease",
                boxShadow: storyPoints != null ? "0 2px 8px rgba(14, 142, 136, 0.3)" : "none",
              }}
              aria-label={isLastTicket ? "End session" : "Next ticket"}
            >
              <span
                className="overflow-hidden text-body-sm font-medium whitespace-nowrap"
                style={{
                  maxWidth: storyPoints != null ? "60px" : "0px",
                  opacity: storyPoints != null ? 1 : 0,
                  transition: "max-width 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease",
                }}
              >
                {isLastTicket ? "Finish" : "Next"}
              </span>
              <ChevronRight size={14} strokeWidth={2} />
            </button>
            {/* Navigation dropdown trigger */}
            <div className="relative" ref={navDropdownRef}>
              <button
                type="button"
                onClick={() => setNavDropdownOpen((v) => !v)}
                className={`flex cursor-pointer items-center justify-center rounded-md p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                  navDropdownOpen
                    ? "bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]"
                    : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
                }`}
                style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
                title="Jump to ticket"
              >
                <List size={14} strokeWidth={1.5} />
              </button>
              {navDropdownOpen && (
                <div
                  className="absolute top-full left-1/2 z-50 mt-2 w-[420px] -translate-x-1/2 rounded-xl border border-border-default bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-popover)]"
                  style={{ animation: "fadeInUp 0.1s ease" }}
                >
                  <div className="px-3 py-2 text-label font-semibold uppercase tracking-wider text-text-muted">
                    Queue
                  </div>
                  <div className="max-h-[320px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                    <DndContext sensors={queueSensors} collisionDetection={closestCenter} onDragEnd={handleQueueDragEnd}>
                      <SortableContext items={queue} strategy={verticalListSortingStrategy}>
                        {queue.map((key, idx) => {
                          const meta = queueMeta.find((m) => m.key === key);
                          return (
                            <SortableQueueItem
                              key={key}
                              ticketKey={key}
                              title={meta?.title ?? key}
                              isCurrent={idx === currentIndex}
                              onClick={() => { goToTicket(idx); setNavDropdownOpen(false); }}
                            />
                          );
                        })}
                      </SortableContext>
                    </DndContext>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: panel toggles + done/next */}
          <div className="relative flex items-center gap-2">
            {/* Chat pane toggle */}
            <button
              type="button"
              onClick={() => toggleSidebarPanel("chat")}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-body-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                activeSidebarPanel === "chat"
                  ? "bg-[#a78bfa]/[0.08] text-[#a78bfa]"
                  : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
              }`}
              style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
              title="Toggle ticket chat pane"
            >
              <MessageSquareText size={13} strokeWidth={1.5} />
              Chat
              {chatCount > 0 && (
                <span className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-caption tabular-nums ${
                  activeSidebarPanel === "chat" ? "bg-[#a78bfa]/15 text-[#a78bfa]" : "bg-overlay-default text-text-tertiary"
                }`}>{chatCount}</span>
              )}
            </button>

            {/* Subtasks pane toggle */}
            <button
              type="button"
              onClick={() => toggleSidebarPanel("subtasks")}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-body-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                activeSidebarPanel === "subtasks"
                  ? "bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]"
                  : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
              }`}
              style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
              title="Toggle subtasks pane"
            >
              <SquareMinus size={13} strokeWidth={1.5} />
              Subtasks
              {subtaskCount > 0 && (
                <span className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-caption tabular-nums ${
                  activeSidebarPanel === "subtasks" ? "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)]" : "bg-overlay-default text-text-tertiary"
                }`}>{subtaskCount}</span>
              )}
            </button>

            {/* Notes toggle */}
            <button
              type="button"
              onClick={() => toggleSidebarPanel("notes")}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-body-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                activeSidebarPanel === "notes"
                  ? "bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]"
                  : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
              }`}
              style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
              title="Toggle PO Notes (P)"
            >
              <StickyNote size={13} strokeWidth={1.5} />
              Notes
              {notesCount > 0 && (
                <span className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-caption tabular-nums ${
                  activeSidebarPanel === "notes" ? "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)]" : "bg-overlay-default text-text-tertiary"
                }`}>{notesCount}</span>
              )}
            </button>

            {/* Info toggle */}
            <button
              type="button"
              onClick={() => toggleSidebarPanel("info")}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-body-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                activeSidebarPanel === "info"
                  ? "bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]"
                  : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
              }`}
              style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
              title="Toggle ticket info"
            >
              <Info size={13} strokeWidth={1.5} />
              Info
            </button>

            <div className="h-4 w-px bg-border-subtle" />

            {/* Overflow menu */}
            <div className="relative" ref={overflowRef}>
              <button
                type="button"
                onClick={() => setOverflowOpen((v) => !v)}
                className={`flex cursor-pointer items-center justify-center rounded-md p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                  overflowOpen
                    ? "bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]"
                    : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
                }`}
                style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
                title="More actions"
                aria-label="More actions"
              >
                <MoreHorizontal size={16} strokeWidth={1.5} />
              </button>
              {overflowOpen && (
                <div
                  className="absolute top-full right-0 z-50 mt-2 w-48 rounded-xl border border-border-default bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-popover)]"
                  style={{ animation: "fadeInUp 0.1s ease" }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setZoomLevel(zoomLevel === 120 ? 100 : 120);
                      setOverflowOpen(false);
                    }}
                    className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-[7px] text-body-sm text-text-secondary hover:bg-hover-list-item active:bg-overlay-default"
                  >
                    {zoomLevel === 120 ? <ZoomOut size={13} strokeWidth={1.5} /> : <ZoomIn size={13} strokeWidth={1.5} />}
                    {zoomLevel === 120 ? "Zoom 100%" : "Zoom 120%"}
                  </button>
                  <div className="my-1 border-t border-border-default" />
                  <button
                    type="button"
                    onClick={() => {
                      setOverflowOpen(false);
                      handleExitSession();
                    }}
                    className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-[7px] text-body-sm text-text-secondary hover:bg-hover-list-item active:bg-overlay-default"
                  >
                    <LogOut size={13} strokeWidth={1.5} />
                    Exit session
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Main content */}
        <div className="flex min-h-0 flex-1" style={{ zoom: zoomLevel === 120 ? 1.2 : 1 }}>
          {/* Content area */}
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-8 py-8">
              {ticketData ? (
                <SessionTicketView
                  key={`${ticketData.key}-${draftDiscardKey}`}
                  ticket={ticketData}
                  detail={ticketData}
                  onMutate={() => mutate()}
                  subtasksPaneMode={activeSidebarPanel === "subtasks"}
                  localEdits={localEdits}
                  showConflictWarning={showConflictWarning}
                  overrideConfirmed={overrideConfirmed}
                  onOverrideChange={setOverrideConfirmed}
                  isPushing={isPushing}
                  pushError={pushError}
                  onPushToJira={handlePushToJira}
                  onDiscard={handleDiscardDraft}
                  onLocalTitleEdit={setHasLocalTitleEdit}
                  onLocalDescEdit={setHasLocalDescEdit}
                  onViewDiff={() => window.open(`/tickets/${currentKey}`, "_blank")}
                />
              ) : (
                <div className="flex items-center justify-center py-24">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-border-strong border-t-[var(--color-brand-400)]" />
                </div>
              )}
            </div>
          </div>

          {/* Right panel: Chat pane */}
          {activeSidebarPanel === "chat" && currentKey && (
            <SubtasksPaneResizable width={sidebarWidth} onWidthChange={setSidebarWidth}>
              <TicketChatPane
                ticketKey={currentKey}
                ticketTitle={queueMeta.find((m) => m.key === currentKey)?.title ?? currentKey}
                onClose={() => toggleSidebarPanel("chat")}
              />
            </SubtasksPaneResizable>
          )}

          {/* Right panel: Subtasks pane */}
          {activeSidebarPanel === "subtasks" && ticketData && (
            <SubtasksPaneResizable width={sidebarWidth} onWidthChange={setSidebarWidth}>
              <SubtasksSection
                subtasks={ticketData.subtasks ?? []}
                ticketKey={ticketData.key}
                onMutate={() => mutate()}
                compactFilters
                defaultHideKeys
                showDragHandles
              />
            </SubtasksPaneResizable>
          )}

          {/* Right panel: PO Notes */}
          {activeSidebarPanel === "notes" && (
            <SubtasksPaneResizable width={sidebarWidth} onWidthChange={setSidebarWidth}>
              <div className="flex items-center gap-2">
                <h3 className="text-label font-semibold uppercase tracking-wider text-text-muted">PO Notes</h3>
                {poNotes.trim() && (
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-500)]" title="Has notes" />
                )}
              </div>
              <textarea
                value={poNotes}
                onChange={(e) => setPoNotes(e.target.value)}
                onBlur={handleNotesBlur}
                placeholder="Quick annotation..."
                rows={6}
                className="mt-3 w-full resize-none rounded-lg border border-border-strong bg-overlay-subtle px-3 py-2 text-body-lg text-text-secondary placeholder:text-text-muted focus:border-[var(--color-brand-500)]/40 focus:outline-none"
                style={{ transition: "border-color 0.15s ease" }}
              />
            </SubtasksPaneResizable>
          )}

          {/* Right panel: Info / Metadata */}
          {activeSidebarPanel === "info" && ticketData && (
            <SubtasksPaneResizable width={sidebarWidth} onWidthChange={setSidebarWidth}>
              <h3 className="mb-3 text-label font-semibold uppercase tracking-wider text-text-muted">Info</h3>
              <SessionMetadataPanel ticket={ticketData} detail={ticketData} />
            </SubtasksPaneResizable>
          )}
        </div>

      </div>
    </>
  );
}
