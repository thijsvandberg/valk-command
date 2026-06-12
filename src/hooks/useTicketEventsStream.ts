"use client";

import { useEffect } from "react";
import type { TicketChangeKind, TicketEvent } from "@/lib/ticket-events";
import { publishTicketChange } from "@/lib/live-ticket-changes";
import { revalidateTicketCachesFor } from "@/lib/ticket-cache";
import { subscribeEvents } from "@/lib/event-bus";

const COALESCE_MS = 200;

interface PendingChange {
  kinds: Set<TicketChangeKind>;
  origin: string | null;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Broadcast subscription to ticket events on the shared event bus (one SSE
 * connection per browser, BRDG-342). Mount once per list view (sprint board,
 * refinement); for every changed ticket it revalidates the SWR caches holding
 * that ticket and fans the event out to per-row subscribers via the
 * live-ticket-changes bus (for the highlight). Bursts are coalesced per
 * ticket key. The 150s poll stays as the fallback; this is the fast path.
 */
export function useTicketEventsStream() {
  useEffect(() => {
    const pending = new Map<string, PendingChange>();

    function flush(ticketKey: string) {
      const entry = pending.get(ticketKey);
      if (!entry) return;
      pending.delete(ticketKey);
      const event: TicketEvent = {
        type: "ticket:changed",
        ticketKey,
        kinds: Array.from(entry.kinds),
        origin: entry.origin,
      };
      void revalidateTicketCachesFor(ticketKey);
      publishTicketChange(event);
    }

    function enqueue(event: TicketEvent) {
      const entry = pending.get(event.ticketKey);
      if (entry) {
        for (const kind of event.kinds) entry.kinds.add(kind);
        if (entry.origin !== (event.origin ?? null)) entry.origin = null;
        return;
      }
      pending.set(event.ticketKey, {
        kinds: new Set(event.kinds),
        origin: event.origin ?? null,
        timer: setTimeout(() => flush(event.ticketKey), COALESCE_MS),
      });
    }

    const unsubscribe = subscribeEvents((envelope) => {
      if (envelope.channel !== "ticket") return;
      const event = envelope.event;
      if (!event.ticketKey || !Array.isArray(event.kinds) || event.kinds.length === 0) return;
      enqueue(event);
    });

    return () => {
      unsubscribe();
      for (const entry of pending.values()) clearTimeout(entry.timer);
      pending.clear();
    };
  }, []);
}
