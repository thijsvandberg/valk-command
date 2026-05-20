import useSWR, { mutate as globalMutate } from "swr";
import { useRef, useMemo, useEffect, useCallback } from "react";
import type { Ticket, TicketDetail, ActivityLogEntry, StoredReview, StoryVersion } from "@/types/ticket";
import type { DevInfoPayload } from "@/app/api/tickets/[key]/dev-info/route";
import { swrFetcher, tickets as ticketsApi, jira as jiraApi } from "@/lib/api-client";

// Fetches saved sprint slot configuration with SWR caching
export function useSprintSlots() {
  return useSWR<{ slotIndex: number; sprintId: string; sprintName: string }[] | null>(
    "/api/sprint-slots",
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );
}

// Fetches cached sprint list from the DB
export function useJiraSprints() {
  return useSWR<{ id: number; name: string; state: string; startDate: string | null; endDate: string | null; goal: string | null; hidden?: boolean }[]>(
    "/api/jira/sprints",
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );
}

// Fetches all tickets for a sprint from the local DB.
// Pass "__all__" to fetch all tickets regardless of sprint.
// On mount (or sprint change), fires a background timestamp-first sync
// to pick up remote changes and detect deleted tickets without blocking the UI.
export function useTickets(sprintId: string | null) {
  const key =
    sprintId === "__all__"
      ? "/api/tickets"
      : sprintId
      ? `/api/tickets?sprintId=${encodeURIComponent(sprintId)}`
      : null;
  const swr = useSWR<Ticket[]>(key, swrFetcher, { revalidateOnFocus: true, dedupingInterval: 5000, refreshInterval: 15000 });
  const { mutate } = swr;

  const syncedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sprintId || sprintId === "__all__") return;
    if (syncedRef.current === sprintId) return;
    syncedRef.current = sprintId;

    let cancelled = false;

    jiraApi.syncTickets({ sprintId, strategy: "timestamp-first" })
      .then(() => { if (!cancelled) mutate(); })
      .catch(() => { /* background sync, fail silently */ });

    return () => { cancelled = true; };
  }, [sprintId, mutate]);

  return swr;
}

// Fetches full ticket detail with background staleness check.
// After returning cached data, checks Jira for updates. If stale,
// triggers a single-ticket sync and revalidates the local cache.
export function useTicketDetail(ticketKey: string | null) {
  const swr = useSWR<Ticket & TicketDetail>(
    ticketKey ? `/api/tickets/${encodeURIComponent(ticketKey)}` : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );

  const checkedRef = useRef<string | null>(null);
  const { mutate } = swr;

  useEffect(() => {
    if (!ticketKey) return;
    if (checkedRef.current === ticketKey) return;
    checkedRef.current = ticketKey;

    let cancelled = false;

    jiraApi.checkUpdated(ticketKey)
      .then(async (result: { stale?: boolean; removed?: boolean } | null) => {
        if (cancelled) return;
        if (result?.removed) { mutate(); return; }
        if (!result?.stale) return;
        await jiraApi.syncTickets({ ticketKeys: [ticketKey] });
        mutate();
      })
      .catch(() => { /* background check, fail silently */ });

    return () => { cancelled = true; };
  }, [ticketKey, mutate]);

  return swr;
}

// Fetches ticket versions for the side panel (lazy: only when ticketKey is provided)
export function useTicketVersions(ticketKey: string | null) {
  return useSWR<StoryVersion[]>(
    ticketKey ? `/api/tickets/${encodeURIComponent(ticketKey)}/versions` : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );
}

// Fetches only version metadata to get the count without loading full content
export function useTicketVersionCount(ticketKey: string | null) {
  return useSWR<unknown[]>(
    ticketKey ? `/api/tickets/${encodeURIComponent(ticketKey)}/versions?metaOnly=true` : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );
}

// Fetches comments (PO + Jira) for a ticket
export function useTicketComments(ticketKey: string | null) {
  return useSWR<unknown[]>(
    ticketKey ? `/api/tickets/${encodeURIComponent(ticketKey)}/comments` : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );
}

// Fetches attachment metadata for a ticket
export function useTicketAttachments(ticketKey: string | null) {
  return useSWR<unknown[]>(
    ticketKey ? `/api/tickets/${encodeURIComponent(ticketKey)}/attachments` : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );
}

