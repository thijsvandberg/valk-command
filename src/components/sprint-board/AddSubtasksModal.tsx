"use client";

import { useState, useRef, useCallback } from "react";
import { Modal } from "@/components/shared/Modal";
import { ModalHeader } from "@/components/shared/ModalHeader";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { ListPlus, Loader2, CornerDownLeft } from "lucide-react";
import type { Subtask } from "@/types/ticket";
import { tickets as ticketsApi, ApiError } from "@/lib/api-client";

interface AddSubtasksModalProps {
  open: boolean;
  ticketKey: string;
  /** Parent ticket summary, shown next to the key in the header for context. */
  ticketTitle?: string;
  onClose: () => void;
  /** Called once on close with the total number of subtasks created this session, so the
   *  caller can optimistically clear the "No subtasks" warning. Deferred to close (not per
   *  create) so clearing the warning never unmounts this modal mid-session (BRDG-366). */
  onCreated: (count: number) => void;
}

// Mirrors the inline subtask-create experience from the ticket detail / refinement views
// (SubtasksSection): a bordered list with a "Create subtask..." row at the bottom. Each
// Enter creates the subtask in Jira immediately (optimistic row) and the input stays
// focused for the next one (BRDG-366).
export function AddSubtasksModal({ open, ticketKey, ticketTitle, onClose, onCreated }: AddSubtasksModalProps) {
  const [created, setCreated] = useState<Subtask[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [createdCount, setCreatedCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const successCountRef = useRef(0);

  const handleClose = useCallback(() => {
    if (successCountRef.current > 0) onCreated(successCountRef.current);
    onClose();
  }, [onCreated, onClose]);

  const handleCreate = useCallback(() => {
    const trimmed = title.trim();
    if (!trimmed) return;

    const placeholderKey = `pending-${Date.now()}`;
    const placeholder: Subtask = {
      key: placeholderKey,
      title: trimmed,
      type: "subtask",
      jiraStatus: "TO DO",
      assignee: null,
    };
    setCreated((prev) => [...prev, placeholder]);
    setTitle("");
    setError(null);
    inputRef.current?.focus();

    ticketsApi.createSubtask(ticketKey, { title: trimmed })
      .then((real) => {
        setCreated((prev) => prev.map((s) => (s.key === placeholderKey ? real : s)));
        successCountRef.current += 1;
        setCreatedCount(successCountRef.current);
      })
      .catch((err) => {
        setCreated((prev) => prev.filter((s) => s.key !== placeholderKey));
        const detail = err instanceof ApiError ? err.message : "Jira API error";
        setError(`Failed to add "${trimmed}": ${detail}`);
      });
  }, [title, ticketKey]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreate();
    }
  }, [handleCreate]);

  const hasRows = created.length > 0;

  return (
    <Modal open={open} onClose={handleClose} aria-label={`Add subtasks to ${ticketKey}`}>
      <div className="w-full max-w-[540px] overflow-hidden rounded-2xl border border-border-default bg-surface-elevated shadow-2xl">
        <ModalHeader
          icon={<ListPlus size={16} strokeWidth={1.75} className="text-[var(--color-brand-400)]" />}
          title="Add subtasks"
          subtitle={
            <p className="mt-0.5 truncate text-body-sm text-text-tertiary">
              to <span className="font-mono text-text-secondary">{ticketKey}</span>
              {ticketTitle ? <span className="text-text-secondary"> &middot; {ticketTitle}</span> : null}
            </p>
          }
          onClose={handleClose}
        />

        {/* Body */}
        <div className="px-5 py-4">
          <div className="overflow-clip rounded-xl border border-border-default bg-surface-base focus-within:border-[var(--color-brand-500)]/45 [transition:border-color_.15s_ease]">
            {created.map((sub) => {
              const isPending = sub.key.startsWith("pending-");
              return (
                <div
                  key={sub.key}
                  className={`flex items-center gap-2.5 border-b border-border-subtle px-3 py-2.5 ${isPending ? "opacity-55" : ""}`}
                >
                  <IssueTypeIcon type="subtask" size={14} strokeWidth={2} />
                  <span className="min-w-0 flex-1 truncate text-body-lg text-text-primary">{sub.title}</span>
                  {isPending ? (
                    <Loader2 size={14} strokeWidth={1.75} className="shrink-0 animate-spin text-text-muted" />
                  ) : (
                    <StatusBadge status={sub.jiraStatus} className="shrink-0 rounded-[5px] px-1.5 text-caption tracking-wide" />
                  )}
                </div>
              );
            })}

            {/* Inline create row */}
            <div className="flex items-center gap-2.5 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
              <IssueTypeIcon type="subtask" size={14} strokeWidth={2} />
              <input
                ref={inputRef}
                type="text"
                value={title}
                autoFocus
                onChange={(e) => { setTitle(e.target.value); setError(null); }}
                onKeyDown={handleKeyDown}
                placeholder={hasRows ? "Add another subtask..." : "Create subtask..."}
                className="min-w-0 flex-1 bg-transparent text-body-lg text-text-primary placeholder:text-text-muted outline-none"
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={!title.trim()}
                aria-label="Add subtask"
                className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-border-subtle px-1.5 py-1 text-caption font-medium text-text-muted transition-colors duration-150 hover:enabled:border-[var(--color-brand-400)] hover:enabled:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] disabled:cursor-default disabled:opacity-50"
              >
                <CornerDownLeft size={12} strokeWidth={2} />
                Enter
              </button>
            </div>
          </div>

          {error && (
            <p className="mt-2.5 rounded-md bg-red-500/[0.08] px-3 py-1.5 text-body-sm text-red-400/90">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-4">
          <span className="text-body-sm text-text-tertiary">
            {createdCount > 0
              ? `${createdCount} subtask${createdCount === 1 ? "" : "s"} added`
              : "Press Enter to add each subtask"}
          </span>
          <Button variant="primary" size="md" onClick={handleClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
