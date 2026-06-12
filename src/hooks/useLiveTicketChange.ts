"use client";

import { useEffect } from "react";
import { useChangeHighlight } from "@/hooks/useChangeHighlight";
import { subscribeTicketChange } from "@/lib/live-ticket-changes";
import { getClientId } from "@/lib/client-id";

/**
 * Per-row companion to useTicketEventsStream: returns the change kinds
 * currently flashing for this ticket. Changes this tab originated are
 * suppressed (the tab already shows its own edit optimistically).
 */
export function useLiveTicketChange(ticketKey: string | null): ReadonlySet<string> {
  const { activeKinds, trigger } = useChangeHighlight();

  useEffect(() => {
    if (!ticketKey) return;
    return subscribeTicketChange(ticketKey, (event) => {
      if (event.origin && event.origin === getClientId()) return;
      trigger(event.kinds);
    });
  }, [ticketKey, trigger]);

  return activeKinds;
}
