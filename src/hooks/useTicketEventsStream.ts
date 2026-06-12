"use client";

import { useEffect } from "react";
import type { TicketChangeKind, TicketEvent } from "@/lib/ticket-events";
import { publishTicketChange } from "@/lib/live-ticket-changes";
import { revalidateTicketCachesFor } from "@/lib/ticket-cache";

const RECONNECT_DELAY_MS = 3_000;
const COALESCE_MS = 200;

interface PendingChange {
  kinds: Set<TicketChangeKind>;
  origin: string | null;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Single multiplexed subscription to the broadcast ticket-events stream.
 * Mount once per list view (sprint board, refinement); for every changed
 * ticket it revalidates the SWR caches holding that ticket and fans the
 * event out to per-row subscribers via the live-ticket-changes bus (for
 * the highlight). Bursts are coalesced per ticket key. The 150s poll stays
 * as the fallback; this is the fast path.
 */
export function useTicketEventsStream() {
  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
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

    function connect() {
      if (closed || typeof EventSource === "undefined") return;
      es = new EventSource("/api/tickets/events");

      es.addEventListener("ticket:changed", (e: MessageEvent) => {
        let event: TicketEvent;
        try {
          event = JSON.parse(e.data) as TicketEvent;
        } catch {
          return;
        }
        if (!event.ticketKey || !Array.isArray(event.kinds) || event.kinds.length === 0) return;
        enqueue(event);
      });

      es.onerror = () => {
        es?.close();
        es = null;
        if (!closed) {
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };
    }

    connect();

    return () => {
      closed = true;
      es?.close();
      es = null;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      for (const entry of pending.values()) clearTimeout(entry.timer);
      pending.clear();
    };
  }, []);
}
