"use client";

import { useEffect, useRef } from "react";
import type { TicketChangeKind, TicketEvent } from "@/lib/ticket-events";

const RECONNECT_DELAY_MS = 3_000;
const DEFAULT_COALESCE_MS = 200;

/**
 * Subscribes to a ticket's SSE stream and invokes `onChange` when the ticket's
 * data moves on elsewhere (another tab, Jira sync, agent push). Pass a null key
 * to disable the subscription.
 *
 * Rapid bursts (a sync touching many fields fires several write paths) are
 * coalesced into a single callback whose `kinds` is the union of the burst.
 * `origin` survives coalescing only when every event in the burst shares it;
 * a mixed burst is treated as foreign (null origin) so it still highlights.
 */
export function useTicketEvents(
  ticketKey: string | null,
  onChange: (event: TicketEvent) => void,
  options?: { coalesceMs?: number },
) {
  const coalesceMs = options?.coalesceMs ?? DEFAULT_COALESCE_MS;

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

    let pendingKinds: Set<TicketChangeKind> | null = null;
    let pendingOrigin: string | null | undefined;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    function flush() {
      flushTimer = null;
      if (!pendingKinds || !ticketKey) return;
      const kinds = Array.from(pendingKinds);
      const origin = pendingOrigin === undefined ? null : pendingOrigin;
      pendingKinds = null;
      pendingOrigin = undefined;
      onChangeRef.current({ type: "ticket:changed", ticketKey, kinds, origin });
    }

    function enqueue(event: TicketEvent) {
      if (coalesceMs <= 0) {
        onChangeRef.current(event);
        return;
      }
      if (!pendingKinds) {
        pendingKinds = new Set(event.kinds);
        pendingOrigin = event.origin ?? null;
      } else {
        for (const kind of event.kinds) pendingKinds.add(kind);
        if (pendingOrigin !== (event.origin ?? null)) pendingOrigin = null;
      }
      if (!flushTimer) flushTimer = setTimeout(flush, coalesceMs);
    }

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
        if (!Array.isArray(event.kinds) || event.kinds.length === 0) return;
        enqueue(event);
      };

      es.addEventListener("ticket:changed", handleEvent);

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
      if (flushTimer) clearTimeout(flushTimer);
    };
  }, [ticketKey, coalesceMs]);
}