// Polls recent activity log entries (latest N results)
export function useActivityStatus(limit = 10) {
  return useSWR<ActivityLogEntry[]>(
    `/api/activity-log?limit=${limit}`,
    swrFetcher,
    { refreshInterval: 10000, revalidateOnFocus: true },
  );
}

// Checks Jira connectivity (long interval, no need to poll frequently)
export function useJiraHealth() {
  return useSWR<{ ok: boolean; live: boolean; error?: string; cachedDataAvailable?: boolean }>(
    "/api/jira/health",
    swrFetcher,
    { refreshInterval: 60000, revalidateOnFocus: false },
  );
}

export function useConfluenceHealth() {
  return useSWR<{ ok: boolean; live: boolean; error?: string }>(
    "/api/confluence/health",
    swrFetcher,
    { refreshInterval: 60000, revalidateOnFocus: false },
  );
}

export function useTicketConfluenceLinks(ticketKey: string | null) {
  return useSWR<{ links: Array<{ id: string; ticketKey: string; pageId: string; pageTitle: string; pageUrl: string; source: string; lastModifiedAt: string | null; lastModifiedBy: string | null; createdAt: string }> }>(
    ticketKey ? `/api/tickets/${encodeURIComponent(ticketKey)}/confluence-links` : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );
}

// Checks if a ticket's Jira data is stale (lazy: only when key is provided)
export function useConflictCheck(ticketKey: string | null) {
  return useSWR<{ stale: boolean; localUpdated: string | null; remoteUpdated: string; key: string }>(
    ticketKey ? `/api/jira/check-updated?key=${encodeURIComponent(ticketKey)}` : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );
}

// Fetches stored reviews for a ticket, including current version hash for freshness check
export function useTicketReviews(ticketKey: string | null) {
  const swr = useSWR<{ reviews: StoredReview[]; currentVersionHash: string | null }>(
    ticketKey ? `/api/tickets/${encodeURIComponent(ticketKey)}/reviews` : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );

  const saveReview = useCallback(
    async (review: {
      source: "ticket-detail" | "chat" | "bulk-action";
      overallScore: number;
      dimensions: { key: string; label: string; score: number; feedback: string }[];
      summary: string;
      suggestions: string[];
    }) => {
      if (!ticketKey) return null;
      const saved = await ticketsApi.createReview(ticketKey, review) as StoredReview;
      // Revalidate reviews list and ticket data (qualityScore updated on server)
      swr.mutate();
      globalMutate(ticketsApi.detailUrl(ticketKey));
      globalMutate((key) => typeof key === "string" && key.startsWith("/api/tickets?"), undefined, { revalidate: true });
      return saved;
    },
    [ticketKey, swr],
  );

  const deleteReview = useCallback(
    async (reviewId: string) => {
      if (!ticketKey) return false;
      await ticketsApi.deleteReview(ticketKey, reviewId);
      swr.mutate();
      globalMutate(ticketsApi.detailUrl(ticketKey));
      globalMutate((key) => typeof key === "string" && key.startsWith("/api/tickets?"), undefined, { revalidate: true });
      return true;
    },
    [ticketKey, swr],
  );

  return { ...swr, saveReview, deleteReview };
}

// Fetches Bitbucket development info (branches, PRs, commits, builds) for a ticket
export function useDevInfo(ticketKey: string | null) {
  return useSWR<DevInfoPayload>(
    ticketKey ? `/api/tickets/${encodeURIComponent(ticketKey)}/dev-info` : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );
}

export interface ActiveSession {
  sessionId: string;
  ticketKey: string;
  title: string;
  sprintName: string | null;
  status: string;
  updatedAt: string | null;
}

// Fetches active story writer sessions with enriched ticket info
export function useActiveWriterSessions() {
  return useSWR<ActiveSession[]>(
    "/api/story-writer/active-sessions",
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );
}

// Debounce hook: returns a stable function that delays invoking callback
export function useDebouncedCallback<A extends unknown[]>(
  callback: (...args: A) => void,
  delay: number,
): (...args: A) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return useMemo(
    () =>
      (...args: A) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => callbackRef.current(...args), delay);
      },
    [delay],
  );
}
