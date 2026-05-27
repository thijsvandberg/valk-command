"use client";

import { Check, Loader2, MessageSquare, Ticket } from "lucide-react";
import Link from "next/link";
import type { RefinementSessionResponse } from "@/lib/api-client";
import { relativeDate, formatAbsoluteDate } from "@/lib/date-utils";

interface RefinementHistoryListProps {
  sessions: RefinementSessionResponse[];
}

export function RefinementHistoryList({ sessions }: RefinementHistoryListProps) {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-text-muted">No refinements yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sessions.map((session) => {
        const isInProgress = session.status === "in_progress";

        return (
          <Link
            key={session.id}
            href={`/refinement/${session.id}`}
            className="group block rounded-xl border border-border-default bg-overlay-subtle px-4 py-3 hover:bg-overlay-default hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            style={{ transition: "background-color 0.15s ease, border-color 0.15s ease" }}
          >
            <div className="flex items-center gap-3">
              {isInProgress ? (
                <Loader2 size={14} strokeWidth={2} className="shrink-0 animate-spin text-amber-400/80" />
              ) : (
                <Check size={14} strokeWidth={2.5} className="shrink-0 text-[var(--color-brand-500)]" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                {session.name}
              </span>
              {isInProgress && (
                <span className="flex shrink-0 items-center rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400/80">
                  In Progress
                </span>
              )}
              <span className="flex shrink-0 items-center gap-1 text-caption tabular-nums text-text-muted">
                <Ticket size={11} strokeWidth={1.5} />
                {session.ticketCount}
              </span>
              <span
                className="shrink-0 text-caption text-text-muted"
                title={formatAbsoluteDate(session.updatedAt)}
              >
                {relativeDate(session.updatedAt)}
              </span>
            </div>

            {session.generalComment && (
              <div className="mt-2 flex items-start gap-2 pl-[26px]">
                <MessageSquare size={11} strokeWidth={1.5} className="mt-0.5 shrink-0 text-text-muted" />
                <p className="line-clamp-2 text-xs leading-relaxed text-text-tertiary">
                  {session.generalComment}
                </p>
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}
