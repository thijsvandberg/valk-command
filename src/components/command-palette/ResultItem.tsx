"use client";

import React from "react";
import {
  Zap,
  KanbanSquare,
  ArrowRight,
  MessageCircle,
  NotebookPen,
  Scissors,
  Layers,
} from "lucide-react";

import type { PaletteResult } from "./types";
import { statusColor } from "./palette-data";

export function ResultIcon({ result, isActive }: { result: PaletteResult; isActive: boolean }) {
  const base = `shrink-0 flex items-center justify-center h-7 w-7 rounded-lg transition-colors duration-75`;

  switch (result.category) {
    case "page":
      return (
        <span className={`${base} ${isActive ? "bg-[var(--color-brand-600)]/15 text-[var(--color-brand-400)]" : "bg-overlay-subtle text-text-tertiary"}`}>
          {result.icon}
        </span>
      );
    case "action":
      return (
        <span className={`${base} ${isActive ? "bg-amber-500/15 text-amber-400" : "bg-overlay-subtle text-text-tertiary"}`}>
          <Zap className="h-4 w-4" strokeWidth={1.5} />
        </span>
      );
    case "ticket":
      return (
        <span className={`${base} ${isActive ? "bg-[var(--color-secondary-600)]/15 text-[var(--color-secondary-400)]" : "bg-overlay-subtle text-text-tertiary"}`}>
          <KanbanSquare className="h-4 w-4" strokeWidth={1.5} />
        </span>
      );
    case "direct-ticket":
      return (
        <span className={`${base} ${isActive ? "bg-[var(--color-brand-600)]/15 text-[var(--color-brand-400)]" : "bg-overlay-subtle text-text-tertiary"}`}>
          <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
        </span>
      );
    case "conversation":
      return (
        <span className={`${base} ${isActive ? "bg-purple-500/15 text-purple-400" : "bg-overlay-subtle text-text-tertiary"}`}>
          <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
        </span>
      );
    case "story-writer":
      return (
        <span className={`${base} ${isActive ? "bg-emerald-500/15 text-emerald-400" : "bg-overlay-subtle text-text-tertiary"}`}>
          <NotebookPen className="h-4 w-4" strokeWidth={1.5} />
        </span>
      );
    case "epic":
      return (
        <span className={`${base} ${isActive ? "bg-[#9b6cd4]/15 text-[#9b6cd4]" : "bg-overlay-subtle text-text-tertiary"}`}>
          <Layers className="h-4 w-4" strokeWidth={1.5} />
        </span>
      );
  }
}

export function ResultLabel({ result, isActive }: { result: PaletteResult; isActive: boolean }) {
  switch (result.category) {
    case "page":
      return (
        <div className="flex flex-col min-w-0 flex-1">
          <span className={`text-body-lg truncate ${isActive ? "text-text-primary" : "text-text-secondary"}`}>
            {result.label}
          </span>
        </div>
      );
    case "action":
      return (
        <div className="flex flex-col min-w-0 flex-1">
          <span className={`text-body-lg truncate ${isActive ? "text-text-primary" : "text-text-secondary"}`}>
            {result.label}
          </span>
          {result.description && (
            <span className="text-label text-text-muted truncate mt-0.5">{result.description}</span>
          )}
        </div>
      );
    case "ticket": {
      const sc = statusColor(result.status);
      return (
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="shrink-0 font-mono text-label text-text-tertiary font-medium">{result.key}</span>
          <span className={`text-body-lg truncate ${isActive ? "text-text-primary" : "text-text-secondary"}`}>
            {result.summary}
          </span>
          <span
            className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-caption font-medium capitalize"
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
          <span className="shrink-0 rounded px-1.5 py-0.5 text-label font-mono font-semibold bg-[var(--color-brand-600)]/15 text-[var(--color-brand-400)]">
            {result.key}
          </span>
          <span className={`text-body-lg ${isActive ? "text-text-secondary" : "text-text-tertiary"}`}>
            Press Enter to open directly
          </span>
        </div>
      );
    case "conversation":
      return (
        <div className="flex flex-col min-w-0 flex-1">
          <span className={`text-body-lg truncate ${isActive ? "text-text-primary" : "text-text-secondary"}`}>
            {result.title}
          </span>
          {result.lastMessage && (
            <span className="text-body-sm text-text-muted truncate mt-0.5">{result.lastMessage}</span>
          )}
        </div>
      );
    case "epic": {
      const ec = statusColor(result.status);
      return (
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="shrink-0 font-mono text-label text-text-tertiary font-medium">{result.key}</span>
            <span className={`text-body-lg truncate ${isActive ? "text-text-primary" : "text-text-secondary"}`}>
              {result.name}
            </span>
            <span
              className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-caption font-medium capitalize"
              style={{ backgroundColor: ec.bg, color: ec.text }}
            >
              {result.status.toLowerCase()}
            </span>
            {result.childCount > 0 && (
              <span className="shrink-0 text-caption text-text-muted">
                {result.childCount} {result.childCount === 1 ? "issue" : "issues"}
              </span>
            )}
          </div>
          {result.summary && (
            <span className="text-label text-text-muted truncate mt-0.5">{result.summary}</span>
          )}
        </div>
      );
    }
    case "story-writer":
      return (
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="shrink-0 font-mono text-label text-text-tertiary font-medium">{result.ticketKey}</span>
          {result.targetTicketKey && (
            <>
              <Scissors size={9} strokeWidth={2} className="shrink-0 text-violet-400/50" />
              <span className="shrink-0 font-mono text-label text-text-tertiary font-medium">{result.targetTicketKey}</span>
            </>
          )}
          <span className={`text-body-lg truncate ${isActive ? "text-text-primary" : "text-text-secondary"}`}>
            {result.title}
          </span>
          {result.targetTicketKey && (
            <span className="shrink-0 rounded px-1.5 py-0.5 text-caption font-medium bg-violet-500/[0.10] text-violet-400/70">
              Split
            </span>
          )}
          <span className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-caption font-medium bg-emerald-500/[0.10] text-emerald-400/70">
            Story Writer
          </span>
        </div>
      );
  }
}
