"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useJiraSprints, useTickets, useSprintSlots, useTicketDetail, useTicketsByKeys } from "@/hooks/useSprintBoard";
import { saveTicketMetadata } from "@/components/sprint-board/sprint-board-utils";
import { useRefinementSession } from "@/contexts/RefinementSessionContext";
import { useRefinementSessions } from "@/hooks/useRefinementSessions";
import { useRefinementFilters } from "@/hooks/useRefinementFilters";
import { useRefinementQueue } from "@/hooks/useRefinementQueue";
import { useBulkSuggest } from "@/hooks/useBulkSuggest";
import { useRefinementStream } from "@/hooks/useRefinementStream";
import { refinementSessions as refinementSessionsApi, jira as jiraApi, type RefinementSessionResponse } from "@/lib/api-client";
import { CONTENT_MAX } from "@/lib/layout";
import { useTicketActions } from "@/components/sprint-board/useTicketActions";
import { makeBoardAdapter } from "@/components/sprint-board/row-actions/adapter";
import { mapJiraSprints } from "@/components/sprint-board/sprint-board-utils";
import { Boxes, Plus, Clock } from "lucide-react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { useRefinementDragDrop, NEW_SESSION_HINT_ID } from "@/hooks/useRefinementDragDrop";
import { snapToPointer } from "@/components/sprint-board/SprintBoardDragDrop";
import { DragGhostOverlay } from "@/components/sprint-board/DragGhostOverlay";
import { TicketDragHandle, PlanSessionDropZone } from "./RefinementDragDrop";
import { CARRY_OVER_TOAST_KEY } from "./SessionEndModal";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { Button } from "@/components/ui/Button";
import { SavedSessionList } from "@/components/refinement-session/SavedSessionList";
import Link from "next/link";
import { CreateSessionModal } from "@/components/refinement-session/CreateSessionModal";
import { filterTickets, smartSort, sessionLabel, compareSessions, MIN_TICKETS } from "./refinement-utils";
import { ResizableQueuePane } from "./ResizableQueuePane";
import { RefinementQueuePanel } from "./RefinementQueuePanel";
import { RefinementTicketList } from "./RefinementTicketList";

// The clicked ticket opens in the same rich panel the sprint board uses, so
// ticket management is consistent across surfaces (mirrors BRDG-275 on the
// ticket detail page).
const SidePanel = dynamic(
  () => import("@/components/sprint-board/SidePanel").then((m) => ({ default: m.SidePanel })),
  { ssr: false },
);

export { filterTickets } from "./refinement-utils";

interface RefinementPageContentProps {
  initialSessionId?: string;
  onSessionChange?: (id: string) => void;
}

