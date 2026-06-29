"use client";

import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { refinementSessions as refinementSessionsApi } from "@/lib/api-client";
import { reportClientError } from "@/lib/client-error";
import type { TicketReadiness } from "@/types/ticket";

export interface QueueTicketMeta {
  key: string;
  title: string;
}

export type SidebarPanel = "chat" | "subtasks" | "notes" | "info";

interface RefinementSessionState {
  queue: string[];
  queueMeta: QueueTicketMeta[];
  currentIndex: number;
  activeSidebarPanel: SidebarPanel | null;
  sessionActive: boolean;
  showingEndModal: boolean;
  sessionStartedAt: number | null;
  savedSessionId: string | null;
  // Story points chosen during this session, keyed by ticket. The wrap-up
  // modal reads these instead of the shared ticket caches, which can lag
  // behind (or be overwritten by a stale refetch) while a save is in flight.
  sessionEstimates: Record<string, number | null>;
  // Subtask counts observed during this session, keyed by ticket. Same reason
  // as sessionEstimates: subtasks created moments before opening the wrap-up
  // are not yet reflected in the shared ticket cache, so the last ticket would
  // otherwise show "No subtasks" despite having them.
  sessionSubtaskCounts: Record<string, number>;
  // Readiness observed during this session, keyed by ticket. Same reason as
  // sessionEstimates: estimating a ticket advances "Ready to Refine" -> "Ready
  // for Development" (readiness null) server-side, but the shared list cache the
  // wrap-up reads can still hold the pre-session "ready_to_refine" value. Without
  // this mirror the just-estimated last ticket reads as "not ready" and gets
  // wrongly pre-checked for carry-over when you go straight to wrap-up.
  sessionReadiness: Record<string, TicketReadiness | null>;
}

interface RefinementSessionActions {
  startSession: (keys: string[], meta?: QueueTicketMeta[], savedSessionId?: string, startIndex?: number) => void;
  nextTicket: () => void;
  prevTicket: () => void;
  goToTicket: (index: number) => void;
  toggleSidebarPanel: (panel: SidebarPanel) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  recordEstimate: (ticketKey: string, storyPoints: number | null) => void;
  recordSubtaskCount: (ticketKey: string, count: number) => void;
  recordReadiness: (ticketKey: string, readiness: TicketReadiness | null) => void;
  openEndModal: () => void;
  closeEndModal: () => void;
  saveSession: (generalComment?: string | null) => void;
  finishSession: (generalComment?: string | null) => void;
}

type RefinementSessionContextType = RefinementSessionState & RefinementSessionActions;

const RefinementSessionContext = createContext<RefinementSessionContextType | null>(null);

const INITIAL_STATE: RefinementSessionState = {
  queue: [],
  queueMeta: [],
  currentIndex: 0,
  activeSidebarPanel: null,
  sessionActive: false,
  showingEndModal: false,
  sessionStartedAt: null,
  savedSessionId: null,
  sessionEstimates: {},
  sessionSubtaskCounts: {},
  sessionReadiness: {},
};

const INDEX_PERSIST_DELAY = 400;

