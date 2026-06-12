"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Check, Play } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { BarContainer } from "@/components/shared/BarContainer";
import { RefinementSessionMenu } from "@/components/refinement-session/RefinementSessionMenu";
import { SESSION_DROP_PREFIX } from "@/hooks/useRefinementDragDrop";
import { refinementSessions, type RefinementSessionResponse } from "@/lib/api-client";
import { sessionLabel } from "./refinement-utils";
import type { KeyedMutator } from "swr";

interface SavedSessionListProps {
  sessions: RefinementSessionResponse[];
  mutate: KeyedMutator<RefinementSessionResponse[]>;
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  /** Notifies the parent after a session is marked completed, so it can reset the prep view. */
  onSessionFinished?: (id: string) => void;
  /** A ticket drag is in progress: every ready session chip shows its drop affordance. */
  dragActive?: boolean;
}

/** Render-prop droppable so each chip registers as a BRDG-336 drop target
    without restructuring the chip markup. Completed sessions are disabled. */
function SessionDropTarget({
  sessionId,
  disabled,
  children,
}: {
  sessionId: string;
  disabled: boolean;
  children: (drop: { setNodeRef: (el: HTMLElement | null) => void; isOver: boolean }) => React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${SESSION_DROP_PREFIX}${sessionId}`,
    data: { sessionId },
    disabled,
  });
  return <>{children({ setNodeRef, isOver })}</>;
}

export function SavedSessionList({
  sessions,
  mutate,
  activeSessionId,
  onSelectSession,
  onSessionFinished,
  dragActive = false,
}: SavedSessionListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<RefinementSessionResponse | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const handleRename = useCallback(
    async (id: string, name: string) => {
      if (!name.trim()) {
        setEditingId(null);
        return;
      }
      await refinementSessions.update(id, { name: name.trim() });
      setEditingId(null);
      await mutate();
    },
    [mutate],
  );

  const handleFinish = useCallback(
    async (id: string) => {
      await refinementSessions.update(id, { status: "completed" });
      await mutate();
      onSessionFinished?.(id);
    },
    [mutate, onSessionFinished],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await refinementSessions.delete(id);
      if (activeSessionId === id) {
        const remaining = sessions.filter((s) => s.id !== id && s.status !== "completed");
        if (remaining.length > 0) {
          onSelectSession(remaining[0].id);
        }
      }
      await mutate();
    },
    [activeSessionId, sessions, mutate, onSelectSession],
  );

  if (sessions.length === 0) return null;

  return (
    <>
      <BarContainer className="items-stretch gap-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sessions.map((session) => {
          const isActive = activeSessionId === session.id;
          const isCompleted = session.status === "completed";
          const isInProgress = session.status === "in_progress";
          const isDropTarget = dragActive && !isCompleted;

          return (
            <SessionDropTarget key={session.id} sessionId={session.id} disabled={isCompleted}>
              {({ setNodeRef, isOver }) => (
            <div
              ref={setNodeRef}
              data-drop-target={isDropTarget || undefined}
              data-drop-over={(isDropTarget && isOver) || undefined}
              className={`group relative flex shrink-0 items-center gap-1.5 rounded-md px-3 text-body-sm font-medium ${
                isActive
                  ? "text-text-primary"
                  : isCompleted
                    ? "text-text-muted"
                    : "text-text-tertiary hover:text-text-secondary"
              } ${
                isDropTarget
                  ? isOver
                    ? "bg-[var(--color-brand-500)]/15 outline-2 outline-dashed outline-[var(--color-brand-400)] -outline-offset-3 text-text-primary"
                    : "bg-[var(--color-brand-500)]/[0.06] outline-1 outline-dashed outline-[var(--color-brand-500)]/40 -outline-offset-3"
                  : ""
              }`}
              style={{ transition: "color 120ms, background-color 120ms" }}
            >
              {isCompleted && (
                <Check size={12} strokeWidth={2.5} className="shrink-0 text-[var(--color-brand-500)]" />
              )}
              {isInProgress && (
                <Play size={10} strokeWidth={2.5} className="shrink-0 text-amber-400/80" />
              )}

              {editingId === session.id ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => handleRename(session.id, editValue)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(session.id, editValue);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="min-w-0 max-w-[160px] bg-transparent text-body-sm font-medium outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onSelectSession(session.id)}
                  onDoubleClick={() => {
                    setEditingId(session.id);
                    setEditValue(session.name ?? "");
                  }}
                  className="max-w-[160px] cursor-pointer truncate bg-transparent text-left"
                >
                  {sessionLabel(session)}
                </button>
              )}

              {/* Ticket count badge */}
              <span className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] tabular-nums ${
                isActive
                  ? "bg-overlay-strong text-text-secondary"
                  : "bg-overlay-default text-text-tertiary"
              }`}>
                {session.ticketCount}
              </span>

              {/* Overflow actions */}
              {editingId !== session.id && (
                <span
                  className={`flex items-center ${menuOpenId === session.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                  style={{ transition: "opacity 0.15s ease" }}
                >
                  <RefinementSessionMenu
                    sessionName={sessionLabel(session)}
                    status={session.status}
                    onOpenChange={(o) => setMenuOpenId(o ? session.id : null)}
                    onRename={() => {
                      setEditingId(session.id);
                      setEditValue(session.name ?? "");
                    }}
                    onFinish={() => handleFinish(session.id)}
                    onDelete={() => setDeleteTarget(session)}
                  />
                </span>
              )}

              {/* Active underline */}
              {isActive && (
                <span className="absolute bottom-0 left-1.5 right-1.5 h-[2px] rounded-full bg-[var(--color-brand-400)]" />
              )}

              {/* Hover underline preview */}
              {!isActive && !isCompleted && (
                <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-[var(--color-brand-400)] opacity-0 group-hover:opacity-20" style={{ transition: "opacity 150ms" }} />
              )}
            </div>
              )}
            </SessionDropTarget>
          );
        })}

      </BarContainer>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete session"
        description={`Delete "${deleteTarget ? sessionLabel(deleteTarget) : ""}"? This cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget.id);
        }}
      />
    </>
  );
}
