"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Trash2, Check, Pencil, Play } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { BarContainer } from "@/components/shared/BarContainer";
import { refinementSessions, type RefinementSessionResponse } from "@/lib/api-client";
import type { KeyedMutator } from "swr";

interface SavedSessionListProps {
  sessions: RefinementSessionResponse[];
  mutate: KeyedMutator<RefinementSessionResponse[]>;
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
}

export function SavedSessionList({
  sessions,
  mutate,
  activeSessionId,
  onSelectSession,
}: SavedSessionListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<RefinementSessionResponse | null>(null);
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

          return (
            <div
              key={session.id}
              className={`group relative flex shrink-0 items-center gap-1.5 px-3 text-body-sm font-medium ${
                isActive
                  ? "text-text-primary"
                  : isCompleted
                    ? "text-text-muted"
                    : "text-text-tertiary hover:text-text-secondary"
              }`}
              style={{ transition: "color 120ms" }}
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
                    setEditValue(session.name);
                  }}
                  className="max-w-[160px] cursor-pointer truncate bg-transparent text-left"
                >
                  {session.name}
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

              {/* Hover actions */}
              {editingId !== session.id && (
                <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100" style={{ transition: "opacity 0.15s ease" }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(session.id);
                      setEditValue(session.name);
                    }}
                    className="cursor-pointer rounded p-0.5 text-text-muted hover:bg-overlay-default hover:text-text-secondary"
                    aria-label="Rename session"
                  >
                    <Pencil size={11} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(session);
                    }}
                    className="cursor-pointer rounded p-0.5 text-text-muted hover:bg-red-500/10 hover:text-red-400"
                    aria-label="Delete session"
                  >
                    <Trash2 size={11} strokeWidth={2} />
                  </button>
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
          );
        })}

      </BarContainer>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete session"
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
