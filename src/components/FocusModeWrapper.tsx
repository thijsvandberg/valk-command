"use client";

import { type ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { FocusModeProvider, useFocusModeContext } from "@/contexts/FocusModeContext";
import Sidebar from "@/components/Sidebar";

function FocusModeLayout({ children }: { children: ReactNode }) {
  const { focusMode, exitFocusMode } = useFocusModeContext();

  return (
    <div className="flex flex-col h-screen bg-[var(--color-surface-base)] text-text-primary">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200] focus:rounded-lg focus:bg-[var(--color-brand-600)] focus:px-4 focus:py-2 focus:text-white focus:text-body-lg focus:shadow-lg focus:outline-none"
      >
        Skip to content
      </a>

      {/* Header portal - slides up when focus mode is active */}
      <div
        id="view-header-portal"
        className={`shrink-0 transition-[transform,opacity] duration-300 ease-out origin-top ${
          focusMode
            ? "-translate-y-full opacity-0 max-h-0 overflow-hidden"
            : "translate-y-0 opacity-100"
        }`}
      />

      {/* Sidebar + content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar wrapper - slides left when focus mode is active */}
        <div
          id="sidebar-wrapper"
          className={`shrink-0 overflow-hidden transition-[transform,opacity] duration-300 ease-out ${
            focusMode
              ? "-translate-x-full opacity-0 w-0"
              : "translate-x-0 opacity-100 w-[52px]"
          }`}
        >
          <Sidebar />
        </div>

        <main
          id="main-content"
          className="flex-1 overflow-auto isolate bg-[var(--color-surface-elevated)]"
        >
          {children}
        </main>
      </div>

      {/* Floating exit button - appears in focus mode, top-right to match the toggle position */}
      <button
        onClick={exitFocusMode}
        title="Exit focus mode"
        aria-label="Exit focus mode"
        className={`fixed top-3 right-3 z-[100] flex h-8 w-8 items-center justify-center rounded-lg cursor-pointer
          bg-[var(--color-surface-floating)] border border-border-default
          text-text-tertiary
          hover:text-text-primary hover:bg-[var(--color-surface-elevated)]
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]
          active:scale-[0.95]
          shadow-[0_2px_8px_rgba(0,0,0,0.15),0_0_1px_rgba(0,0,0,0.1)]
          transition-[opacity,transform] duration-200
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
