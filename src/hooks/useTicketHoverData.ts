"use client";

import { useMemo, useCallback, useContext, createContext, createElement, type ReactNode } from "react";
import useSWR from "swr";
import { useJiraSprints, useTicketDetail } from "@/hooks/useSprintBoard";
import { swrFetcher } from "@/lib/api-client";
import { buildTicketHoverData } from "@/lib/ticket-hover";
import type { Ticket, IssueType, JiraStatus, Assignee } from "@/types/ticket";
import type { TicketPillHoverData } from "@/components/shared/TicketStatusPill";

// Re-exported for the existing client importers (RecentlyViewedView,
// TicketRefPill, useLinkedTicketData below). The implementation lives in a
// server-safe lib so the hover endpoint can build the same shape (BRDG-412).
export { buildTicketHoverData };

// Subtask Jira statuses that count as closed when deriving open/total counts.
const DONE_LIKE_STATUSES = new Set(["DONE", "DEPRECATED"]);

// Resolve the hover lookup for an explicit, bounded set of keys instead of the
// whole backlog. Keys are batched per request (the server caps each call), so a
// container with many reference rows still issues one fetch, not one per row.
const HOVER_BATCH_SIZE = 100;
const NO_HOVER_DATA = (): TicketPillHoverData | undefined => undefined;

async function fetchHoverData(keys: string[]): Promise<Record<string, TicketPillHoverData>> {
  const out: Record<string, TicketPillHoverData> = {};
  for (let i = 0; i < keys.length; i += HOVER_BATCH_SIZE) {
    const chunk = keys.slice(i, i + HOVER_BATCH_SIZE);
    const part = await swrFetcher<Record<string, TicketPillHoverData>>(
      `/api/tickets/hover?keys=${encodeURIComponent(chunk.join(","))}`,
    );
    Object.assign(out, part);
  }
  return out;
}

/**
 * On-demand hover-card lookup for a bounded set of ticket keys (BRDG-412).
 * Fetches only the visible reference keys via GET /api/tickets/hover (batched,
 * deduped, SWR-cached on the sorted keys), instead of pulling the whole backlog.
 * Returns undefined for keys with no card (subtasks, Jira-only issues, etc.).
 */
export function useHoverData(keys: string[]): (key: string) => TicketPillHoverData | undefined {
  const sortedKeys = useMemo(() => Array.from(new Set(keys)).sort(), [keys]);
  const swrKey = sortedKeys.length > 0 ? `hoverData:${sortedKeys.join(",")}` : null;
  const { data } = useSWR<Record<string, TicketPillHoverData>>(
    swrKey,
    () => fetchHoverData(sortedKeys),
    { revalidateOnFocus: true, dedupingInterval: 15000 },
  );
  return useCallback((key: string) => data?.[key], [data]);
}

// Context that carries a per-container hover lookup down to the reference rows
// (ChildIssueRow, LinkSearchResultRow, SessionQueueItem). The container collects
// its visible keys and wraps its rows in <HoverDataProvider>, so the rows keep
// calling useTicketHoverData() unchanged but read batched, on-demand data.
const HoverDataContext = createContext<((key: string) => TicketPillHoverData | undefined) | null>(null);

export function HoverDataProvider({ keys, children }: { keys: string[]; children?: ReactNode }) {
  const lookup = useHoverData(keys);
  return createElement(HoverDataContext.Provider, { value: lookup }, children);
}

/**
 * Returns the hover-card lookup provided by the nearest <HoverDataProvider>.
 * Reference rows call this to resolve their key to a card. Without a provider
 * (or for keys outside the provider's set) it returns undefined, so the row
 * simply renders no card. Replaces the old whole-backlog lookup (BRDG-412).
 */
export function useTicketHoverData(): (key: string) => TicketPillHoverData | undefined {
  return useContext(HoverDataContext) ?? NO_HOVER_DATA;
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
