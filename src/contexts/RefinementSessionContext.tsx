"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface TicketCompletionData {
  pointsSet: boolean;
  subtasksAdded: number;
  statusChanged: boolean;
}

interface RefinementSessionState {
  queue: string[];
  currentIndex: number;
  completionData: Record<string, TicketCompletionData>;
  notesCollapsed: boolean;
  sessionActive: boolean;
  sessionStartedAt: number | null;
}

interface RefinementSessionActions {
  startSession: (keys: string[]) => void;
  nextTicket: () => void;
  prevTicket: () => void;
  goToTicket: (index: number) => void;
  markComplete: (key: string, data: Partial<TicketCompletionData>) => void;
  toggleNotes: () => void;
  endSession: () => void;
}

type RefinementSessionContextType = RefinementSessionState & RefinementSessionActions;

const RefinementSessionContext = createContext<RefinementSessionContextType | null>(null);

const INITIAL_STATE: RefinementSessionState = {
  queue: [],
  currentIndex: 0,
  completionData: {},
  notesCollapsed: true,
  sessionActive: false,
  sessionStartedAt: null,
};

export function RefinementSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RefinementSessionState>(INITIAL_STATE);

  const startSession = useCallback((keys: string[]) => {
    setState({
      queue: keys,
      currentIndex: 0,
      completionData: {},
      notesCollapsed: true,
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