export function RefinementSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RefinementSessionState>(INITIAL_STATE);
  const indexTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirror of the latest committed state, read by save/finish so their API call can run
  // outside the setState updater (updaters must be pure; StrictMode runs them twice).
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const persistCurrentIndex = useCallback((sessionId: string, index: number) => {
    if (indexTimerRef.current) clearTimeout(indexTimerRef.current);
    indexTimerRef.current = setTimeout(() => {
      refinementSessionsApi.update(sessionId, { currentIndex: index }).catch(() => {});
    }, INDEX_PERSIST_DELAY);
  }, []);

  const startSession = useCallback((keys: string[], meta?: QueueTicketMeta[], savedSessionId?: string, startIndex?: number) => {
    setState({
      queue: keys,
      queueMeta: meta ?? keys.map((k) => ({ key: k, title: k })),
      currentIndex: startIndex != null ? Math.max(0, Math.min(startIndex, keys.length - 1)) : 0,
      activeSidebarPanel: null,
      sessionActive: true,
      showingEndModal: false,
      sessionStartedAt: Date.now(),
      savedSessionId: savedSessionId ?? null,
      sessionEstimates: {},
      sessionSubtaskCounts: {},
      sessionReadiness: {},
    });
  }, []);

  const recordEstimate = useCallback((ticketKey: string, storyPoints: number | null) => {
    setState((prev) => ({
      ...prev,
      sessionEstimates: { ...prev.sessionEstimates, [ticketKey]: storyPoints },
    }));
  }, []);

  const recordSubtaskCount = useCallback((ticketKey: string, count: number) => {
    setState((prev) => {
      if (prev.sessionSubtaskCounts[ticketKey] === count) return prev;
      return {
        ...prev,
        sessionSubtaskCounts: { ...prev.sessionSubtaskCounts, [ticketKey]: count },
      };
    });
  }, []);

  const recordReadiness = useCallback((ticketKey: string, readiness: TicketReadiness | null) => {
    setState((prev) => {
      if (prev.sessionReadiness[ticketKey] === readiness) return prev;
      return {
        ...prev,
        sessionReadiness: { ...prev.sessionReadiness, [ticketKey]: readiness },
      };
    });
  }, []);

  const nextTicket = useCallback(() => {
    setState((prev) => {
      const newIndex = Math.min(prev.currentIndex + 1, prev.queue.length - 1);
      if (newIndex === prev.currentIndex) return prev;
      if (prev.savedSessionId) persistCurrentIndex(prev.savedSessionId, newIndex);
      // Collapse the sidebar so each story starts focused on the description.
      return { ...prev, currentIndex: newIndex, activeSidebarPanel: null };
    });
  }, [persistCurrentIndex]);

  const prevTicket = useCallback(() => {
    setState((prev) => {
      const newIndex = Math.max(prev.currentIndex - 1, 0);
      if (newIndex === prev.currentIndex) return prev;
      if (prev.savedSessionId) persistCurrentIndex(prev.savedSessionId, newIndex);
      return { ...prev, currentIndex: newIndex, activeSidebarPanel: null };
    });
  }, [persistCurrentIndex]);

  const goToTicket = useCallback((index: number) => {
    setState((prev) => {
      const newIndex = Math.max(0, Math.min(index, prev.queue.length - 1));
      if (newIndex === prev.currentIndex) return prev;
      if (prev.savedSessionId) persistCurrentIndex(prev.savedSessionId, newIndex);
      return { ...prev, currentIndex: newIndex, activeSidebarPanel: null };
    });
  }, [persistCurrentIndex]);

  const toggleSidebarPanel = useCallback((panel: SidebarPanel) => {
    setState((prev) => ({
      ...prev,
      activeSidebarPanel: prev.activeSidebarPanel === panel ? null : panel,
    }));
  }, []);

  const reorderQueue = useCallback((fromIndex: number, toIndex: number) => {
    setState((prev) => {
      const newQueue = [...prev.queue];
      const newMeta = [...prev.queueMeta];
      const [movedKey] = newQueue.splice(fromIndex, 1);
      newQueue.splice(toIndex, 0, movedKey);
      const [movedMeta] = newMeta.splice(fromIndex, 1);
      newMeta.splice(toIndex, 0, movedMeta);
      const currentKey = prev.queue[prev.currentIndex];
      const newIndex = newQueue.indexOf(currentKey);
      return {
        ...prev,
        queue: newQueue,
        queueMeta: newMeta,
        currentIndex: newIndex >= 0 ? newIndex : prev.currentIndex,
      };
    });
  }, []);

  const openEndModal = useCallback(() => {
    setState((prev) => ({ ...prev, showingEndModal: true }));
  }, []);

  const closeEndModal = useCallback(() => {
    setState((prev) => ({ ...prev, showingEndModal: false }));
  }, []);

  const saveSession = useCallback((generalComment?: string | null) => {
    const { savedSessionId, currentIndex } = stateRef.current;
    if (savedSessionId) {
      refinementSessionsApi
        .update(savedSessionId, {
          status: "in_progress",
          currentIndex,
          ...(generalComment !== undefined ? { generalComment } : {}),
        })
        // A failed status write used to be swallowed (BRDG-401): the session
        // would stay at the wrong status with no trace. The modal navigates away
        // right after this resolves, so a toast here would not be seen; forward
        // the failure to the server log instead (sessionId only, no field values).
        .catch((err) => reportClientError(`refinement save-session session=${savedSessionId}`, err, { source: "refinement" }));
    }
    setState((prev) => ({ ...prev, sessionActive: false, showingEndModal: false }));
  }, []);

  const finishSession = useCallback((generalComment?: string | null) => {
    const { savedSessionId, currentIndex } = stateRef.current;
    if (savedSessionId) {
      refinementSessionsApi
        .update(savedSessionId, {
          status: "completed",
          currentIndex,
          ...(generalComment !== undefined ? { generalComment } : {}),
        })
        // Swallowing this left the session eternally in_progress with no trace
        // (BRDG-401). Navigation follows immediately, so report server-side
        // rather than toast (sessionId only, no field values).
        .catch((err) => reportClientError(`refinement finish-session session=${savedSessionId}`, err, { source: "refinement" }));
    }
    setState((prev) => ({ ...prev, sessionActive: false, showingEndModal: false }));
  }, []);

  // Stable value so renders that do not change state don't re-render the whole fullscreen
  // refinement subtree. All callbacks are already stable; state is the only changing dep.
  const value = useMemo<RefinementSessionContextType>(
    () => ({
      ...state,
      startSession,
      nextTicket,
      prevTicket,
      goToTicket,
      toggleSidebarPanel,
      reorderQueue,
      recordEstimate,
      recordSubtaskCount,
      recordReadiness,
      openEndModal,
      closeEndModal,
      saveSession,
      finishSession,
    }),
    [
      state,
      startSession,
      nextTicket,
      prevTicket,
      goToTicket,
      toggleSidebarPanel,
      reorderQueue,
      recordEstimate,
      recordSubtaskCount,
      recordReadiness,
      openEndModal,
      closeEndModal,
      saveSession,
      finishSession,
    ],
  );

  return (
    <RefinementSessionContext.Provider value={value}>
      {children}
    </RefinementSessionContext.Provider>
  );
}

export function useRefinementSession() {
  const ctx = useContext(RefinementSessionContext);
  if (!ctx) throw new Error("useRefinementSession must be used within RefinementSessionProvider");
  return ctx;
}
