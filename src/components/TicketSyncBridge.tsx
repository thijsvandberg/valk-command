"use client";

import { useEffect } from "react";
import { useSWRConfig } from "swr";
import { subscribeTicketSync } from "@/lib/ticket-sync-channel";
import { patchTicketEditStateCaches } from "@/hooks/useTicketEditStateSync";

// Listens for cross-tab ticket edit-state changes and optimistically patches
// every matching SWR cache entry (the ticket detail and any sprint/backlog list
// that contains the ticket). Patching with revalidate:false makes the label
// disappear instantly in other tabs; the normal background poll reconciles with
// the server afterwards. See lib/ticket-sync-channel.ts for the why.
export function TicketSyncBridge() {
  const { mutate } = useSWRConfig();

  useEffect(() => {
    return subscribeTicketSync(({ key, editState }) => {
      patchTicketEditStateCaches(mutate, key, editState);
    });
  }, [mutate]);

  return null;
}
