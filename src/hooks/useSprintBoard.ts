import useSWR from "swr";
import { useRef, useMemo, useEffect } from "react";
import type { Ticket, SyncLogEntry } from "@/types/ticket";

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
  return useSWR<{ id: number; name: string; state: string; startDate: string | null; endDate: string | null }[]>(
    "/api/jira/sprints",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );
}

// Fetches all tickets for a sprint from the local DB
export function useTickets(sprintId: string | null) {
  return useSWR<Ticket[]>(
    sprintId ? `/api/tickets?sprintId=${encodeURIComponent(sprintId)}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );
}

// Fetches full ticket detail (lazy: only when key is provided)
export function useTicketDetail(ticketKey: string | null) {
  return useSWR(
    ticketKey ? `/api/tickets/${encodeURIComponent(ticketKey)}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );
}

// Fetches ticket versions for the side panel (lazy: only when ticketKey is provided)
export function useTicketVersions(ticketKey: string | null) {
  return useSWR(
    ticketKey ? `/api/tickets/${encodeURIComponent(ticketKey)}/versions` : null,
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

// Polls recent sync log entries (latest N results)
export function useSyncStatus(limit = 10) {
  return useSWR<SyncLogEntry[]>(
    `/api/sync-log?limit=${limit}`,
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
