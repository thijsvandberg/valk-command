"use client";

import { useMemo, useCallback } from "react";
import { useTickets, useJiraSprints, useTicketDetail } from "@/hooks/useSprintBoard";
import type { Ticket, IssueType, JiraStatus, Assignee } from "@/types/ticket";
import type { TicketPillHoverData } from "@/components/shared/TicketStatusPill";

// Subtask Jira statuses that count as closed when deriving open/total counts.
const DONE_LIKE_STATUSES = new Set(["DONE", "DEPRECATED"]);

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

/** Live data resolved for a linked-issue row: the hover-card payload plus the
 *  current inline fields, used to refresh the row over its cached link snapshot. */
export interface LinkedTicketData {
  hoverData: TicketPillHoverData | undefined;
  /** Live inline fields. Undefined when no live source is available yet, so the
   *  caller keeps showing the cached link snapshot. */
  jiraStatus?: JiraStatus;
  title?: string;
  type?: IssueType;
  assignee?: Assignee | null;
}

/**
 * Resolves live data for a single linked issue. Linked-issue rows otherwise show
 * only a cached link snapshot (stale status/title/assignee, no PO metadata), and
 * the board-wide list only covers tickets on synced sprints. This prefers the
 * board ticket (instant, no fetch) and falls back to an on-demand single-ticket
 * fetch (which background-syncs from Jira) once the row is hovered. The returned
 * inline fields let the row refresh in place; hoverData feeds the tooltip.
 */
export function useLinkedTicketData(
  key: string,
  boardTicket: Ticket | undefined,
  primed: boolean,
): LinkedTicketData {
  const { sprints } = useJiraSprints();
  const sprintNames = useMemo(() => {
    const m: Record<string, string> = {};
    sprints.forEach((s) => { m[s.id] = s.name; });
    return m;
  }, [sprints]);

  // Only fetch (and background-sync) when the row is hovered and the board list
  // doesn't already cover it.
  const { data: detail } = useTicketDetail(primed && !boardTicket ? key : null);

  return useMemo(() => {
    const live = boardTicket ?? detail;
    if (!live) return { hoverData: undefined };

    const hoverData = buildTicketHoverData(live, sprintNames);
    // The detail payload omits the aggregate subtask counts the board list
    // carries, so derive them from its subtask array for an accurate count row.
    if (detail && !boardTicket) {
      const subs = detail.subtasks ?? [];
      hoverData.totalSubtaskCount = subs.length;
      hoverData.openSubtaskCount = subs.filter((s) => !DONE_LIKE_STATUSES.has(s.jiraStatus.toUpperCase())).length;
    }

    return {
      hoverData,
      jiraStatus: live.jiraStatus,
      title: live.title,
      type: live.type,
      assignee: live.assignee ?? null,
    };
  }, [boardTicket, detail, sprintNames]);
}
