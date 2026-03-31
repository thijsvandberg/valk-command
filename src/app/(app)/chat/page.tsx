"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import ChatLayout from "@/components/chat/ChatLayout";
import {
  MOCK_TICKETS,
  MOCK_TICKET_DETAILS,
  type Ticket,
} from "@/components/sprint-board/mock-data";

const PO_STATUS_COLORS: Record<string, { dot: string }> = {
  Nieuw: { dot: "#94a3b8" },
  Uitwerken: { dot: "#eab308" },
  "Wachten op feedback": { dot: "#ea8744" },
  "Klaar voor refinement": { dot: "#60a5fa" },
  Ready: { dot: "#4aaa60" },
  Geparkeerd: { dot: "#64648a" },
};

const JIRA_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  "TO DO": { bg: "rgba(148, 163, 184, 0.12)", text: "#94a3b8" },
  "IN PROGRESS": { bg: "rgba(46, 145, 73, 0.15)", text: "#4aaa60" },
  TEST: { bg: "rgba(234, 179, 8, 0.15)", text: "#eab308" },
  DONE: { bg: "rgba(46, 145, 73, 0.25)", text: "#2e9149" },
};

function TicketContextSidebar({ ticket }: { ticket: Ticket }) {
  const detail = MOCK_TICKET_DETAILS[ticket.key];
  const jiraColor = JIRA_STATUS_COLORS[ticket.jiraStatus] ?? JIRA_STATUS_COLORS["TO DO"];
  const poColor = ticket.poStatus ? PO_STATUS_COLORS[ticket.poStatus] : null;

  // Trim the description for the snippet
  const descSnippet = detail?.description
    ? detail.description.slice(0, 200) + (detail.description.length > 200 ? "..." : "")
    : "No description available.";

  return (
    <div className="border-l border-white/[0.06] bg-[var(--color-surface-elevated)] p-4 w-72 shrink-0 overflow-y-auto">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/25">
        Ticket Context
      </div>

      <div className="space-y-3">
        <div>
          <span className="font-mono text-xs text-[var(--color-brand-400)]">{ticket.key}</span>
          <h3 className="mt-1 font-[var(--font-display)] text-sm font-semibold leading-snug text-white/80">
            {ticket.title}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="rounded px-2 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: jiraColor.bg, color: jiraColor.text }}
          >
            {ticket.jiraStatus}
          </span>
          {ticket.poStatus && poColor && (
            <span className="flex items-center gap-1.5 text-[10px] text-white/40">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: poColor.dot }} />
              {ticket.poStatus}
            </span>
          )}
        </div>

        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs leading-[1.6] text-white/40">
          {descSnippet}
        </div>

        <div className="rounded-lg border border-dashed border-white/[0.08] bg-white/[0.01] px-3 py-4 text-center">
          <svg viewBox="0 0 24 24" className="mx-auto mb-2 h-5 w-5 text-white/15">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-xs text-white/25">Chat with agent about this ticket</p>
        </div>
      </div>
    </div>
  );
}

function ChatPageInner() {
  const searchParams = useSearchParams();
  const ticketParam = searchParams.get("ticket");

  const ticket = ticketParam
    ? MOCK_TICKETS.find((t) => t.key === ticketParam)
    : null;

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1">
        <ChatLayout />
      </div>
      {ticket && <TicketContextSidebar ticket={ticket} />}
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="h-full">
          <ChatLayout />
        </div>
      }
    >
      <ChatPageInner />
    </Suspense>
  );
}
