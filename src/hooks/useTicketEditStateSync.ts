"use client";

import { useCallback } from "react";
import { useSWRConfig } from "swr";
import type { ScopedMutator } from "swr";
import { publishTicketSync } from "@/lib/ticket-sync-channel";
import type { Ticket, TicketEditState } from "@/types/ticket";

// Patches the SWR detail and list caches for a ticket's new edit-state without a
// network round-trip. Shared by the cross-tab listener (TicketSyncBridge) and the
// in-tab publisher hook below, so an edit-state change is reflected instantly in
// the acting tab too (a BroadcastChannel never delivers to the tab that posted).
export function patchTicketEditStateCaches(
  mutate: ScopedMutator,
  key: string,
  editState: TicketEditState,
): void {
  // Detail cache: /api/tickets/{key}
  mutate(
    `/api/tickets/${encodeURIComponent(key)}`,
    (prev: (Ticket & { localEdits?: unknown }) | undefined) =>
      prev
        ? { ...prev, editState, localEdits: editState === "clean" ? {} : prev.localEdits }
        : prev,
    { revalidate: false },
  );

  // List caches: /api/tickets and /api/tickets?sprintId=... (never the detail key,
  // which has a path segment after /api/tickets).
  mutate(
    (k) => typeof k === "string" && /^\/api\/tickets(\?|$)/.test(k),
    (list: Ticket[] | undefined) =>
      Array.isArray(list)
        ? list.map((t) => (t.key === key ? { ...t, editState } : t))
        : list,
    { revalidate: false },
  );
}

// Returns a function that records a ticket's new edit-state both in this tab's SWR
// caches (instant) and in every other open tab (via the broadcast channel). Use
// this wherever a local edit/draft is created, discarded, or pushed.
export function useTicketEditStateSync() {
  const { mutate } = useSWRConfig();
  return useCallback(
    (key: string, editState: TicketEditState) => {
      patchTicketEditStateCaches(mutate, key, editState);
      publishTicketSync({ key, editState });
    },
    [mutate],
  );
}
