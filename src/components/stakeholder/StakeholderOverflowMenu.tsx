"use client";

import { useState, useRef } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import {
  MoreHorizontal,
  CloudDownload,
  History,
  Columns2,
  Copy,
  Check,
} from "lucide-react";
import { buildMarkdownSummary, buildPlainTextSummary } from "@/lib/stakeholder-data";
import type { StakeholderSprint, StakeholderTicket } from "@/lib/stakeholder-data";

const navBtnClass =
  "flex items-center rounded-md p-1.5 text-text-tertiary cursor-pointer hover:bg-hover-interactive hover:text-text-secondary disabled:opacity-25 disabled:cursor-not-allowed transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]";

export function StakeholderOverflowMenu({
  onSyncSprint,
  onSyncHistory,
  isSyncing,
  isSyncingHistory,
  syncDisabled,
  hasPreviousSprint,
  isCompareMode,
  onToggleCompare,
  sprint,
  doneTickets,
  inProgressTickets,
  todoTickets,
  aiNarrative,
  aiRisks,
}: {
  onSyncSprint: () => void;
  onSyncHistory: () => void;
  isSyncing: boolean;
  isSyncingHistory: boolean;
  syncDisabled: boolean;
  hasPreviousSprint: boolean;
  isCompareMode: boolean;
  onToggleCompare: () => void;
  sprint: StakeholderSprint | null;
  doneTickets: StakeholderTicket[];
  inProgressTickets: StakeholderTicket[];
  todoTickets: StakeholderTicket[];
  aiNarrative: string | null;
  aiRisks: string[];
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedPlain, setCopiedPlain] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useOutsideClick(containerRef, () => setOpen(false), { enabled: open });

  async function handleCopy() {
    if (!sprint) return;
    const md = buildMarkdownSummary(sprint, doneTickets, inProgressTickets, todoTickets, [], null, aiNarrative ?? undefined, aiRisks);
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  async function handleCopyPlain() {
    if (!sprint) return;
    const text = buildPlainTextSummary(sprint, doneTickets);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPlain(true);
      setTimeout(() => setCopiedPlain(false), 2000);
    } catch {}
  }

  const itemClass =
    "flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary cursor-pointer hover:bg-overlay-default hover:text-text-primary transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          navBtnClass,
          open ? "bg-overlay-default text-text-secondary" : "",
        ].join(" ")}
        aria-label="More options"
        title="More options"
      >
        <MoreHorizontal size={15} strokeWidth={1.5} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[188px] rounded-lg border border-border-strong bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-popover)]">
          <button
            type="button"
            onClick={() => { onSyncSprint(); setOpen(false); }}
            disabled={isSyncing || syncDisabled}
            className={itemClass}
          >
            <CloudDownload size={12} strokeWidth={1.5} className={isSyncing ? "animate-spin" : ""} />
            Sync current sprint
          </button>
          <button
            type="button"
            onClick={() => { onSyncHistory(); setOpen(false); }}
            disabled={isSyncingHistory || syncDisabled}
            className={itemClass}
          >
            <History size={12} strokeWidth={1.5} className={isSyncingHistory ? "animate-spin" : ""} />
            Sync history
          </button>

          {hasPreviousSprint && (
            <>
              <div className="my-1 h-px bg-overlay-default" />
              <button
                type="button"
                onClick={() => { onToggleCompare(); setOpen(false); }}
                className={itemClass}
              >
                <Columns2 size={12} strokeWidth={1.5} />
                <span className="flex-1 text-left">Compare sprints</span>
                {isCompareMode && <Check size={10} strokeWidth={2} className="text-[var(--color-brand-400)]/70" />}
              </button>
            </>
          )}

          {sprint && (
            <>
              <div className="my-1 h-px bg-overlay-default" />
              <button
                type="button"
                onClick={handleCopy}
                className={itemClass}
              >
                {copied ? (
                  <>
                    <Check size={12} strokeWidth={2} className="text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} strokeWidth={1.5} />
                    Copy as Markdown
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleCopyPlain}
                className={itemClass}
              >
                {copiedPlain ? (
                  <>
                    <Check size={12} strokeWidth={2} className="text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} strokeWidth={1.5} />
                    Copy as plain text
                  </>
                )}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
