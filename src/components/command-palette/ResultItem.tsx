"use client";

import React from "react";
import {
  Zap,
  KanbanSquare,
  ArrowRight,
  MessageCircle,
  NotebookPen,
} from "lucide-react";

import type { PaletteResult } from "./types";
import { statusColor } from "./palette-data";

export function ResultIcon({ result, isActive }: { result: PaletteResult; isActive: boolean }) {
  const base = `shrink-0 flex items-center justify-center h-7 w-7 rounded-lg transition-colors duration-75`;

  switch (result.category) {
    case "page":
      return (
        <span className={`${base} ${isActive ? "bg-[var(--color-brand-600)]/15 text-[var(--color-brand-400)]" : "bg-white/[0.04] text-white/30"}`}>
          {result.icon}
        </span>
      );
    case "action":
      return (
        <span className={`${base} ${isActive ? "bg-amber-500/15 text-amber-400" : "bg-white/[0.04] text-white/30"}`}>
          <Zap className="h-4 w-4" strokeWidth={1.5} />
        </span>
      );
    case "ticket":
      return (
        <span className={`${base} ${isActive ? "bg-[var(--color-secondary-600)]/15 text-[var(--color-secondary-400)]" : "bg-white/[0.04] text-white/30"}`}>
          <KanbanSquare className="h-4 w-4" strokeWidth={1.5} />
        </span>
      );
    case "direct-ticket":
      return (
        <span className={`${base} ${isActive ? "bg-[var(--color-brand-600)]/15 text-[var(--color-brand-400)]" : "bg-white/[0.04] text-white/30"}`}>
          <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
        </span>
      );
    case "conversation":
      return (
        <span className={`${base} ${isActive ? "bg-purple-500/15 text-purple-400" : "bg-white/[0.04] text-white/30"}`}>
          <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
        </span>
      );
    case "story-writer":
      return (
        <span className={`${base} ${isActive ? "bg-emerald-500/15 text-emerald-400" : "bg-white/[0.04] text-white/30"}`}>
          <NotebookPen className="h-4 w-4" strokeWidth={1.5} />
        </span>
      );
  }
}

export function ResultLabel({ result, isActive }: { result: PaletteResult; isActive: boolean }) {
  switch (result.category) {
    case "page":
      return (
        <div className="flex flex-col min-w-0 flex-1">
          <span className={`text-sm truncate ${isActive ? "text-white/90" : "text-white/60"}`}>
            {result.label}
          </span>
        </div>
      );
    case "action":
      return (
        <div className="flex flex-col min-w-0 flex-1">
          <span className={`text-sm truncate ${isActive ? "text-white/90" : "text-white/60"}`}>
            {result.label}
          </span>
          {result.description && (
            <span className="text-[11px] text-white/25 truncate mt-0.5">{result.description}</span>
          )}
        </div>
      );
    case "ticket": {
      const sc = statusColor(result.status);
      return (
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="shrink-0 font-mono text-[11px] text-white/30 font-medium">{result.key}</span>
          <span className={`text-sm truncate ${isActive ? "text-white/90" : "text-white/60"}`}>
            {result.summary}
          </span>
          <span
            className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium capitalize"
            style={{ backgroundColor: sc.bg, color: sc.text }}
          >
            {result.status.toLowerCase()}
          </span>
        </div>
      );
    }
    case "direct-ticket":
      return (
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-mono font-semibold bg-[var(--color-brand-600)]/15 text-[var(--color-brand-400)]">
            {result.key}
          </span>
          <span className={`text-sm ${isActive ? "text-white/60" : "text-white/35"}`}>
            Press Enter to open directly
          </span>
        </div>
      );
    case "conversation":
      return (
        <div className="flex flex-col min-w-0 flex-1">
          <span className={`text-sm truncate ${isActive ? "text-white/90" : "text-white/60"}`}>
            {result.title}
          </span>
          {result.lastMessage && (
            <span className="text-xs text-white/20 truncate mt-0.5">{result.lastMessage}</span>
          )}
        </div>
      );
    case "story-writer":
      return (
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="shrink-0 font-mono text-[11px] text-white/30 font-medium">{result.ticketKey}</span>
          <span className={`text-sm truncate ${isActive ? "text-white/90" : "text-white/60"}`}>
            {result.title}
          </span>
          <span className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/[0.10] text-emerald-400/70">
            Story Writer
          </span>
        </div>
      );
  }
}
