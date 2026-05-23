"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface TicketCompletionData {
  pointsSet: boolean;
  subtasksAdded: number;
  statusChanged: boolean;
}

export interface QueueTicketMeta {
  key: string;
  title: string;
}

interface RefinementSessionState {
  queue: string[];
  queueMeta: QueueTicketMeta[];
  currentIndex: number;
  completionData: Record<string, TicketCompletionData>;
  notesCollapsed: boolean;
  subtasksPaneOpen: boolean;
  sessionActive: boolean;
  sessionStartedAt: number | null;
}

interface RefinementSessionActions {
  startSession: (keys: string[], meta?: QueueTicketMeta[]) => void;
  nextTicket: () => void;
  prevTicket: () => void;
  goToTicket: (index: number) => void;
  markComplete: (key: string, data: Partial<TicketCompletionData>) => void;
  toggleNotes: () => void;
  toggleSubtasksPane: () => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  endSession: () => void;
}

type RefinementSessionContextType = RefinementSessionState & RefinementSessionActions;

const RefinementSessionContext = createContext<RefinementSessionContextType | null>(null);

const INITIAL_STATE: RefinementSessionState = {
  queue: [],
  queueMeta: [],
  currentIndex: 0,
  completionData: {},
  notesCollapsed: true,
  subtasksPaneOpen: false,
  sessionActive: false,
  sessionStartedAt: null,
};

export function RefinementSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RefinementSessionState>(INITIAL_STATE);

  const startSession = useCallback((keys: string[], meta?: QueueTicketMeta[]) => {
    setState({
      queue: keys,
      queueMeta: meta ?? keys.map((k) => ({ key: k, title: k })),
      currentIndex: 0,
      completionData: {},
      notesCollapsed: true,
      subtasksPaneOpen: false,
      sessionActive: true,
      sessionStartedAt: Date.now(),
    });
  }, []);

  const nextTicket = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentIndex: Math.min(prev.currentIndex + 1, prev.queue.length),
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

  const markComplete = useCallback((key: string, data: Partial<TicketCompletionData>) => {
    setState((prev) => {
      const existing = prev.completionData[key] ?? {
        pointsSet: false,
        subtasksAdded: 0,
        statusChanged: false,
      };
      return {
        ...prev,
        completionData: {
          ...prev.completionData,
          [key]: { ...existing, ...data },
        },
      };
    });
  }, []);

  const toggleNotes = useCallback(() => {
    setState((prev) => ({ ...prev, notesCollapsed: !prev.notesCollapsed }));
  }, []);

  const toggleSubtasksPane = useCallback(() => {
    setState((prev) => ({ ...prev, subtasksPaneOpen: !prev.subtasksPaneOpen }));
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
    setState((prev) => ({
      ...prev,
      sessionActive: false,
    }));
  }, []);

  return (
    <RefinementSessionContext.Provider
      value={{
        ...state,
        startSession,
        nextTicket,
        prevTicket,
        goToTicket,
        markComplete,
        toggleNotes,
        toggleSubtasksPane,
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
