"use client";

import { useRef, useEffect } from "react";
import { Play, Save, Sparkles, Loader2, MoreHorizontal, Copy } from "lucide-react";
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
}: RefinementQueuePanelProps) {
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
        <h2 className="font-[var(--font-display)] text-heading-sm font-semibold tracking-tight text-text-primary">
          {activeSession?.name ?? "Queue"}
        </h2>
        <div className="flex items-center gap-2">
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

      {bulk.bulkSuggestConvId && (
        <BulkSuggestPanel conversationId={bulk.bulkSuggestConvId} isRunning={bulk.bulkSuggestRunning} collapsed={bulk.bulkSuggestPanelCollapsed} onToggleCollapse={() => bulk.setBulkSuggestPanelCollapsed((p) => !p)} />
      )}

      {canStart && (
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={activeSession ? undefined : onSaveAsSession}
            disabled={!!activeSession}
            className={`group/save relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
              activeSession
                ? "border-border-subtle bg-transparent text-text-muted cursor-default"
                : "border-border-default bg-overlay-subtle text-text-secondary cursor-pointer hover:bg-overlay-default hover:text-text-primary active:scale-[0.97]"
            }`}
            style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 80ms" }}
            aria-label={activeSession ? "Session saved" : "Save as refinement session"}
          >
            <Save size={16} strokeWidth={1.5} />
            <span className="pointer-events-none absolute -top-9 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--color-surface-floating)] px-2.5 py-1 text-[11px] font-medium text-text-secondary opacity-0 shadow-[var(--shadow-md)] border border-border-strong group-hover/save:opacity-100" style={{ transition: "opacity 0.15s ease" }}>
              {activeSession ? "Session auto-saves" : "Save as refinement session"}
            </span>
          </button>
          <Button variant="primary" size="lg" icon={<Play size={14} strokeWidth={2} />} onClick={onBeginRefinement} className="flex-1">
            Start Refinement
          </Button>
        </div>
      )}
    </div>
  );
}
