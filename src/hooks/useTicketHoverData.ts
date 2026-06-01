"use client";

import { useMemo, useCallback } from "react";
import { useTickets } from "@/hooks/useSprintBoard";
import type { Ticket } from "@/types/ticket";
import type { TicketPillHoverData } from "@/components/shared/TicketStatusPill";

// Maps a full board ticket to the read-only hover-card shape. sprintId is left
// null because editing is not offered in the reference contexts that use this.
export function buildTicketHoverData(t: Ticket): TicketPillHoverData {
  return {
    title: t.title,
    storyPoints: t.storyPoints,
    businessValue: t.businessValue,
    sprintId: null,
    sprintName: t.sprintId ?? null,
    epicKey: t.epicKey,
    epic: t.epic,
    assignee: t.assignee ?? null,
    reporter: t.reporter ?? null,
    openSubtaskCount: t.openSubtaskCount ?? 0,
    totalSubtaskCount: t.totalSubtaskCount ?? 0,
    flagged: t.flagged,
  };
}

/**
 * Returns a lookup that resolves a ticket key to hover-card data from the
 * shared `/api/tickets` list (SWR-cached, deduped app-wide). Used by reference
 * rows (epic children, link results, refinement queue) that don't carry the
 * rich fields themselves. Returns undefined for keys not in the list (e.g.
 * subtasks and Jira-only issues), so those simply render no card.
 */
export function useTicketHoverData(): (key: string) => TicketPillHoverData | undefined {
  const { data } = useTickets("__all__");
  const map = useMemo(() => {
    const m = new Map<string, TicketPillHoverData>();
    (data ?? []).forEach((t) => m.set(t.key, buildTicketHoverData(t)));
    return m;
  }, [data]);
  return useCallback((key: string) => map.get(key), [map]);
}
