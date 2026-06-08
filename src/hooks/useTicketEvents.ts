"use client";

import { useEffect, useRef } from "react";
import type { TicketEvent } from "@/lib/ticket-events";

const RECONNECT_DELAY_MS = 3_000;

/**
 * Subscribes to a ticket's content:changed SSE stream and invokes `onChange`
 * when the ticket's content moves on elsewhere (another tab, Jira webhook,
 * agent sync). Pass a null key to disable the subscription.
 */
export function useTicketEvents(
  ticketKey: string | null,
  onChange: (event: TicketEvent) => void,
) {
  // Keep the latest callback without re-subscribing on every render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!ticketKey || ticketKey.startsWith("DRAFT-")) return;

    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    function connect() {
      if (closed || typeof EventSource === "undefined" || !ticketKey) return;
      es = new EventSource(`/api/tickets/${encodeURIComponent(ticketKey)}/events`);

      const handleEvent = (e: MessageEvent) => {
        let event: TicketEvent;
        try {
          event = JSON.parse(e.data) as TicketEvent;
        } catch {
          return;
        }
        onChangeRef.current(event);
      };

      es.addEventListener("content:changed", handleEvent);

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
    };
  }, [ticketKey]);
}
