"use client";

import { useCallback, useEffect, useMemo } from "react";
import useSWR from "swr";
import { swrFetcher, apiFetch } from "@/lib/api-client";
import { subscribeEvents } from "@/lib/event-bus";
import type { StatusChangeItem } from "@/lib/status-changes-query";

// Ticket-event kinds that can change the status-change queue: a new transition, new
// "what's new" activity, or a test-doc draft landing (BRDG-471, its own persistent
// "draft ready to accept" line). A relevant event revalidates the queue so it updates
// on an already-open board without a manual refresh (BRDG-414).
const REVALIDATE_KINDS = new Set(["status", "comment", "content", "sprint", "test_doc"]);
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
    // BRDG-439/446: one line can carry a status-change id, a sprint-add id, and/or a deploy
    // seen-key; dismissing marks all of them, so the combined line never leaves a half-line
    // behind. Drop by ticketKey (a sprint-/deploy-only line has a null status-change id) and
    // POST the id set in one request.
    async (item: StatusChangeItem) => {
      const ids = [item.id, item.sprintAdded?.id, item.deployAdded?.id].filter((x): x is string => !!x);
      if (ids.length === 0) return;
      await mutate((cur) => (cur ? { rows: cur.rows.filter((r) => r.ticketKey !== item.ticketKey) } : cur), { revalidate: false });
      try {
        await apiFetch("/api/status-changes/seen", { method: "POST", body: { ids } });
      } finally {
        void mutate();
      }
    },
    [mutate],
  );

  const markAllSeen = useCallback(async () => {
    const ids = (data?.rows ?? []).flatMap((r) => [r.id, r.sprintAdded?.id, r.deployAdded?.id]).filter((x): x is string => !!x);
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
