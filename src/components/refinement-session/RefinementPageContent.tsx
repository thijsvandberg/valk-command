"use client";

import { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useJiraSprints, useTickets, useSprintSlots, useTicketDetail } from "@/hooks/useSprintBoard";
import { saveTicketMetadata } from "@/components/sprint-board/sprint-board-utils";
import { useRefinementSession } from "@/contexts/RefinementSessionContext";
import { useRefinementSessions } from "@/hooks/useRefinementSessions";
import { useRefinementFilters } from "@/hooks/useRefinementFilters";
import { useRefinementQueue } from "@/hooks/useRefinementQueue";
import { useBulkSuggest } from "@/hooks/useBulkSuggest";
import { useRefinementStream } from "@/hooks/useRefinementStream";
import { refinementSessions as refinementSessionsApi, jira as jiraApi } from "@/lib/api-client";
import { useTicketActions } from "@/components/sprint-board/useTicketActions";
import { mapJiraSprints } from "@/components/sprint-board/sprint-board-utils";
import { Gem, Plus, Clock } from "lucide-react";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { Button } from "@/components/ui/Button";
import { SavedSessionList } from "@/components/refinement-session/SavedSessionList";
import Link from "next/link";
import { CreateSessionModal } from "@/components/refinement-session/CreateSessionModal";
import { filterTickets, smartSort, MIN_TICKETS } from "./refinement-utils";
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
        const entry = { id: session.id, name: session.name };
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

  const { data: tickets, mutate: mutateTickets, isValidating: ticketsValidating } = useTickets("__all__");

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

  const editableSprints = useMemo(() => mapJiraSprints(sprints), [sprints]);
  const ta = useTicketActions({ apiTickets: tickets, mutateTickets, activeListKey: "/api/tickets", showToast });

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
    allTickets: tickets,
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
  // Anchor the panel to fill the right side of the layout: top at the app-header
  // bottom so the panel's tab bar sits one level up, over the session-selector
  // ("refinement") tab row. Both rows are h-[44px] with a bottom border, so the
  // borders coincide and the divider runs through cleanly. Right edge at the
  // viewport so it uses the right-hand space; default width spans from the
  // queue's left edge to the viewport edge. Re-measured on resize.
  const contentRowRef = useRef<HTMLDivElement>(null);
  const panelWrapRef = useRef<HTMLDivElement>(null);
  const [panelAnchor, setPanelAnchor] = useState<{ top: number; fillWidth: number }>({ top: 0, fillWidth: 380 });
  const measurePanel = useCallback(() => {
    const main = document.getElementById("main-content");
    const queue = contentRowRef.current?.lastElementChild as HTMLElement | null;
    if (!main || !queue) return;
    setPanelAnchor({
      top: main.getBoundingClientRect().top,
      fillWidth: Math.round(window.innerWidth - queue.getBoundingClientRect().left),
    });
  }, []);
  // Re-click the open row closes it; clicking a different row swaps the panel.
  // Measure synchronously on open so the panel paints at the right anchor/width.
  const handleSelectTicket = useCallback(
    (key: string) => {
      measurePanel();
      setPreviewTicketKey((cur) => (cur === key ? null : key));
    },
    [measurePanel],
  );
  // Keep the panel anchored as the viewport changes (listener only; the initial
  // measure runs in the click handler, so no synchronous setState in the effect).
  useEffect(() => {
    if (!previewTicketKey) return;
    window.addEventListener("resize", measurePanel);
    return () => window.removeEventListener("resize", measurePanel);
  }, [previewTicketKey, measurePanel]);
  // Pixel-align the panel's tab-bar bottom border with the session-selector row's
  // border so the divider runs through without a sub-pixel step. The panel's tab
  // bar is ~1px taller than the session row (its border sits outside the 44px
  // row), so we set the wrapper's top imperatively to the measured delta (no
  // state, no re-render). SidePanel is a dynamic import, so we re-align via a
  // MutationObserver once its DOM mounts, plus on window resize.
  useLayoutEffect(() => {
    const wrap = panelWrapRef.current;
    if (!previewTicketKey || !wrap) return;
    const align = () => {
      const panel = wrap.firstElementChild as HTMLElement | null;
      const tabBar = panel?.querySelector(".border-b") as HTMLElement | null;
      const sessionRow = contentRowRef.current?.parentElement?.previousElementSibling as HTMLElement | null;
      if (!panel || !tabBar || !sessionRow) return;
      const tabBarHeight = tabBar.getBoundingClientRect().bottom - panel.getBoundingClientRect().top;
      wrap.style.top = `${sessionRow.getBoundingClientRect().bottom - tabBarHeight}px`;
    };
    align();
    const observer = new MutationObserver(align);
    observer.observe(wrap, { childList: true });
    window.addEventListener("resize", align);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", align);
    };
  }, [previewTicketKey, panelAnchor.top, panelAnchor.fillWidth]);

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

  const handleCreateSession = useCallback(async (name: string) => {
    const currentQueue = queueHook.localQueue.length > 0 ? queueHook.localQueue : [];
    const created = await refinementSessionsApi.create({ name, ticketKeys: currentQueue.length > 0 ? currentQueue : undefined });
    if (currentQueue.length > 0) queueHook.setLocalQueue([]);
    setUserSelectedId(created.id);
    onSessionChange?.(created.id);
    router.replace(`/refinement/${created.id}`);
    await mutateSessions();
  }, [mutateSessions, onSessionChange, queueHook, router]);

  const activeSessions = useMemo(
    () => sessions.filter((s) => s.status !== "completed"),
    [sessions],
  );

  // --- Render ---
  return (
    <>
      {pageTitle}
      <ViewHeader
        icon={<Gem size={16} strokeWidth={1.5} />}
        hideNotifications
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="md" icon={<Plus size={13} strokeWidth={1.5} />} onClick={() => setCreateModalOpen(true)}>
              Plan session
            </Button>
            <Link href="/refinement/history">
              <Button variant="ghost" size="md" icon={<Clock size={13} strokeWidth={1.5} />}>Sessions</Button>
            </Link>
          </div>
        }
      >
        <ViewHeaderTitle>Refinement</ViewHeaderTitle>
      </ViewHeader>

      <SavedSessionList sessions={activeSessions} mutate={mutateSessions} activeSessionId={resolvedSessionId} onSelectSession={handleSelectSession} onSessionFinished={handleSessionFinished} />

      <div className="min-h-full">
        {/* On xl+ screens the container cap grows so the flex-1 ticket pane gets the extra
            room (~20-40% wider). The fixed-width queue pane keeps its size. */}
        <div ref={contentRowRef} className="mx-auto flex max-w-6xl gap-6 p-6 xl:max-w-[1600px]">
          {/* Left: ticket selection */}
          <RefinementTicketList
            availableTickets={availableTickets}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filters={filters}
            queueHook={queueHook}
            onSelectTicket={handleSelectTicket}
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

          {/* Right: queue */}
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
        </div>
      </div>

      {/* Side panel: a fixed overlay filling the right side of the layout. Its
          tab bar sits at the header bottom, one level up over the session-selector
          row, with borders aligned; the right edge reaches the viewport. It falls
          over the queue rather than shrinking the list/queue columns. */}
      {previewTicketKey && previewTicket && (
        <div
          ref={panelWrapRef}
          className="fixed bottom-0 right-0 z-50 flex"
          style={{ top: panelAnchor.top, animation: "slideInRight 0.18s ease" }}
        >
          <SidePanel
            key={previewTicketKey}
            ticket={previewTicket}
            defaultWidth={panelAnchor.fillWidth}
            storageKey="refinementPanelWidth"
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
          />
        </div>
      )}

      <CreateSessionModal open={createModalOpen} onClose={() => setCreateModalOpen(false)} onCreate={handleCreateSession} />

      {bulk.copyToast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border-strong bg-[var(--color-surface-elevated)] px-4 py-2 text-body-lg text-text-secondary shadow-[var(--shadow-md)]">
          Copied {queueHook.queueTickets.length} ticket{queueHook.queueTickets.length !== 1 ? "s" : ""} to clipboard
        </div>
      )}

      <Toast toast={actionToast} loading={actionToastLoading} onDismiss={dismissToast} />
    </>
  );
}
