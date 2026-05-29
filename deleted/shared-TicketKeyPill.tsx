"use client";

import { useState, useRef, useEffect } from "react";

import { getJiraUrl } from "@/components/sprint-board/TicketTableCells";

interface TicketKeyPillProps {
  ticketKey: string;
  /** When provided, renders an integrated status badge inside the pill */
  statusLabel?: string;
  statusBg?: string;
  statusColor?: string;
  /** When provided, clicking the pill navigates to this URL instead of copying */
  href?: string;
}

export function TicketKeyPill({ ticketKey, statusLabel, statusBg, statusColor, href }: TicketKeyPillProps) {
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

  const pillClassName = `px-2 py-0.5 font-mono text-label font-medium cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
    statusLabel ? "" : "rounded-md "
  }${
    copied
      ? "bg-[var(--color-brand-500)]/20 text-[var(--color-brand-400)]"
      : statusLabel
        ? "text-text-secondary hover:bg-hover-list-item"
        : "bg-overlay-default text-text-secondary hover:bg-overlay-strong hover:text-text-secondary"
  }`;

  return (
    <div className="flex shrink-0 items-center">
      <div className={`flex shrink-0 items-center overflow-hidden ${statusLabel ? "rounded-md bg-overlay-default" : ""}`}>
        {href ? (
          <a
            href={href}
            onClick={(e) => e.stopPropagation()}
            title={`Open ${ticketKey}`}
            className={pillClassName}
          >
            {ticketKey}
          </a>
        ) : (
          <button
            type="button"
            onClick={handleCopy}
            title="Copy Jira URL"
            className={pillClassName}
          >
            {ticketKey}
          </button>
        )}
        {statusLabel && (
          <span
            className="px-2 py-0.5 text-label font-medium"
            style={{ backgroundColor: statusBg, color: statusColor }}
          >
            {statusLabel}
          </span>
        )}
      </div>
    </div>
  );
}
