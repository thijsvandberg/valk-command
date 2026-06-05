"use client";

import { use, useEffect, useCallback, useState, useRef } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { useRouter } from "next/navigation";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useRefinementSession } from "@/contexts/RefinementSessionContext";
import { useTicketDetail, useTickets } from "@/hooks/useSprintBoard";
import { useTicketHoverData } from "@/hooks/useTicketHoverData";
import { refinementSessions as refinementSessionsApi } from "@/lib/api-client";
import { SessionTicketView, SessionMetadataPanel } from "@/components/refinement-session/SessionTicketView";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { SessionEndModal } from "@/components/refinement-session/SessionEndModal";
import { SessionNavigation } from "@/components/refinement-session/SessionNavigation";
import { SubtasksPaneResizable } from "@/components/refinement-session/SubtasksPaneResizable";
import { SubtasksSection } from "@/components/ticket-detail/SubtasksSection";
import { TicketChatPane } from "@/components/shared/TicketChatPane";
import { tickets, apiFetch, jira as jiraApi } from "@/lib/api-client";
import { mutate as globalMutate } from "swr";
import type { TicketReadiness, IssueType, JiraStatus } from "@/types/ticket";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { BridgeMark } from "@/components/shared/BridgeMark";
import {
  MoreHorizontal,
  LogOut,
  StickyNote,
  SquareMinus,
  Info,
  MessageSquareText,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

function getDefaultPaneWidth() {
  if (typeof window === "undefined") return 400;
  return Math.max(320, Math.round(window.innerWidth * 0.3));
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

  // Persisted zoom level for refinement session content. New key (v2) resets
  // any legacy 100/120 values to the current 110/130 scale.
  const [zoomLevel, setZoomLevel] = useLocalStorage<110 | 130>("bridge:refinement-zoom-v2", 110);
  const zoomFactor = zoomLevel / 100;

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

  // Hover-card data for the header ticket pill, resolved from the shared board
  // list so the header gets the same info tooltip as rows on the sprint board.
  const getHoverData = useTicketHoverData();
  const headerHoverData = currentKey ? getHoverData(currentKey) : undefined;

  // Force a Jira sync when entering a ticket in the refinement session
  // to ensure subtasks and other data are up to date
  const syncedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentKey || currentKey === syncedKeyRef.current) return;
    syncedKeyRef.current = currentKey;
    jiraApi.syncTickets({ ticketKeys: [currentKey] })
      .then(() => mutate())
      .catch(() => {});
  }, [currentKey, mutate]);

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
        // The "set SP -> advance Ready-to-Refine to Ready-for-Development"
        // transition is owned by the server (ticket-detail-builder); mutate()
        // pulls the updated readiness back into the session view.
        await tickets.updateStoryPoints(currentKey!, v);
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

  const handleJiraStatusChange = useCallback(
    async (status: JiraStatus) => {
      if (!currentKey) return;
      try {
        await apiFetch(`/api/tickets/${encodeURIComponent(currentKey)}/status`, {
          method: "PUT",
          body: { status },
        });
        mutate();
      } catch (err) {
        console.error("Failed to update Jira status:", err);
      }
    },
    [currentKey, mutate],
  );

  const handleTypeChange = useCallback(
    async (newType: IssueType) => {
      if (!currentKey) return;
      try {
        await apiFetch(`/api/tickets/${encodeURIComponent(currentKey)}`, {
          method: "PATCH",
          body: { type: newType },
        });
        mutate();
      } catch (err) {
        console.error("Failed to update issue type:", err);
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

  useOutsideClick(overflowRef, () => setOverflowOpen(false), { enabled: overflowOpen });

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
          <div className="pointer-events-none absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--color-brand-glow)] to-transparent" />
          <div className="pointer-events-none absolute left-0 top-0 h-full w-72 bg-[radial-gradient(ellipse_at_left_center,color-mix(in_srgb,var(--color-brand-500)_10%,transparent)_0%,transparent_70%)]" />
          <div className="pointer-events-none absolute right-0 top-0 h-full w-48 bg-[radial-gradient(ellipse_at_right_center,color-mix(in_srgb,var(--color-brand-500)_5%,transparent)_0%,transparent_70%)]" />

          {/* Left: brand + exit + previous + ticket info */}
          <div className="relative flex items-center gap-3">
            {/* Brand mark */}
            <div className="flex shrink-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-600)] text-white shadow-[0_2px_10px_var(--color-brand-glow),inset_0_1px_0_var(--color-text-muted)]">
                <BridgeMark size={22} />
              </div>
              <span className="hidden font-[var(--font-display)] text-heading-sm font-extrabold tracking-[-0.04em] text-text-primary min-[1160px]:inline">
                Bridge
              </span>
            </div>

            <div className="h-6 w-px shrink-0 bg-gradient-to-b from-transparent via-border-strong to-transparent" />

            {ticketData && (
              <>
                <TicketStatusPill
                  ticketKey={ticketData.key}
                  jiraStatus={ticketData.jiraStatus}
                  readiness={ticketData.readiness}
                  onJiraStatusChange={handleJiraStatusChange}
                  onReadinessChange={handleReadinessChange}
                  issueType={ticketData.type}
                  onIssueTypeChange={handleTypeChange}
                  title={ticketData.title}
                  size="lg"
                  onHeader
                  hoverData={headerHoverData}
                  onStoryPointsChange={handleStoryPointsChange}
                />
              </>
            )}
          </div>

          {/* Center: progress + navigation */}
          <SessionNavigation
            currentIndex={currentIndex}
            queue={queue}
            queueMeta={queueMeta}
            allTickets={allTickets}
            isLastTicket={isLastTicket}
            storyPoints={storyPoints}
            onStoryPointsChange={handleStoryPointsChange}
            onPrev={() => prevTicket()}
            onNext={handleNext}
            onGoToTicket={goToTicket}
            onReorderQueue={reorderQueue}
          />

          {/* Right: panel toggles + done/next */}
          <div className="relative flex items-center gap-2">
            {/* Panel toggles - full buttons on xl+, hidden below */}
            <div className="hidden items-center gap-2 min-[1160px]:flex">
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
            </div>

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
                  {/* Panel toggles - visible in menu below xl */}
                  <div className="min-[1160px]:hidden">
                    <button
                      type="button"
                      onClick={() => { toggleSidebarPanel("chat"); setOverflowOpen(false); }}
                      className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-[7px] text-body-sm hover:bg-hover-list-item active:bg-overlay-default ${
                        activeSidebarPanel === "chat" ? "text-[#a78bfa]" : "text-text-secondary"
                      }`}
                    >
                      <MessageSquareText size={13} strokeWidth={1.5} />
                      Chat
                      {chatCount > 0 && (
                        <span className="ml-auto text-caption tabular-nums text-text-tertiary">{chatCount}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => { toggleSidebarPanel("subtasks"); setOverflowOpen(false); }}
                      className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-[7px] text-body-sm hover:bg-hover-list-item active:bg-overlay-default ${
                        activeSidebarPanel === "subtasks" ? "text-[var(--color-brand-400)]" : "text-text-secondary"
                      }`}
                    >
                      <SquareMinus size={13} strokeWidth={1.5} />
                      Subtasks
                      {subtaskCount > 0 && (
                        <span className="ml-auto text-caption tabular-nums text-text-tertiary">{subtaskCount}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => { toggleSidebarPanel("notes"); setOverflowOpen(false); }}
                      className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-[7px] text-body-sm hover:bg-hover-list-item active:bg-overlay-default ${
                        activeSidebarPanel === "notes" ? "text-[var(--color-brand-400)]" : "text-text-secondary"
                      }`}
                    >
                      <StickyNote size={13} strokeWidth={1.5} />
                      Notes
                      {notesCount > 0 && (
                        <span className="ml-auto text-caption tabular-nums text-text-tertiary">{notesCount}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => { toggleSidebarPanel("info"); setOverflowOpen(false); }}
                      className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-[7px] text-body-sm hover:bg-hover-list-item active:bg-overlay-default ${
                        activeSidebarPanel === "info" ? "text-[var(--color-brand-400)]" : "text-text-secondary"
                      }`}
                    >
                      <Info size={13} strokeWidth={1.5} />
                      Info
                    </button>
                    <div className="my-1 border-t border-border-default" />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setZoomLevel(zoomLevel === 130 ? 110 : 130);
                      setOverflowOpen(false);
                    }}
                    className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-[7px] text-body-sm text-text-secondary hover:bg-hover-list-item active:bg-overlay-default"
                  >
                    {zoomLevel === 130 ? <ZoomOut size={13} strokeWidth={1.5} /> : <ZoomIn size={13} strokeWidth={1.5} />}
                    {zoomLevel === 130 ? "Zoom 110%" : "Zoom 130%"}
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
        <div className="flex min-h-0 flex-1" style={{ zoom: zoomFactor }}>
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
            <SubtasksPaneResizable width={sidebarWidth} onWidthChange={setSidebarWidth} zoom={zoomFactor}>
              <TicketChatPane
                ticketKey={currentKey}
                onClose={() => toggleSidebarPanel("chat")}
              />
            </SubtasksPaneResizable>
          )}

          {/* Right panel: Subtasks pane */}
          {activeSidebarPanel === "subtasks" && ticketData && (
            <SubtasksPaneResizable width={sidebarWidth} onWidthChange={setSidebarWidth} zoom={zoomFactor}>
              <SubtasksSection
                subtasks={ticketData.subtasks ?? []}
                ticketKey={ticketData.key}
                onMutate={() => mutate()}
                compactFilters
                defaultHideKeys
                showDragHandles
                disableCollapse
              />
            </SubtasksPaneResizable>
          )}

          {/* Right panel: PO Notes */}
          {activeSidebarPanel === "notes" && (
            <SubtasksPaneResizable width={sidebarWidth} onWidthChange={setSidebarWidth} zoom={zoomFactor}>
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
            <SubtasksPaneResizable width={sidebarWidth} onWidthChange={setSidebarWidth} zoom={zoomFactor}>
              <h3 className="mb-3 text-label font-semibold uppercase tracking-wider text-text-muted">Info</h3>
              <SessionMetadataPanel ticket={ticketData} detail={ticketData} onMutate={() => mutate()} />
            </SubtasksPaneResizable>
          )}
        </div>

      </div>
    </>
  );
}
