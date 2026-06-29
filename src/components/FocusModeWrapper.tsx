"use client";

import { type ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { FocusModeProvider, useFocusModeContext } from "@/contexts/FocusModeContext";
import { useCornerSnap, CORNER_CLASSES } from "@/hooks/useCornerSnap";

function FocusModeLayout({ children }: { children: ReactNode }) {
  const { focusMode, exitFocusMode } = useFocusModeContext();
  const { corner, isDragging, style, handlers } = useCornerSnap({
    enabled: focusMode,
    onClick: exitFocusMode,
  });

  return (
    <div className="flex flex-col h-screen bg-surface-base text-text-primary">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200] focus:rounded-lg focus:bg-[var(--color-brand-600)] focus:px-4 focus:py-2 focus:text-white focus:text-body-lg focus:shadow-lg focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--color-brand-500)]/50"
      >
        Skip to content
      </a>

      {/* Header portal - slides up when focus mode is active */}
      <div
        id="view-header-portal"
        className={`relative z-30 shrink-0 transition-[transform,opacity] duration-300 ease-out origin-top ${
          focusMode
            ? "-translate-y-full opacity-0 max-h-0 overflow-hidden"
            : "translate-y-0 opacity-100"
        }`}
      />

      {/* Content. Primary navigation now lives in the header command bar
          (BRDG-320), so main spans the full width with no reserved column. */}
      <div className="flex flex-1 min-h-0">
        <main
          id="main-content"
          className="flex-1 overflow-auto isolate bg-surface-elevated"
        >
          {children}
        </main>
      </div>

      {/* Floating exit button - draggable in focus mode; snaps to the nearest corner. */}
      <button
        {...handlers}
        title="Exit focus mode"
        aria-label="Exit focus mode"
        style={style}
        className={`fixed ${CORNER_CLASSES[corner]} z-[100] flex h-8 w-8 items-center justify-center rounded-lg cursor-pointer touch-none
          bg-surface-floating border border-border-default
          text-text-tertiary
          hover:text-text-primary hover:bg-surface-elevated
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]
          active:scale-[0.97]
          shadow-[0_2px_8px_rgba(0,0,0,0.15),0_0_1px_rgba(0,0,0,0.1)]
          transition-[opacity,transform] duration-200
          ${isDragging ? "cursor-grabbing" : ""}
          ${focusMode
            ? "opacity-40 hover:opacity-100 focus-visible:opacity-100 pointer-events-auto delay-300"
            : "opacity-0 pointer-events-none"
          }`}
      >
        <Maximize2 className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}

export function FocusModeWrapper({ children }: { children: ReactNode }) {
  return (
    <FocusModeProvider>
      <FocusModeLayout>{children}</FocusModeLayout>
    </FocusModeProvider>
  );
}
