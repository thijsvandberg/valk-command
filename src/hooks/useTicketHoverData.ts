"use client";

import { useMemo, useCallback } from "react";
import { useTickets, useJiraSprints } from "@/hooks/useSprintBoard";
import type { Ticket } from "@/types/ticket";
import type { TicketPillHoverData } from "@/components/shared/TicketStatusPill";

// Maps a full board ticket to the hover-card shape. The card is editable by
// default (BRDG-276), so sprintId is carried through for the Sprint picker, and
// the PO signals (readiness, quality, notes, edit state) are included so the
// reference cards report the full set. sprintNames resolves the raw sprint id to
// its display name (e.g. "BT: 137").
export function buildTicketHoverData(t: Ticket, sprintNames: Record<string, string> = {}): TicketPillHoverData {
  return {
    title: t.title,
    storyPoints: t.storyPoints,
    businessValue: t.businessValue,
    sprintId: t.sprintId ?? null,
    sprintName: t.sprintId ? (sprintNames[t.sprintId] ?? t.sprintId) : null,
    epicKey: t.epicKey,
    epic: t.epic,
    assignee: t.assignee ?? null,
    reporter: t.reporter ?? null,
    openSubtaskCount: t.openSubtaskCount ?? 0,
    totalSubtaskCount: t.totalSubtaskCount ?? 0,
    flagged: t.flagged,
    readiness: t.readiness,
    qualityScore: t.qualityScore,
    notes: t.notes || null,
    editState: t.editState && t.editState !== "clean" ? t.editState : null,
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
  const { sprints } = useJiraSprints();
  const sprintNames = useMemo(() => {
    const m: Record<string, string> = {};
    sprints.forEach((s) => { m[s.id] = s.name; });
    return m;
  }, [sprints]);
  const map = useMemo(() => {
    const m = new Map<string, TicketPillHoverData>();
    (data ?? []).forEach((t) => m.set(t.key, buildTicketHoverData(t, sprintNames)));
    return m;
  }, [data, sprintNames]);
  return useCallback((key: string) => map.get(key), [map]);
}
