"use client";

import { useMemo, useRef, useEffect } from "react";
import { Play, Sparkles, Loader2, MoreHorizontal, Copy, AlertTriangle, RefreshCw } from "lucide-react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Button } from "@/components/ui/Button";
import { BulkSuggestPanel } from "@/components/refinement-session/BulkSuggestPanel";
import { SortableQueueItem } from "./SortableQueueItem";
import { MIN_TICKETS } from "./refinement-utils";
import type { RefinementSessionResponse } from "@/lib/api-client";
import type { useRefinementQueue } from "@/hooks/useRefinementQueue";
import type { useBulkSuggest } from "@/hooks/useBulkSuggest";

interface RefinementQueuePanelProps {
  activeSession: RefinementSessionResponse | null;
  queueHook: ReturnType<typeof useRefinementQueue>;
  bulk: ReturnType<typeof useBulkSuggest>;
  otherSessions: RefinementSessionResponse[];
  canStart: boolean;
  onMoveToSession: (ticketKey: string, targetSessionId: string) => void;
  onBeginRefinement: () => void;
  onSaveAsSession: () => void;
  ticketsValidating?: boolean;
  onRefreshEditStates?: () => void;
}

export function RefinementQueuePanel({
  activeSession,
  queueHook,
  bulk,
  otherSessions,
  canStart,
  onMoveToSession,
  onBeginRefinement,
  onSaveAsSession,
  ticketsValidating,
  onRefreshEditStates,
}: RefinementQueuePanelProps) {
  const { conflictCount, localEditsCount } = useMemo(() => {
    let conflicts = 0;
    let edits = 0;
    for (const t of queueHook.queueTickets) {
      if (t.editState === "conflict") conflicts++;
      else if (t.editState === "local_edits" || t.editState === "draft") edits++;
    }
    return { conflictCount: conflicts, localEditsCount: edits };
  }, [queueHook.queueTickets]);

  const hasEditStateIssues = conflictCount > 0 || localEditsCount > 0;

  const bulkSuggestMenuRef = useRef<HTMLDivElement>(null);
  const { bulkSuggestMenuOpen, setBulkSuggestMenuOpen } = bulk;

  useEffect(() => {
    if (!bulkSuggestMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (bulkSuggestMenuRef.current && !bulkSuggestMenuRef.current.contains(e.target as Node)) {
        setBulkSuggestMenuOpen(false);
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [bulkSuggestMenuOpen, setBulkSuggestMenuOpen]);

  return (
    <div className="sticky top-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="min-w-0 truncate font-[var(--font-display)] text-heading-sm font-semibold tracking-tight text-text-primary">
          {activeSession?.name ?? "Queue"}
        </h2>
        <div className="flex items-center gap-2">
          {onRefreshEditStates && queueHook.queue.length > 0 && (
            <button
              type="button"
              onClick={onRefreshEditStates}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-text-muted hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
              aria-label="Refresh edit states"
            >
              <RefreshCw size={13} strokeWidth={1.5} className={ticketsValidating ? "animate-spin" : ""} />
            </button>
          )}
          {activeSession && queueHook.queue.length > 0 && (
            <div className="relative" ref={bulkSuggestMenuRef}>
              <button
                type="button"
                onClick={() => bulk.setBulkSuggestMenuOpen(!bulk.bulkSuggestMenuOpen)}
                className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                  bulk.bulkSuggestMenuOpen ? "bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]" : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
                }`}
                style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
                aria-label="Queue actions"
              >
                {bulk.bulkSuggestRunning ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin text-[var(--color-brand-400)]" /> : <MoreHorizontal size={15} strokeWidth={1.5} />}
              </button>
              {bulk.bulkSuggestMenuOpen && (
                <div className="absolute right-0 top-full z-30 mt-1 min-w-[200px] rounded-lg border border-border-strong bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-popover)]">
                  <button type="button" onClick={() => bulk.handleBulkSuggest(false)} disabled={bulk.bulkSuggestRunning} className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-body-sm text-text-secondary hover:bg-hover-list-item hover:text-text-primary disabled:cursor-default disabled:opacity-40" style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}>
                    <Sparkles size={12} strokeWidth={1.5} className="shrink-0 text-[var(--color-brand-400)]" />Suggest subtasks
                  </button>
                  <button type="button" onClick={() => bulk.handleBulkSuggest(true)} disabled={bulk.bulkSuggestRunning} className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-body-sm text-text-secondary hover:bg-hover-list-item hover:text-text-primary disabled:cursor-default disabled:opacity-40" style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}>
                    <Sparkles size={12} strokeWidth={1.5} className="shrink-0 text-amber-400" />Regenerate all
                  </button>
                  <div className="my-1 border-t border-border-subtle" />
                  <button type="button" onClick={bulk.handleCopyStories} className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-body-sm text-text-secondary hover:bg-hover-list-item hover:text-text-primary" style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}>
                    <Copy size={12} strokeWidth={1.5} className="shrink-0 text-text-tertiary" />Copy stories + titles
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {hasEditStateIssues && (
        <div className="mb-3 rounded-lg border border-[var(--color-status-warning)]/20 bg-[var(--color-status-warning)]/[0.06] px-3 py-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-[var(--color-status-warning)]" />
            <div className="min-w-0 text-body-sm">
              <p className="font-medium text-text-primary">
                {[
                  conflictCount > 0 && `${conflictCount} conflict${conflictCount !== 1 ? "s" : ""}`,
                  localEditsCount > 0 && `${localEditsCount} local edit${localEditsCount !== 1 ? "s" : ""}`,
                ].filter(Boolean).join(", ")}
              </p>
              <p className="mt-0.5 text-text-tertiary">
                {conflictCount > 0
                  ? "Jira changed since last local edit. Review before starting."
                  : "Unsaved local changes. Review before starting."}
              </p>
            </div>
          </div>
        </div>
      )}

      {queueHook.queue.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong py-12 text-center">
          <p className="text-body-lg text-text-muted">Select tickets from the list</p>
          <p className="mt-1 text-caption text-text-muted">{MIN_TICKETS}-12 tickets recommended</p>
        </div>
      ) : (
        <DndContext sensors={queueHook.sensors} collisionDetection={closestCenter} onDragEnd={queueHook.handleDragEnd}>
          <SortableContext items={queueHook.queue} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {queueHook.queueTickets.map((ticket) => (
                <SortableQueueItem key={ticket.key} ticket={ticket} onRemove={queueHook.removeFromQueue} otherSessions={otherSessions} onMoveToSession={onMoveToSession} suggestionCount={bulk.suggestionCounts[ticket.key]} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {bulk.bulkSuggestVisible && bulk.bulkSuggestConvId && (
        <BulkSuggestPanel conversationId={bulk.bulkSuggestConvId} isRunning={bulk.bulkSuggestRunning} collapsed={bulk.bulkSuggestPanelCollapsed} onToggleCollapse={() => bulk.setBulkSuggestPanelCollapsed((p) => !p)} />
      )}

      {canStart && (
        <div className="mt-4">
          <Button variant="primary" size="lg" icon={<Play size={14} strokeWidth={2} />} onClick={onBeginRefinement} className="w-full">
            Start Refinement
          </Button>
        </div>
      )}
    </div>
  );
}
