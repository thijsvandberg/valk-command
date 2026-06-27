"use client";

import { useCallback, useEffect, useMemo } from "react";
import useSWR from "swr";
import { swrFetcher, apiFetch } from "@/lib/api-client";
import { subscribeEvents } from "@/lib/event-bus";
import type { StatusChangeItem } from "@/lib/status-changes-query";

// Ticket-event kinds that can change the status-change queue: a new transition, or new
// "what's new" activity. A relevant event revalidates the queue so it updates on an
// already-open board without a manual refresh (BRDG-414).
const REVALIDATE_KINDS = new Set(["status", "comment", "content"]);
const EMPTY: StatusChangeItem[] = [];

interface StatusChangesResponse {
  rows: StatusChangeItem[];
}

/**
 * The active-sprint status-change review queue, scoped to the given ticket keys. SWR with
 * a 60s poll fallback, plus a live revalidation on the shared ticket-event bus. Exposes the
 * rows, a by-ticket-key map for the board, and optimistic markSeen / markAllSeen.
 */
export function useStatusChanges(ticketKeys: string[]) {
  // Sort so the SWR key is stable across reorders (only membership changes refetch).
  const sortedKeys = useMemo(() => [...ticketKeys].sort(), [ticketKeys]);
  const key = sortedKeys.length > 0 ? `/api/status-changes?keys=${encodeURIComponent(sortedKeys.join(","))}` : null;

  const { data, mutate, isLoading } = useSWR<StatusChangesResponse>(key, swrFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 10_000,
    refreshInterval: 60_000,
  });

  useEffect(() => {
    if (!key) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribeEvents((envelope) => {
      if (envelope.channel !== "ticket") return;
      const kinds = envelope.event?.kinds;
      if (!Array.isArray(kinds) || !kinds.some((k) => REVALIDATE_KINDS.has(k))) return;
      if (timer) return; // coalesce a burst
      timer = setTimeout(() => {
        timer = null;
        void mutate();
      }, 250);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [key, mutate]);

  const rows = data?.rows ?? EMPTY;

  const byKey = useMemo(() => {
    const m = new Map<string, StatusChangeItem>();
    for (const r of rows) m.set(r.ticketKey, r);
    return m;
  }, [rows]);

  const markSeen = useCallback(
    async (id: string) => {
      await mutate((cur) => (cur ? { rows: cur.rows.filter((r) => r.id !== id) } : cur), { revalidate: false });
      try {
        await apiFetch("/api/status-changes/seen", { method: "PUT", body: { id, seen: true } });
      } finally {
        void mutate();
      }
    },
    [mutate],
  );

  const markAllSeen = useCallback(async () => {
    const ids = (data?.rows ?? []).map((r) => r.id);
    if (ids.length === 0) return;
    await mutate({ rows: [] }, { revalidate: false });
    try {
      await apiFetch("/api/status-changes/seen", { method: "POST", body: { ids } });
    } finally {
      void mutate();
    }
  }, [data, mutate]);

  return { rows, byKey, markSeen, markAllSeen, isLoading };
}
