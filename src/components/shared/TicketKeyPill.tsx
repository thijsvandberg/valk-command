"use client";

import { useState, useRef, useEffect } from "react";
import { ExternalLink } from "lucide-react";
import { getJiraUrl } from "@/components/sprint-board/TicketTableCells";

interface TicketKeyPillProps {
  ticketKey: string;
  /** When provided, renders an integrated status badge inside the pill */
  statusLabel?: string;
  statusBg?: string;
  statusColor?: string;
}

export function TicketKeyPill({ ticketKey, statusLabel, statusBg, statusColor }: TicketKeyPillProps) {
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
      console.warn("Clipboard write failed");
    }
  }

  return (
    <div className="group flex shrink-0 items-center">
      <div className={`flex shrink-0 items-center overflow-hidden ${statusLabel ? "rounded-md bg-white/[0.07]" : ""}`}>
        <button
          type="button"
          onClick={handleCopy}
          title="Copy Jira URL"
          className={`px-2 py-0.5 font-mono text-label font-medium cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
            statusLabel ? "" : "rounded-md "
          }${
            copied
              ? "bg-[var(--color-brand-500)]/20 text-[var(--color-brand-400)]"
              : statusLabel
                ? "text-white/60 hover:bg-hover-list-item"
                : "bg-white/[0.07] text-white/60 hover:bg-white/[0.10] hover:text-white/75"
          }`}
        >
          {ticketKey}
        </button>
        {statusLabel && (
          <span
            className="px-2 py-0.5 text-label font-medium"
            style={{ backgroundColor: statusBg, color: statusColor }}
          >
            {statusLabel}
          </span>
        )}
      </div>

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
