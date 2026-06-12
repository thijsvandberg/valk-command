"use client";

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { refinementSessions as refinementSessionsApi } from "@/lib/api-client";

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
}

interface RefinementSessionActions {
  startSession: (keys: string[], meta?: QueueTicketMeta[], savedSessionId?: string, startIndex?: number) => void;
  nextTicket: () => void;
  prevTicket: () => void;
  goToTicket: (index: number) => void;
  toggleSidebarPanel: (panel: SidebarPanel) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  recordEstimate: (ticketKey: string, storyPoints: number | null) => void;
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
};

const INDEX_PERSIST_DELAY = 400;

export function RefinementSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RefinementSessionState>(INITIAL_STATE);
  const indexTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    });
  }, []);

  const recordEstimate = useCallback((ticketKey: string, storyPoints: number | null) => {
    setState((prev) => ({
      ...prev,
      sessionEstimates: { ...prev.sessionEstimates, [ticketKey]: storyPoints },
    }));
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
    setState((prev) => {
      if (prev.savedSessionId) {
        refinementSessionsApi
          .update(prev.savedSessionId, {
            status: "in_progress",
            currentIndex: prev.currentIndex,
            ...(generalComment !== undefined ? { generalComment } : {}),
          })
          .catch(() => {});
      }
      return { ...prev, sessionActive: false, showingEndModal: false };
    });
  }, []);

  const finishSession = useCallback((generalComment?: string | null) => {
    setState((prev) => {
      if (prev.savedSessionId) {
        refinementSessionsApi
          .update(prev.savedSessionId, {
            status: "completed",
            currentIndex: prev.currentIndex,
            ...(generalComment !== undefined ? { generalComment } : {}),
          })
          .catch(() => {});
      }
      return { ...prev, sessionActive: false, showingEndModal: false };
    });
  }, []);

  return (
    <RefinementSessionContext.Provider
      value={{
        ...state,
        startSession,
        nextTicket,
        prevTicket,
        goToTicket,
        toggleSidebarPanel,
        reorderQueue,
        recordEstimate,
        openEndModal,
        closeEndModal,
        saveSession,
        finishSession,
      }}
    >
      {children}
    </RefinementSessionContext.Provider>
  );
}

export function useRefinementSession() {
  const ctx = useContext(RefinementSessionContext);
  if (!ctx) throw new Error("useRefinementSession must be used within RefinementSessionProvider");
  return ctx;
}
