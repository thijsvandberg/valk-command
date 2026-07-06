"use client";

import { useCallback } from "react";
import { Loader2, CalendarRange } from "lucide-react";
import { useTicketDetail } from "@/hooks/useSprintBoard";
import { EpicChildrenSection } from "@/components/ticket-detail/EpicChildrenSection";

interface EpicSprintPlanningProps {
  epicKey: string;
  /** Open a created child story in-place in the Epic Writer (BRDG-485 child view). */
  onSelectChild?: (jiraKey: string) => void;
  /**
   * Notify the host that a child changed here (e.g. a sprint move), so it can
   * refresh the breakdown board's cards - they come from a separate data source
   * (the writer session) and would otherwise show a stale sprint badge until the
   * next session refetch.
   */
  onChildChanged?: () => void;
}

/**
 * The Epic Writer's Sprints planning view (BRDG-486). It reuses the epic single
 * view's children section (`EpicChildrenSection` -> `EpicChildrenBySprint`) rather
 * than a bespoke planner, so the PO gets the same drag-to-assign / reorder /
 * create-into-sprint plumbing and the moves persist to Jira through the existing
 * sprint-move handlers - nothing is forked here.
 *
 * The data source is the epic's REAL Jira children (`/api/tickets/<epic>`), not the
 * breakdown DRAFT cards: only created stories live in Jira and can be scheduled, so
 * uncreated cards are structurally absent from this view.
 */
export function EpicSprintPlanning({ epicKey, onSelectChild, onChildChanged }: EpicSprintPlanningProps) {
  const { data, isLoading, mutate } = useTicketDetail(epicKey);
  const handleMutate = useCallback(() => {
    void mutate();
    // Keep the breakdown board's sprint badges in step: its cards are loaded from
    // the writer session, not this detail cache, so a move here must also refresh
    // that source (mirrors how the board's own reassignCardSprint refreshes it).
    onChildChanged?.();
  }, [mutate, onChildChanged]);

  const children = data?.epicChildren ?? [];

  if (isLoading && !data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-overlay-subtle text-text-muted">
          <CalendarRange size={18} strokeWidth={1.5} />
        </span>
        <p className="max-w-xs text-body-sm leading-body text-text-muted">
          No stories to plan yet. Create stories on the{" "}
          <span className="font-medium text-text-secondary">Breakdown</span> board first,
          then schedule them into sprints here.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
      <EpicChildrenSection
        items={children}
        ticketKey={epicKey}
        onMutate={handleMutate}
        onSelectTicket={onSelectChild}
        forceSprintView
        showStatsSummary
      />
    </div>
  );
}
