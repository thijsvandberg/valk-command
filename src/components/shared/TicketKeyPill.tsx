"use client";

import { useState, useRef, useEffect } from "react";
import { ExternalLink } from "lucide-react";
import { getJiraUrl } from "@/components/sprint-board/TicketTableCells";

interface TicketKeyPillProps {
  ticketKey: string;
}

export function TicketKeyPill({ ticketKey }: TicketKeyPillProps) {
  const [copied, setCopied] = useState(false);
  const jiraUrl = getJiraUrl(ticketKey);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(jiraUrl);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard not available in this context
      console.warn("Clipboard write failed");
    }
  }

  return (
    <div className="group flex shrink-0 items-center">
      <button
        type="button"
        onClick={handleCopy}
        title="Copy Jira URL"
        className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-medium cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
          copied
            ? "bg-[var(--color-brand-500)]/20 text-[var(--color-brand-400)]"
            : "bg-white/[0.07] text-white/60 hover:bg-white/[0.10] hover:text-white/75"
        }`}
      >
        {ticketKey}
      </button>

      {/* Slides in from behind the pill, pushing content right */}
      <span className="overflow-hidden w-0 group-hover:w-[20px] transition-[width] duration-150 ease-out flex items-center">
        <a
          href={jiraUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in Jira"
          className="flex shrink-0 items-center pl-1.5 text-white/25 hover:text-white/60 transition-[color] duration-100 focus-visible:outline-none"
        >
          <ExternalLink size={14} strokeWidth={1.5} />
        </a>
      </span>
    </div>
  );
}
