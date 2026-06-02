"use client";

import { useState, useCallback } from "react";
import { Check, Loader2, MessageSquare, Ticket } from "lucide-react";
import Link from "next/link";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { RefinementSessionMenu } from "@/components/refinement-session/RefinementSessionMenu";
import { refinementSessions, type RefinementSessionResponse } from "@/lib/api-client";
import { relativeDate, formatAbsoluteDate } from "@/lib/date-utils";

interface RefinementHistoryListProps {
  sessions: RefinementSessionResponse[];
  onMutate?: () => void | Promise<unknown>;
}

export function RefinementHistoryList({ sessions, onMutate }: RefinementHistoryListProps) {
  const [deleteTarget, setDeleteTarget] = useState<RefinementSessionResponse | null>(null);

  const handleFinish = useCallback(
    async (id: string) => {
      await refinementSessions.update(id, { status: "completed" });
      await onMutate?.();
    },
    [onMutate],
  );

  const handleReopen = useCallback(
    async (id: string) => {
      await refinementSessions.update(id, { status: "in_progress" });
      await onMutate?.();
    },
    [onMutate],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await refinementSessions.delete(id);
      await onMutate?.();
    },
    [onMutate],
  );

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-body-lg text-text-muted">No refinements yet.</p>
      </div>
    );
  }

  return (
    <>
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
                <span className="min-w-0 flex-1 truncate text-body-lg font-medium text-text-primary">
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
                <RefinementSessionMenu
                  sessionName={session.name}
                  status={session.status}
                  onFinish={() => handleFinish(session.id)}
                  onReopen={() => handleReopen(session.id)}
                  onDelete={() => setDeleteTarget(session)}
                />
              </div>

              {session.generalComment && (
                <div className="mt-2 flex items-start gap-2 pl-[26px]">
                  <MessageSquare size={11} strokeWidth={1.5} className="mt-0.5 shrink-0 text-text-muted" />
                  <p className="line-clamp-2 text-body-sm leading-relaxed text-text-tertiary">
                    {session.generalComment}
                  </p>
                </div>
              )}
            </Link>
          );
        })}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete refinement"
        description={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget.id);
        }}
      />
    </>
  );
}
