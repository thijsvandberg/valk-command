import useSWR, { mutate as globalMutate } from "swr";
import { useRef, useMemo, useEffect, useCallback } from "react";
import type { Ticket, ActivityLogEntry, StoredReview } from "@/types/ticket";

// Generic JSON fetcher for SWR
const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));

// Fetches saved sprint slot configuration with SWR caching
export function useSprintSlots() {
  return useSWR<{ slotIndex: number; sprintId: string; sprintName: string }[] | null>(
    "/api/sprint-slots",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );
}

// Fetches cached sprint list from the DB
export function useJiraSprints() {
  return useSWR<{ id: number; name: string; state: string; startDate: string | null; endDate: string | null; hidden?: boolean }[]>(
    "/api/jira/sprints",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );
}

// Fetches all tickets for a sprint from the local DB.
// Pass "__all__" to fetch all tickets regardless of sprint.
export function useTickets(sprintId: string | null) {
  const key =
    sprintId === "__all__"
      ? "/api/tickets"
      : sprintId
      ? `/api/tickets?sprintId=${encodeURIComponent(sprintId)}`
      : null;
  return useSWR<Ticket[]>(key, fetcher, { revalidateOnFocus: false, dedupingInterval: 30000 });
}

// Fetches full ticket detail with background staleness check.
// After returning cached data, checks Jira for updates. If stale,
// triggers a single-ticket sync and revalidates the local cache.
export function useTicketDetail(ticketKey: string | null) {
  const swr = useSWR(
    ticketKey ? `/api/tickets/${encodeURIComponent(ticketKey)}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );

  const checkedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ticketKey || !swr.data) return;
    if (checkedRef.current === ticketKey) return;
    checkedRef.current = ticketKey;

    let cancelled = false;

    fetch(`/api/jira/check-updated?key=${encodeURIComponent(ticketKey)}`)
      .then((r) => r.ok ? r.json() : null)
      .then(async (result) => {
        if (cancelled || !result?.stale) return;
        await fetch("/api/jira/sync-tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticketKeys: [ticketKey] }),
        });
        swr.mutate();
      })
      .catch(() => { /* background check, fail silently */ });

    return () => { cancelled = true; };
  }, [ticketKey, swr.data]);

  return swr;
}

// Fetches ticket versions for the side panel (lazy: only when ticketKey is provided)
export function useTicketVersions(ticketKey: string | null) {
  return useSWR(
    ticketKey ? `/api/tickets/${encodeURIComponent(ticketKey)}/versions` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );
}

// Fetches only version metadata to get the count without loading full content
export function useTicketVersionCount(ticketKey: string | null) {
  return useSWR<unknown[]>(
    ticketKey ? `/api/tickets/${encodeURIComponent(ticketKey)}/versions?metaOnly=true` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );
}

// Fetches comments (PO + Jira) for a ticket
export function useTicketComments(ticketKey: string | null) {
  return useSWR(
    ticketKey ? `/api/tickets/${encodeURIComponent(ticketKey)}/comments` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );
}

// Fetches attachment metadata for a ticket
export function useTicketAttachments(ticketKey: string | null) {
  return useSWR(
    ticketKey ? `/api/tickets/${encodeURIComponent(ticketKey)}/attachments` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );
}

// Polls recent activity log entries (latest N results)
export function useActivityStatus(limit = 10) {
  return useSWR<ActivityLogEntry[]>(
    `/api/activity-log?limit=${limit}`,
    fetcher,
    { refreshInterval: 10000, revalidateOnFocus: true },
  );
}

// Checks Jira connectivity (long interval, no need to poll frequently)
export function useJiraHealth() {
  return useSWR<{ ok: boolean; live: boolean; error?: string; cachedDataAvailable?: boolean }>(
    "/api/jira/health",
    fetcher,
    { refreshInterval: 60000, revalidateOnFocus: false },
  );
}

// Checks if a ticket's Jira data is stale (lazy: only when key is provided)
export function useConflictCheck(ticketKey: string | null) {
  return useSWR<{ stale: boolean; localUpdated: string | null; remoteUpdated: string; key: string }>(
    ticketKey ? `/api/jira/check-updated?key=${encodeURIComponent(ticketKey)}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );
}

// Fetches stored reviews for a ticket, including current version hash for freshness check
export function useTicketReviews(ticketKey: string | null) {
  const swr = useSWR<{ reviews: StoredReview[]; currentVersionHash: string | null }>(
    ticketKey ? `/api/tickets/${encodeURIComponent(ticketKey)}/reviews` : null,
    fetcher,
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
      const res = await fetch(`/api/tickets/${encodeURIComponent(ticketKey)}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(review),
      });
      if (!res.ok) return null;
      const saved = await res.json();
      // Revalidate reviews list and ticket data (qualityScore updated on server)
      swr.mutate();
      globalMutate(`/api/tickets/${encodeURIComponent(ticketKey)}`);
      globalMutate((key) => typeof key === "string" && key.startsWith("/api/tickets?"), undefined, { revalidate: true });
      return saved as StoredReview;
    },
    [ticketKey, swr],
  );

  const deleteReview = useCallback(
    async (reviewId: string) => {
      if (!ticketKey) return false;
      const res = await fetch(
        `/api/tickets/${encodeURIComponent(ticketKey)}/reviews/${encodeURIComponent(reviewId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) return false;
      swr.mutate();
      globalMutate(`/api/tickets/${encodeURIComponent(ticketKey)}`);
      globalMutate((key) => typeof key === "string" && key.startsWith("/api/tickets?"), undefined, { revalidate: true });
      return true;
    },
    [ticketKey, swr],
  );

  return { ...swr, saveReview, deleteReview };
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
    fetcher,
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
