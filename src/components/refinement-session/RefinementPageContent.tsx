"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useJiraSprints, useTickets, useSprintSlots } from "@/hooks/useSprintBoard";
import { useRefinementSession } from "@/contexts/RefinementSessionContext";
import { useRefinementSessions } from "@/hooks/useRefinementSessions";
import { useRefinementFilters } from "@/hooks/useRefinementFilters";
import { useRefinementQueue } from "@/hooks/useRefinementQueue";
import { useBulkSuggest } from "@/hooks/useBulkSuggest";
import { refinementSessions as refinementSessionsApi } from "@/lib/api-client";
import { Gem, Play, Plus, Clock } from "lucide-react";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { Button } from "@/components/ui/Button";
import { SavedSessionList } from "@/components/refinement-session/SavedSessionList";
import Link from "next/link";
import { CreateSessionModal } from "@/components/refinement-session/CreateSessionModal";
import { filterTickets, smartSort, MIN_TICKETS } from "./refinement-utils";
import { ResizableQueuePane } from "./ResizableQueuePane";
import { RefinementQueuePanel } from "./RefinementQueuePanel";
import { RefinementTicketList } from "./RefinementTicketList";

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
    if (userSelectedId && sessions.some((s) => s.id === userSelectedId)) return userSelectedId;
    const firstDraft = sessions.find((s) => s.status !== "completed");
    return firstDraft?.id ?? null;
  }, [userSelectedId, sessions]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === resolvedSessionId) ?? null,
    [sessions, resolvedSessionId],
  );

  const hasCheckedSession = useRef(false);
  useEffect(() => {
    if (!initialSessionId || sessions.length === 0 || hasCheckedSession.current) return;
    hasCheckedSession.current = true;
    if (!sessions.some((s) => s.id === initialSessionId)) {
      router.replace("/refinement");
    }
  }, [initialSessionId, sessions, router]);

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
    },
    [onSessionChange, flushPersistTimer],
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
    refinementSessionsApi.update(sessionId, { status: "in_progress" }).catch(() => {});
    startSession(queueHook.queue, meta, sessionId);
    router.push(`/refinement/${sessionId}/session/${encodeURIComponent(queueHook.queue[0])}`);
  }, [canStart, queueHook, resolvedSessionId, mutateSessions, startSession, router]);

  const handleSaveAsSession = useCallback(async () => {
    if (queueHook.localQueue.length === 0) return;
    const created = await refinementSessionsApi.create({ ticketKeys: queueHook.localQueue });
    queueHook.setLocalQueue([]);
    setUserSelectedId(created.id);
    onSessionChange?.(created.id);
    await mutateSessions();
  }, [queueHook, mutateSessions, onSessionChange]);

  const [createModalOpen, setCreateModalOpen] = useState(false);

  const handleCreateSession = useCallback(async (name: string) => {
    const created = await refinementSessionsApi.create({ name });
    setUserSelectedId(created.id);
    onSessionChange?.(created.id);
    await mutateSessions();
  }, [mutateSessions, onSessionChange]);

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
              New session
            </Button>
            <Link href="/refinement/history">
              <Button variant="ghost" size="md" icon={<Clock size={13} strokeWidth={1.5} />}>Sessions</Button>
            </Link>
            {canStart && (
              <>
                <div className="h-5 w-px bg-border-default" />
                <Button variant="primary" size="lg" icon={<Play size={14} strokeWidth={2} />} onClick={handleBeginRefinement}>
                  Start Refinement ({queueHook.queue.length})
                </Button>
              </>
            )}
          </div>
        }
      >
        <ViewHeaderTitle>Refinement</ViewHeaderTitle>
      </ViewHeader>

      <SavedSessionList sessions={activeSessions} mutate={mutateSessions} activeSessionId={resolvedSessionId} onSelectSession={handleSelectSession} />

      <div className="min-h-full">
        <div className="mx-auto flex max-w-6xl gap-6 p-6">
          {/* Left: ticket selection */}
          <RefinementTicketList
            availableTickets={availableTickets}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filters={filters}
            queueHook={queueHook}
            pinnedSprintIds={pinnedSprintIds}
            epicOptions={epicOptions}
            sprintNameMap={sprintNameMap}
            ticketSessionMap={ticketSessionMap}
            resolvedSessionId={resolvedSessionId}
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

      <CreateSessionModal open={createModalOpen} onClose={() => setCreateModalOpen(false)} onCreate={handleCreateSession} />

      {bulk.copyToast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border-strong bg-[var(--color-surface-elevated)] px-4 py-2 text-body-lg text-text-secondary shadow-[var(--shadow-md)]">
          Copied {queueHook.queueTickets.length} ticket{queueHook.queueTickets.length !== 1 ? "s" : ""} to clipboard
        </div>
      )}
    </>
  );
}
