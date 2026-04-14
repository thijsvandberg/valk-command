"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import type { StakeholderSprint, StakeholderTicket } from "@/lib/stakeholder-data";
import { buildMarkdownSummary } from "@/lib/stakeholder-data";

interface CopyMarkdownButtonProps {
  sprint: StakeholderSprint;
  doneTickets: StakeholderTicket[];
  inProgressTickets: StakeholderTicket[];
  todoTickets: StakeholderTicket[];
  upcomingTickets: StakeholderTicket[];
  nextSprintName: string | null;
  aiNarrative?: string | null;
  aiRisks?: string[];
}

export function CopyMarkdownButton({
  sprint,
  doneTickets,
  inProgressTickets,
  todoTickets,
  upcomingTickets,
  nextSprintName,
  aiNarrative,
  aiRisks,
}: CopyMarkdownButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const md = buildMarkdownSummary(
      sprint,
      doneTickets,
      inProgressTickets,
      todoTickets,
      upcomingTickets,
      nextSprintName,
      aiNarrative,
      aiRisks,
    );
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable (non-HTTPS or permission denied) — fail silently
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-white/50 cursor-pointer hover:bg-white/[0.06] hover:text-white/80 hover:border-white/[0.12] active:scale-95 transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
      aria-label="Copy sprint summary as markdown"
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
  );
}
