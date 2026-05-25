"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { refinementSessions as refinementSessionsApi } from "@/lib/api-client";

export interface QueueTicketMeta {
  key: string;
  title: string;
}

interface RefinementSessionState {
  queue: string[];
  queueMeta: QueueTicketMeta[];
  currentIndex: number;
  notesCollapsed: boolean;
  subtasksPaneOpen: boolean;
  chatPaneOpen: boolean;
  sessionActive: boolean;
  sessionStartedAt: number | null;
  savedSessionId: string | null;
}

interface RefinementSessionActions {
  startSession: (keys: string[], meta?: QueueTicketMeta[], savedSessionId?: string) => void;
  nextTicket: () => void;
  prevTicket: () => void;
  goToTicket: (index: number) => void;
  toggleNotes: () => void;
  toggleSubtasksPane: () => void;
  toggleChatPane: () => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  endSession: () => void;
}

type RefinementSessionContextType = RefinementSessionState & RefinementSessionActions;

const RefinementSessionContext = createContext<RefinementSessionContextType | null>(null);

const INITIAL_STATE: RefinementSessionState = {
  queue: [],
  queueMeta: [],
  currentIndex: 0,
  notesCollapsed: true,
  subtasksPaneOpen: false,
  chatPaneOpen: false,
  sessionActive: false,
  sessionStartedAt: null,
  savedSessionId: null,
};

export function RefinementSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RefinementSessionState>(INITIAL_STATE);

  const startSession = useCallback((keys: string[], meta?: QueueTicketMeta[], savedSessionId?: string) => {
    setState({
      queue: keys,
      queueMeta: meta ?? keys.map((k) => ({ key: k, title: k })),
      currentIndex: 0,
      notesCollapsed: true,
      subtasksPaneOpen: false,
      chatPaneOpen: false,
      sessionActive: true,
      sessionStartedAt: Date.now(),
      savedSessionId: savedSessionId ?? null,
    });
  }, []);

  const nextTicket = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentIndex: Math.min(prev.currentIndex + 1, prev.queue.length - 1),
    }));
  }, []);

  const prevTicket = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentIndex: Math.max(prev.currentIndex - 1, 0),
    }));
  }, []);

  const goToTicket = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      currentIndex: Math.max(0, Math.min(index, prev.queue.length - 1)),
    }));
  }, []);

  const toggleNotes = useCallback(() => {
    setState((prev) => ({ ...prev, notesCollapsed: !prev.notesCollapsed }));
  }, []);

  const toggleSubtasksPane = useCallback(() => {
    setState((prev) => ({ ...prev, subtasksPaneOpen: !prev.subtasksPaneOpen }));
  }, []);

  const toggleChatPane = useCallback(() => {
    setState((prev) => ({ ...prev, chatPaneOpen: !prev.chatPaneOpen }));
  }, []);

  const reorderQueue = useCallback((fromIndex: number, toIndex: number) => {
    setState((prev) => {
      const newQueue = [...prev.queue];
      const newMeta = [...prev.queueMeta];
      const [movedKey] = newQueue.splice(fromIndex, 1);
      newQueue.splice(toIndex, 0, movedKey);
      const [movedMeta] = newMeta.splice(fromIndex, 1);
      newMeta.splice(toIndex, 0, movedMeta);
      // Keep currentIndex pointing to the same ticket
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

  const endSession = useCallback(() => {
    setState((prev) => {
      if (prev.savedSessionId) {
        refinementSessionsApi
          .update(prev.savedSessionId, { status: "completed" })
          .catch(() => {});
      }
      return { ...prev, sessionActive: false };
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
        toggleNotes,
        toggleSubtasksPane,
        toggleChatPane,
        reorderQueue,
        endSession,
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
