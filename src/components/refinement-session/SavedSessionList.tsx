"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, Trash2, Check, Pencil, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { refinementSessions, type RefinementSessionResponse } from "@/lib/api-client";
import type { KeyedMutator } from "swr";

interface SavedSessionListProps {
  sessions: RefinementSessionResponse[];
  mutate: KeyedMutator<RefinementSessionResponse[]>;
  activeSessionId: string | null;
  onSelectSession: (id: string | null) => void;
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

  const handleCreate = useCallback(async () => {
    const created = await refinementSessions.create({});
    await mutate();
    onSelectSession(created.id);
  }, [mutate, onSelectSession]);

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
        onSelectSession(null);
      }
      await mutate();
    },
    [activeSessionId, mutate, onSelectSession],
  );

  const isQuickMode = activeSessionId === null;

  return (
    <>
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {/* Quick session tab */}
        <button
          type="button"
          onClick={() => onSelectSession(null)}
          className={`group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
            isQuickMode
              ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]"
              : "border-border-default bg-overlay-subtle text-text-secondary hover:bg-overlay-default"
          }`}
          style={{ transition: "background-color 0.15s ease, border-color 0.15s ease" }}
        >
          <Zap size={12} strokeWidth={2} />
          Quick session
        </button>

        {/* Saved session tabs */}
        {sessions.map((session) => {
          const isActive = activeSessionId === session.id;
          const isCompleted = session.status === "completed";

          return (
            <div
              key={session.id}
              className={`group relative flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                isActive
                  ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]"
                  : isCompleted
                    ? "border-border-default bg-overlay-subtle text-text-muted"
                    : "border-border-default bg-overlay-subtle text-text-secondary hover:bg-overlay-default"
              }`}
              style={{ transition: "background-color 0.15s ease, border-color 0.15s ease" }}
            >
              {isCompleted && (
                <Check size={12} strokeWidth={2.5} className="shrink-0 text-[var(--color-brand-500)]" />
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
                  className="min-w-0 max-w-[160px] bg-transparent text-xs font-medium outline-none"
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
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-overlay-strong px-1 text-[10px] font-semibold tabular-nums text-text-muted">
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
            </div>
          );
        })}

        {/* New session button */}
        <Button
          variant="dashed"
          size="sm"
          icon={<Plus size={12} strokeWidth={2} />}
          onClick={handleCreate}
          className="shrink-0"
        >
          New session
        </Button>
      </div>

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
