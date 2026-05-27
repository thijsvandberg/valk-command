"use client";

import { useState, useCallback } from "react";
import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/Button";
import { Plus, Layers, Check } from "lucide-react";
import { useRefinementSessions } from "@/hooks/useRefinementSessions";
import { refinementSessions as api } from "@/lib/api-client";

interface AddToRefinementModalProps {
  open: boolean;
  onClose: () => void;
  ticketKeys: string[];
  onAdded?: (sessionId: string, sessionName: string) => void;
}

export function AddToRefinementModal({
  open,
  onClose,
  ticketKeys,
  onAdded,
}: AddToRefinementModalProps) {
  const { sessions, mutate } = useRefinementSessions();
  const draftSessions = sessions.filter((s) => s.status !== "completed");
  const [adding, setAdding] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const handleAddToSession = useCallback(
    async (sessionId: string) => {
      setAdding(sessionId);
      try {
        const session = sessions.find((s) => s.id === sessionId);
        if (!session) return;
        const existing = new Set(session.ticketKeys);
        const newKeys = ticketKeys.filter((k) => !existing.has(k));
        if (newKeys.length > 0) {
          await api.update(sessionId, {
            ticketKeys: [...session.ticketKeys, ...newKeys],
          });
          await mutate();
        }
        setDone(sessionId);
        onAdded?.(sessionId, session.name);
        setTimeout(() => {
          onClose();
          setDone(null);
        }, 600);
      } finally {
        setAdding(null);
      }
    },
    [sessions, ticketKeys, mutate, onAdded, onClose],
  );

  const handleCreateNew = useCallback(async () => {
    setAdding("__new__");
    try {
      const created = await api.create({ ticketKeys });
      await mutate();
      setDone(created.id);
      onAdded?.(created.id, created.name);
      setTimeout(() => {
        onClose();
        setDone(null);
      }, 600);
    } finally {
      setAdding(null);
    }
  }, [ticketKeys, mutate, onAdded, onClose]);

  const ticketLabel = ticketKeys.length === 1
    ? `1 ticket`
    : `${ticketKeys.length} tickets`;

  return (
    <Modal open={open} onClose={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-border-strong bg-[var(--color-surface-elevated)] p-5 shadow-[var(--shadow-2xl)]">
        <div className="flex items-center gap-2">
          <Layers size={16} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
          <h3 className="font-[var(--font-display)] text-body-lg font-semibold text-text-primary">
            Add to refinement
          </h3>
        </div>
        <p className="mt-1.5 text-body-sm text-text-secondary">
          Add {ticketLabel} to a refinement session.
        </p>

        <div className="mt-4 space-y-1">
          {draftSessions.map((session) => {
            const isDone = done === session.id;
            const isAdding = adding === session.id;
            const overlap = ticketKeys.filter((k) => session.ticketKeys.includes(k)).length;

            return (
              <button
                key={session.id}
                type="button"
                disabled={isAdding || adding !== null}
                onClick={() => handleAddToSession(session.id)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-border-default px-3 py-2.5 text-left hover:bg-overlay-subtle disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                style={{ transition: "background-color 0.15s ease" }}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body-lg font-medium text-text-primary">
                    {session.name}
                  </div>
                  <div className="text-[11px] text-text-muted">
                    {session.ticketCount} ticket{session.ticketCount !== 1 ? "s" : ""}
                    {overlap > 0 && (
                      <span className="ml-1 text-text-tertiary">
                        ({overlap} already in session)
                      </span>
                    )}
                  </div>
                </div>
                {isDone ? (
                  <Check size={16} strokeWidth={2} className="shrink-0 text-[var(--color-brand-400)]" />
                ) : isAdding ? (
                  <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-border-strong border-t-[var(--color-brand-400)]" />
                ) : null}
              </button>
            );
          })}

          {draftSessions.length === 0 && (
            <p className="py-3 text-center text-body-sm text-text-muted">
              No draft sessions yet.
            </p>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="dashed"
            size="md"
            icon={<Plus size={13} strokeWidth={2} />}
            onClick={handleCreateNew}
            disabled={adding !== null}
            className="flex-1"
          >
            {done === "__new__" ? "Created" : adding === "__new__" ? "Creating..." : "New session"}
          </Button>
        </div>

        <div className="mt-3 flex justify-end">
          <Button variant="ghost" size="md" onClick={onClose} className="border-0">
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