export function RefinementPageContent({
  initialSessionId,
  onSessionChange,
}: RefinementPageContentProps) {
  const pageTitle = usePageTitle("Refinement");
  const router = useRouter();
  const { startSession } = useRefinementSession();

  // --- Session management ---
  const { sessions, mutate: mutateSessions } = useRefinementSessions();
  const [userSelectedId, setUserSelectedId] = useState<string | null>(initialSessionId ?? null);

  const resolvedSessionId = useMemo(() => {
    if (userSelectedId && sessions.some((s) => s.id === userSelectedId && s.status !== "completed")) {
      return userSelectedId;
    }
    const firstDraft = sessions.find((s) => s.status !== "completed");
    return firstDraft?.id ?? null;
  }, [userSelectedId, sessions]);

  // --- Streaming: auto-refresh when server data changes ---
  useRefinementStream(resolvedSessionId);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === resolvedSessionId) ?? null,
    [sessions, resolvedSessionId],
  );

  const hasCheckedSession = useRef(false);
  useEffect(() => {
    if (sessions.length === 0 || hasCheckedSession.current) return;
    hasCheckedSession.current = true;
    if (initialSessionId && !sessions.some((s) => s.id === initialSessionId)) {
      router.replace("/refinement");
    } else if (!initialSessionId && resolvedSessionId) {
      router.replace(`/refinement/${resolvedSessionId}`);
    }
  }, [initialSessionId, sessions, resolvedSessionId, router]);

  const ticketSessionMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string }[]>();
    for (const session of sessions) {
      if (session.status === "completed") continue;
      for (const key of session.ticketKeys) {
        const existing = map.get(key);
        const entry = { id: session.id, name: sessionLabel(session) };
        if (existing) existing.push(entry);
        else map.set(key, [entry]);
      }
    }
    return map;
  }, [sessions]);

  // --- Sprint / ticket data ---
  const { sprints } = useJiraSprints();
  const { data: sprintSlots } = useSprintSlots();

  const sprintNameMap = useMemo(() => Object.fromEntries((sprints ?? []).map((s) => [String(s.id), s.name])), [sprints]);
  const pinnedSprintIds = useMemo(() => new Set((sprintSlots ?? []).map((s) => s.sprintId)), [sprintSlots]);

  // Deliberate whole-pool fetch: the refinement prep board lets the PO browse,
  // search and filter ANY ticket to build a session, so it needs the full
  // candidate pool (an explicit browse-all view, like the board "All view"
  // exception). BRDG-411 already dropped its 60s poll. Narrowing this to a
  // server-side searched/paged endpoint is tracked separately, not part of the
  // BRDG-412 hover refactor (which scoped the bounded refinement callers).
  const { data: tickets, mutate: mutateTickets, isValidating: ticketsValidating } = useTickets("__all__");

  // A ticket added to a session can drop out of the board feed (/api/tickets
  // filters out status DRAFTING/REPLACED/DRAFT_FAILED), which would silently
  // shrink the queue below the session's ticket count. Fetch any such keys
  // directly so everything the PO put in a session stays visible in the queue.
  const loadedTicketKeys = useMemo(() => new Set((tickets ?? []).map((t) => t.key)), [tickets]);
  const missingSessionKeys = useMemo(
    () => (activeSession?.ticketKeys ?? []).filter((k) => !loadedTicketKeys.has(k)),
    [activeSession, loadedTicketKeys],
  );
  const extraSessionTickets = useTicketsByKeys(missingSessionKeys);
  const allTickets = useMemo(() => {
    if (extraSessionTickets.length === 0) return tickets;
    const base = tickets ?? [];
    const seen = new Set(base.map((t) => t.key));
    return [...base, ...extraSessionTickets.filter((t) => !seen.has(t.key))];
  }, [tickets, extraSessionTickets]);

  // Re-validate ticket edit states on mount
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      mutateTickets();
    }
  }, [mutateTickets]);

  // --- Inline editing (reuses the sprint-board ticket actions) ---
  const { toast: actionToast, toastLoading: actionToastLoading, showToast, dismissToast } = useToast();

  // Surface the carry-over confirmation handed off from the wrap-up modal,
  // which navigates here after pushing leftover tickets to a follow-up session.
  useEffect(() => {
    let message: string | null = null;
    try {
      message = sessionStorage.getItem(CARRY_OVER_TOAST_KEY);
      if (message) sessionStorage.removeItem(CARRY_OVER_TOAST_KEY);
    } catch {
      // sessionStorage may be unavailable; nothing to surface.
    }
    if (message) showToast(message);
  }, [showToast]);

  const editableSprints = useMemo(() => mapJiraSprints(sprints), [sprints]);
  const taAdapter = useMemo(() => makeBoardAdapter(tickets, mutateTickets, "/api/tickets", {}), [tickets, mutateTickets]);
  const ta = useTicketActions({ adapter: taAdapter, showToast });

  // --- Filters ---
  const filters = useRefinementFilters(pinnedSprintIds, sprintNameMap);

  const baseTickets = useMemo(() => {
    return (tickets ?? []).filter((t) => {
      if (t.jiraStatus === "DONE" || t.jiraStatus === "DEPRECATED") return false;
      if (t.type === "epic" || t.type === "subtask") return false;
      if (t.removedFromJiraAt) return false;
      return true;
    });
  }, [tickets]);

  const epicOptions = useMemo(
    () => [...new Set(baseTickets.map((t) => t.epic).filter(Boolean) as string[])].sort(),
    [baseTickets],
  );

  const filteredTickets = useMemo(() => {
    return filterTickets(baseTickets, {
      sprintFilter: filters.effectiveSprintFilter,
      hideEstimated: filters.hideEstimated,
      epicFilter: filters.epicFilter,
      lastUpdatedFilter: filters.lastUpdatedFilter,
    });
  }, [baseTickets, filters.effectiveSprintFilter, filters.hideEstimated, filters.epicFilter, filters.lastUpdatedFilter]);

  const sortedTickets = useMemo(() => [...filteredTickets].sort(smartSort), [filteredTickets]);

  const [searchQuery, setSearchQuery] = useState("");

  const availableTickets = useMemo(() => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return baseTickets
        .filter((t) => t.key.toLowerCase().includes(q) || t.title.toLowerCase().includes(q))
        .sort(smartSort);
    }
    if (!activeSession || activeSession.ticketKeys.length === 0) return sortedTickets;
    const sessionKeySet = new Set(activeSession.ticketKeys);
    const filteredKeySet = new Set(sortedTickets.map((t) => t.key));
    const missingSessionTickets = (tickets ?? [])
      .filter((t) => sessionKeySet.has(t.key) && !filteredKeySet.has(t.key));
    if (missingSessionTickets.length === 0) return sortedTickets;
    const keyOrder = activeSession.ticketKeys;
    missingSessionTickets.sort((a, b) => keyOrder.indexOf(a.key) - keyOrder.indexOf(b.key));
    return [...missingSessionTickets, ...sortedTickets];
  }, [sortedTickets, baseTickets, tickets, searchQuery, activeSession]);

  // --- Queue ---
  const queueHook = useRefinementQueue({
    resolvedSessionId,
    activeSession,
    mutateSessions,
    availableTickets,
    allTickets,
  });

  // Re-validate ticket edit states when the queue changes
  const prevQueueLenRef = useRef(queueHook.queue.length);
  useEffect(() => {
    if (queueHook.queue.length > prevQueueLenRef.current) {
      const timer = setTimeout(() => mutateTickets(), 500);
      return () => clearTimeout(timer);
    }
    prevQueueLenRef.current = queueHook.queue.length;
  }, [queueHook.queue.length, mutateTickets]);

  const canStart = queueHook.queue.length >= MIN_TICKETS;

  // --- Side panel (open a ticket without leaving the prep view) ---
  // Row click opens the panel; the checkbox stays the queue control. The panel
  // overlays the queue (fixed, right-anchored) so the list/queue layout is kept.
  const [previewTicketKey, setPreviewTicketKey] = useState<string | null>(null);
  // The list already holds full Ticket objects, so the clicked row paints the
  // panel header instantly (no flash). Fall back to a fetch only for keys that
  // are not in the visible list (e.g. a drill-down from inside the panel).
  const previewLightTicket = useMemo(
    () => (previewTicketKey ? (availableTickets.find((t) => t.key === previewTicketKey) ?? null) : null),
    [previewTicketKey, availableTickets],
  );
  const previewFetch = useTicketDetail(previewTicketKey && !previewLightTicket ? previewTicketKey : null);
  const previewTicket = previewLightTicket ?? previewFetch.data ?? null;
  const previewAdjacentKeys = useMemo(() => {
    if (!previewTicketKey) return undefined;
    const idx = availableTickets.findIndex((t) => t.key === previewTicketKey);
    if (idx === -1) return undefined;
    return {
      prev: idx > 0 ? availableTickets[idx - 1].key : null,
      next: idx < availableTickets.length - 1 ? availableTickets[idx + 1].key : null,
    };
  }, [previewTicketKey, availableTickets]);
  // The panel is the right column of an in-flow two-column split, so it pushes
  // the ticket list left (the resizer divides the row) rather than overlaying
  // it. It starts at the scroll container's top so its tab bar lines up with the
  // session-selector row, and is pinned (sticky) at full viewport height while
  // the left column scrolls, so we size its wrapper to the container's visible
  // height.
  const [panelHeight, setPanelHeight] = useState(0);
  const measurePanelHeight = useCallback(() => {
    const main = document.getElementById("main-content");
    if (!main) return;
    setPanelHeight(main.clientHeight);
  }, []);
  // Re-click the open row closes it; clicking a different row swaps the panel.
  // Measure synchronously on open so the panel paints at the right height.
  const handleSelectTicket = useCallback(
    (key: string) => {
      measurePanelHeight();
      setPreviewTicketKey((cur) => (cur === key ? null : key));
    },
    [measurePanelHeight],
  );
  // Keep the panel height in sync as the viewport changes.
  useEffect(() => {
    if (!previewTicketKey) return;
    window.addEventListener("resize", measurePanelHeight);
    return () => window.removeEventListener("resize", measurePanelHeight);
  }, [previewTicketKey, measurePanelHeight]);

  // --- Bulk suggest ---
  const bulk = useBulkSuggest({ resolvedSessionId, queueTickets: queueHook.queueTickets });

  // --- Session actions ---
  const otherSessions = useMemo(
    () => sessions.filter((s) => s.id !== resolvedSessionId && s.status !== "completed"),
    [sessions, resolvedSessionId],
  );

  const handleMoveToSession = useCallback(
    async (ticketKey: string, targetSessionId: string) => {
      queueHook.updateQueue(queueHook.queue.filter((k) => k !== ticketKey));
      const target = sessions.find((s) => s.id === targetSessionId);
      if (target) {
        const newKeys = [...target.ticketKeys, ticketKey];
        await refinementSessionsApi.update(targetSessionId, { ticketKeys: newKeys });
        await mutateSessions();
      }
    },
    [queueHook, sessions, mutateSessions],
  );

  // --- Drag-and-drop onto session chips (BRDG-336) ---
  // Move semantics: the dropped ticket leaves every non-completed session it is
  // in (and the unsaved local queue) and lands in the target. All membership
  // changes are applied to the SWR cache at once, then persisted directly; the
  // queue's debounced persist is cancelled when the active session is a source,
  // because its pending optimistic keys are already in the cache we read from.
  const handleDropMove = useCallback(
    async (ticketKey: string, targetSessionId: string) => {
      const target = sessions.find((s) => s.id === targetSessionId);
      if (!target || target.status === "completed") return;

      const sourceSessions = sessions.filter(
        (s) => s.id !== targetSessionId && s.status !== "completed" && s.ticketKeys.includes(ticketKey),
      );
      if (sourceSessions.some((s) => s.id === resolvedSessionId)) {
        queueHook.flushPersistTimer();
      }
      if (queueHook.localQueue.includes(ticketKey)) {
        queueHook.setLocalQueue(queueHook.localQueue.filter((k) => k !== ticketKey));
      }

      const targetKeys = [...target.ticketKeys, ticketKey];
      mutateSessions(
        (prev) =>
          prev?.map((s) => {
            if (s.id === targetSessionId) return { ...s, ticketKeys: targetKeys, ticketCount: targetKeys.length };
            if (sourceSessions.some((src) => src.id === s.id)) {
              const keys = s.ticketKeys.filter((k) => k !== ticketKey);
              return { ...s, ticketKeys: keys, ticketCount: keys.length };
            }
            return s;
          }),
        false,
      );

      try {
        await Promise.all([
          refinementSessionsApi.update(targetSessionId, { ticketKeys: targetKeys }),
          ...sourceSessions.map((s) =>
            refinementSessionsApi.update(s.id, { ticketKeys: s.ticketKeys.filter((k) => k !== ticketKey) }),
          ),
        ]);
        showToast(`Moved ${ticketKey} to ${sessionLabel(target)}`);
      } catch {
        showToast(`Failed to move ${ticketKey}. Changes reverted.`);
      } finally {
        await mutateSessions();
      }
    },
    [sessions, resolvedSessionId, queueHook, mutateSessions, showToast],
  );

  // Dropping on "Plan session" creates a new session holding the ticket. Same
  // move semantics; the view stays put (no auto-navigation) so a drag never
  // yanks the PO off the current session.
  const handleDropCreateSession = useCallback(
    async (ticketKey: string) => {
      const sourceSessions = sessions.filter(
        (s) => s.status !== "completed" && s.ticketKeys.includes(ticketKey),
      );
      if (sourceSessions.some((s) => s.id === resolvedSessionId)) {
        queueHook.flushPersistTimer();
      }
      if (queueHook.localQueue.includes(ticketKey)) {
        queueHook.setLocalQueue(queueHook.localQueue.filter((k) => k !== ticketKey));
      }
      if (sourceSessions.length > 0) {
        mutateSessions(
          (prev) =>
            prev?.map((s) => {
              if (!sourceSessions.some((src) => src.id === s.id)) return s;
              const keys = s.ticketKeys.filter((k) => k !== ticketKey);
              return { ...s, ticketKeys: keys, ticketCount: keys.length };
            }),
          false,
        );
      }

      try {
        // The create endpoint requires a name or a date (BRDG-337); a drop has
        // no modal to ask, so stamp a dated default name the PO can rename.
        const defaultName = `Refinement ${new Date().toISOString().slice(0, 10)}`;
        const [created] = await Promise.all([
          refinementSessionsApi.create({ name: defaultName, ticketKeys: [ticketKey] }),
          ...sourceSessions.map((s) =>
            refinementSessionsApi.update(s.id, { ticketKeys: s.ticketKeys.filter((k) => k !== ticketKey) }),
          ),
        ]);
        showToast(`Moved ${ticketKey} to ${sessionLabel(created)}`);
      } catch {
        showToast(`Failed to create a session for ${ticketKey}.`);
      } finally {
        await mutateSessions();
      }
    },
    [sessions, resolvedSessionId, queueHook, mutateSessions, showToast],
  );

  const handleAlreadyInSession = useCallback(
    (ticketKey: string, session: RefinementSessionResponse) => {
      showToast(`${ticketKey} is already in ${sessionLabel(session)}`);
    },
    [showToast],
  );

  const dnd = useRefinementDragDrop({
    sessions,
    onMove: handleDropMove,
    onCreateFromTicket: handleDropCreateSession,
    onAlreadyInSession: handleAlreadyInSession,
  });

  const dragTicket = dnd.activeDragKey ? (queueHook.allTicketMap.get(dnd.activeDragKey) ?? null) : null;
  // Feeds the drag ghost's "Move to ..." hint; the Plan session target maps to
  // a sentinel entry so the same overlay component covers both drop kinds.
  const sessionDropHintMap = useMemo(
    () => ({
      ...Object.fromEntries(sessions.map((s) => [s.id, sessionLabel(s)])),
      [NEW_SESSION_HINT_ID]: "a new session",
    }),
    [sessions],
  );

  const { flushPersistTimer } = queueHook;
  const handleSelectSession = useCallback(
    (id: string) => {
      flushPersistTimer();
      setUserSelectedId(id);
      onSessionChange?.(id);
      router.replace(`/refinement/${id}`);
    },
    [onSessionChange, flushPersistTimer, router],
  );

  // Finishing the active session must clear the prep view: move to the next
  // active session, or fall back to a clean /refinement landing when none remain.
  const handleSessionFinished = useCallback(
    (finishedId: string) => {
      if (finishedId !== resolvedSessionId) return;
      const next = sessions.find((s) => s.id !== finishedId && s.status !== "completed");
      if (next) {
        handleSelectSession(next.id);
        return;
      }
      flushPersistTimer();
      queueHook.setLocalQueue([]);
      setUserSelectedId(null);
      router.replace("/refinement");
    },
    [resolvedSessionId, sessions, handleSelectSession, flushPersistTimer, queueHook, router],
  );

  const handleBeginRefinement = useCallback(async () => {
    if (!canStart) return;
    const meta = queueHook.queue.map((key) => {
      const t = queueHook.allTicketMap.get(key);
      return { key, title: t?.title ?? key };
    });
    let sessionId = resolvedSessionId;
    if (!sessionId) {
      const created = await refinementSessionsApi.create({ ticketKeys: queueHook.queue });
      sessionId = created.id;
      setUserSelectedId(sessionId);
      queueHook.setLocalQueue([]);
      await mutateSessions();
    }
    // Resume an already-started session where it was left off; a fresh start begins at the first ticket.
    const isResuming = activeSession?.status === "in_progress";
    const startIndex = isResuming
      ? Math.max(0, Math.min(activeSession?.currentIndex ?? 0, queueHook.queue.length - 1))
      : 0;
    if (!isResuming) {
      refinementSessionsApi.update(sessionId, { status: "in_progress" }).catch(() => {});
    }
    startSession(queueHook.queue, meta, sessionId, startIndex);
    router.push(`/refinement/${sessionId}/session/${encodeURIComponent(queueHook.queue[startIndex])}`);

    // Pre-sync the remaining tickets from Jira so they are fresh when navigated to
    const remaining = queueHook.queue.filter((_, i) => i !== startIndex);
    if (remaining.length > 0) {
      jiraApi.syncTickets({ ticketKeys: remaining }).catch(() => {});
    }
  }, [canStart, queueHook, resolvedSessionId, activeSession, mutateSessions, startSession, router]);

  const handleSaveAsSession = useCallback(async () => {
    if (queueHook.localQueue.length === 0) return;
    const created = await refinementSessionsApi.create({ ticketKeys: queueHook.localQueue });
    queueHook.setLocalQueue([]);
    setUserSelectedId(created.id);
    onSessionChange?.(created.id);
    router.replace(`/refinement/${created.id}`);
    await mutateSessions();
  }, [queueHook, mutateSessions, onSessionChange, router]);

  const [createModalOpen, setCreateModalOpen] = useState(false);

  const handleCreateSession = useCallback(async ({ name, scheduledFor }: { name?: string; scheduledFor?: string }) => {
    const currentQueue = queueHook.localQueue.length > 0 ? queueHook.localQueue : [];
    const created = await refinementSessionsApi.create({ name, scheduledFor, ticketKeys: currentQueue.length > 0 ? currentQueue : undefined });
    if (currentQueue.length > 0) queueHook.setLocalQueue([]);
    setUserSelectedId(created.id);
    onSessionChange?.(created.id);
    router.replace(`/refinement/${created.id}`);
    await mutateSessions();
  }, [mutateSessions, onSessionChange, queueHook, router]);

  const activeSessions = useMemo(
    () => sessions.filter((s) => s.status !== "completed").slice().sort(compareSessions),
    [sessions],
  );

  // Calendar markers for the create modal: which days already hold a session
  const scheduledDates = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const s of sessions) {
      if (s.status === "completed" || !s.scheduledFor) continue;
      (map[s.scheduledFor] ??= []).push(sessionLabel(s));
    }
    return map;
  }, [sessions]);

  // --- Render ---
  // The DndContext spans the header (Plan session drop), session chips, ticket
  // list and side panel. It is intentionally separate from the queue's own
  // sortable DndContext inside RefinementQueuePanel, so the two DnD surfaces
  // can never interfere with each other.
  return (
    <DndContext
      sensors={dnd.sensors}
      collisionDetection={dnd.collisionDetection}
      onDragStart={dnd.handleDragStart}
      onDragOver={dnd.handleDragOver}
      onDragEnd={dnd.handleDragEnd}
      onDragCancel={dnd.handleDragCancel}
    >
      {pageTitle}
      <ViewHeader
        icon={<Boxes size={16} strokeWidth={1.5} />}
        hideNotifications
        actions={
          <div className="flex items-center gap-2">
            <PlanSessionDropZone isDragActive={dnd.isDragActive}>
              <Button variant="secondary" size="md" icon={<Plus size={13} strokeWidth={1.5} />} onClick={() => setCreateModalOpen(true)}>
                Plan session
              </Button>
            </PlanSessionDropZone>
            <Link href="/refinement/history">
              <Button variant="ghost" size="md" icon={<Clock size={13} strokeWidth={1.5} />}>Sessions</Button>
            </Link>
          </div>
        }
      >
        <ViewHeaderTitle>Refinement</ViewHeaderTitle>
      </ViewHeader>

      {/* Two-column split: the left column holds the session selector and the
          ticket list; the open ticket's panel is the right column. Keeping the
          panel as a sibling of the session row (not nested below it) lets its tab
          bar line up with the session-selector row. The panel's own resizer
          divides the row, shrinking the left column (and so the list) as it grows. */}
      <div className="flex">
        <div className="min-w-0 flex-1">
          <SavedSessionList sessions={activeSessions} mutate={mutateSessions} activeSessionId={resolvedSessionId} onSelectSession={handleSelectSession} onSessionFinished={handleSessionFinished} dragActive={dnd.isDragActive} />

          <div className="min-h-full px-8 py-6">
            {/* Gutter sits outside the cap so the content edge aligns flush with
                the header/date-tabs cap edge on wide screens (BRDG-361). */}
            <div className={`${CONTENT_MAX} flex gap-6`}>
              <RefinementTicketList
                availableTickets={queueHook.orderedTickets}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                filters={filters}
                queueHook={queueHook}
                onSelectTicket={handleSelectTicket}
                previewTicketKey={previewTicketKey}
                pinnedSprintIds={pinnedSprintIds}
                epicOptions={epicOptions}
                sprintNameMap={sprintNameMap}
                ticketSessionMap={ticketSessionMap}
                resolvedSessionId={resolvedSessionId}
                sprints={editableSprints}
                readinessMap={ta.readinessMap}
                onAssigneeChange={ta.handleAssigneeChange}
                onEpicChange={ta.handleEpicChange}
                onSprintChange={ta.handleSprintChange}
                onStoryPointsChange={ta.handleStoryPointsChange}
                onBusinessValueChange={ta.handleBusinessValueChange}
                onJiraStatusChange={ta.handleJiraStatusChange}
                onReadinessChange={ta.handleReadinessChange}
              />

              {!(previewTicketKey && previewTicket) && (
                <ResizableQueuePane>
                  <RefinementQueuePanel
                    activeSession={activeSession}
                    queueHook={queueHook}
                    bulk={bulk}
                    otherSessions={otherSessions}
                    canStart={canStart}
                    onMoveToSession={handleMoveToSession}
                    onBeginRefinement={handleBeginRefinement}
                    onSaveAsSession={handleSaveAsSession}
                    ticketsValidating={ticketsValidating}
                    onRefreshEditStates={() => mutateTickets()}
                  />
                </ResizableQueuePane>
              )}
            </div>
          </div>
        </div>

        {/* Right column: the open ticket's panel. Pinned at the container top so
            its tab bar sits over the session-selector row, full viewport height,
            scrolls internally while the left column scrolls. */}
        {previewTicketKey && previewTicket && (
          <div
            className="sticky top-0 z-10 shrink-0 self-start"
            style={{ height: panelHeight || "calc(100vh - 65px)", animation: "slideInRight 0.18s ease" }}
          >
            <SidePanel
              key={previewTicketKey}
              ticket={previewTicket}
              defaultWidth={560}
              storageKey="refinementSplitPanelWidth"
              poStatus={ta.poStatuses[previewTicketKey] ?? previewTicket.poStatus ?? null}
              readiness={ta.readinessMap[previewTicketKey] ?? previewTicket.readiness ?? null}
              onPoStatusChange={(v) => ta.handlePoStatusChange(previewTicketKey, v)}
              onReadinessChange={(v) => ta.handleReadinessChange(previewTicketKey, v)}
              onNotesChange={(notes) => { void saveTicketMetadata(previewTicketKey, { poNotes: notes }, "/api/tickets"); }}
              onClose={() => setPreviewTicketKey(null)}
              onShowToast={showToast}
              onMutate={() => mutateTickets()}
              onSelectTicket={setPreviewTicketKey}
              adjacentKeys={previewAdjacentKeys}
              dragHandle={
                <TicketDragHandle
                  ticketKey={previewTicketKey}
                  source="panel"
                  className="flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-md text-text-muted hover:bg-overlay-default hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:cursor-grabbing"
                />
              }
            />
          </div>
        )}
      </div>

      <CreateSessionModal open={createModalOpen} onClose={() => setCreateModalOpen(false)} onCreate={handleCreateSession} scheduledDates={scheduledDates} />

      {bulk.copyToast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border-strong bg-surface-elevated px-4 py-2 text-body-lg text-text-secondary shadow-md">
          Copied {queueHook.queueTickets.length} ticket{queueHook.queueTickets.length !== 1 ? "s" : ""} to clipboard
        </div>
      )}

      <Toast toast={actionToast} loading={actionToastLoading} onDismiss={dismissToast} />

      {/* Drag preview: the same ghost the sprint board uses, snapped to the
          pointer; the hint line shows the session under the cursor. */}
      <DragOverlay dropAnimation={null} modifiers={[snapToPointer]}>
        {dragTicket ? (
          <DragGhostOverlay
            dragTicket={dragTicket}
            draggedKeys={[dragTicket.key]}
            tickets={tickets ?? []}
            targetSprintId={dnd.overSessionId}
            sprintNameMap={sessionDropHintMap}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
