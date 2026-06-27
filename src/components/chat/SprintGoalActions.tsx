"use client";

import { useState, useCallback } from "react";
import { Check, Pencil, Loader2 } from "lucide-react";
import { mutate } from "swr";
import { jira, tickets as ticketsApi } from "@/lib/api-client";
import type { SprintGoalMetadata } from "@/types/chat";
import type { Sprint, Ticket } from "@/types/ticket";
import { SprintEditModal } from "@/components/sprint-board/SprintEditModal";

interface SprintGoalActionsProps {
  content: string;
  metadata: SprintGoalMetadata;
  showToast: (msg: string) => void;
}

export function SprintGoalActions({ content, metadata, showToast }: SprintGoalActionsProps) {
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [sprintData, setSprintData] = useState<{ sprint: Sprint; tickets: Ticket[] } | null>(null);

  const handleAccept = useCallback(async () => {
    setAccepting(true);
    try {
      await jira.updateSprint(metadata.sprintId, { goal: content });
      await mutate("/api/jira/sprints");
      try { localStorage.removeItem(`sprint-goal-conv-${metadata.sprintId}`); } catch { /* ok */ }
      setAccepted(true);
      showToast("Sprint goal saved");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save sprint goal");
    } finally {
      setAccepting(false);
    }
  }, [content, metadata.sprintId, showToast]);

  const handleEdit = useCallback(async () => {
    setLoadingEdit(true);
    try {
      const [sprints, sprintTickets] = await Promise.all([
        jira.getSprints(),
        ticketsApi.list(metadata.sprintId),
      ]);
      const sprint = sprints.find((s) => s.id === metadata.sprintId);
      if (!sprint) {
        showToast("Sprint not found");
        return;
      }
      // Pre-fill the goal with the AI suggestion so the user can adjust
      setSprintData({ sprint: { ...sprint, goal: content }, tickets: sprintTickets });
      setEditModalOpen(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load sprint data");
    } finally {
      setLoadingEdit(false);
    }
  }, [content, metadata.sprintId, showToast]);

  if (accepted) {
    return (
      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border-subtle text-caption text-[var(--color-brand-400)]">
        <Check size={11} strokeWidth={2} />
        <span>Sprint goal saved</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border-subtle">
        <button
          type="button"
          onClick={handleAccept}
          disabled={accepting}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium cursor-pointer
            text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/10
            hover:bg-[var(--color-brand-500)]/20
            active:bg-[var(--color-brand-500)]/25
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-colors duration-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        >
          {accepting ? <Loader2 size={10} strokeWidth={2} className="animate-spin" /> : <Check size={10} strokeWidth={2} />}
          Accept
        </button>
        <button
          type="button"
          onClick={handleEdit}
          disabled={loadingEdit}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium cursor-pointer
            text-text-muted
            hover:text-text-secondary hover:bg-overlay-default
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-colors duration-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        >
          {loadingEdit ? <Loader2 size={10} strokeWidth={2} className="animate-spin" /> : <Pencil size={10} strokeWidth={2} />}
          Edit
        </button>
      </div>
      {editModalOpen && sprintData && (
        <SprintEditModal
          sprint={sprintData.sprint}
          tickets={sprintData.tickets}
          onClose={() => setEditModalOpen(false)}
          showToast={showToast}
        />
      )}
    </>
  );
}
