"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useFocusMode } from "@/hooks/useFocusMode";

interface FocusModeContextValue {
  focusMode: boolean;
  toggleFocusMode: () => void;
  exitFocusMode: () => void;
}

const NOOP = () => {};

const DEFAULT_VALUE: FocusModeContextValue = {
  focusMode: false,
  toggleFocusMode: NOOP,
  exitFocusMode: NOOP,
};

const FocusModeContext = createContext<FocusModeContextValue>(DEFAULT_VALUE);

export function FocusModeProvider({ children }: { children: ReactNode }) {
  const value = useFocusMode();
  return (
    <FocusModeContext.Provider value={value}>
      {children}
    </FocusModeContext.Provider>
  );
}

export function useFocusModeContext(): FocusModeContextValue {
  return useContext(FocusModeContext);
}
