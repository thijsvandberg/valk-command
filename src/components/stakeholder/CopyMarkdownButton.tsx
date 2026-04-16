"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import type { StakeholderSprint, StakeholderTicket } from "@/lib/stakeholder-data";
import { buildMarkdownSummary } from "@/lib/stakeholder-data";
import { Button } from "@/components/ui/Button";

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
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      aria-label="Copy sprint summary as markdown"
      icon={
        copied
          ? <Check size={12} strokeWidth={2} className="text-emerald-400" />
          : <Copy size={12} strokeWidth={1.5} />
      }
      className={copied ? "text-emerald-400" : ""}
    >
      {copied ? "Copied" : "Copy as Markdown"}
    </Button>
  );
}
