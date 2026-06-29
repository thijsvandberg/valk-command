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
import { MenuItem } from "@/components/shared/MenuItem";

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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
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
        <div role="menu" className="absolute right-0 top-full mt-1.5 z-50 min-w-[188px] rounded-lg border border-border-strong bg-surface-floating py-1 shadow-popover">
          <MenuItem
            onClick={() => { onSyncSprint(); setOpen(false); }}
            disabled={isSyncing || syncDisabled}
            icon={<CloudDownload size={12} strokeWidth={1.5} className={isSyncing ? "animate-spin" : ""} />}
          >
            Sync current sprint
          </MenuItem>
          <MenuItem
            onClick={() => { onSyncHistory(); setOpen(false); }}
            disabled={isSyncingHistory || syncDisabled}
            icon={<History size={12} strokeWidth={1.5} className={isSyncingHistory ? "animate-spin" : ""} />}
          >
            Sync history
          </MenuItem>

          {hasPreviousSprint && (
            <>
              <div className="my-1 h-px bg-overlay-default" />
              <MenuItem
                onClick={() => { onToggleCompare(); setOpen(false); }}
                icon={<Columns2 size={12} strokeWidth={1.5} />}
              >
                <span className="flex-1 text-left">Compare sprints</span>
                {isCompareMode && <Check size={10} strokeWidth={2} className="text-[var(--color-brand-400)]/70" />}
              </MenuItem>
            </>
          )}

          {sprint && (
            <>
              <div className="my-1 h-px bg-overlay-default" />
              <MenuItem
                onClick={handleCopy}
                icon={copied
                  ? <Check size={12} strokeWidth={2} className="text-[var(--color-status-success)]" />
                  : <Copy size={12} strokeWidth={1.5} />}
              >
                {copied ? <span className="text-[var(--color-status-success)]">Copied</span> : "Copy as Markdown"}
              </MenuItem>
              <MenuItem
                onClick={handleCopyPlain}
                icon={copiedPlain
                  ? <Check size={12} strokeWidth={2} className="text-[var(--color-status-success)]" />
                  : <Copy size={12} strokeWidth={1.5} />}
              >
                {copiedPlain ? <span className="text-[var(--color-status-success)]">Copied</span> : "Copy as plain text"}
              </MenuItem>
            </>
          )}
        </div>
      )}
    </div>
  );
}
