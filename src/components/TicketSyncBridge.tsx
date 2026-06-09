"use client";

import { useEffect } from "react";
import { useSWRConfig } from "swr";
import { subscribeTicketSync } from "@/lib/ticket-sync-channel";
import type { Ticket } from "@/types/ticket";

// Listens for cross-tab ticket edit-state changes and optimistically patches
// every matching SWR cache entry (the ticket detail and any sprint/backlog list
// that contains the ticket). Patching with revalidate:false makes the label
// disappear instantly in other tabs; the normal background poll reconciles with
// the server afterwards. See lib/ticket-sync-channel.ts for the why.
export function TicketSyncBridge() {
  const { mutate } = useSWRConfig();

  useEffect(() => {
    return subscribeTicketSync(({ key, editState }) => {
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
    });
  }, [mutate]);

  return null;
}
