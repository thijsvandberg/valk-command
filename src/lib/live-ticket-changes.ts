import type { TicketEvent } from "@/lib/ticket-events";

// Client-side fan-out for live ticket changes. The single broadcast SSE
// connection (useTicketEventsStream) publishes here; individual rows and
// views subscribe for just their own ticket key, so one event re-renders
// one row instead of the whole board.

type Listener = (event: TicketEvent) => void;

const listenersByKey = new Map<string, Set<Listener>>();

export function publishTicketChange(event: TicketEvent): void {
  const listeners = listenersByKey.get(event.ticketKey);
  if (!listeners) return;
  for (const listener of [...listeners]) listener(event);
}

export function subscribeTicketChange(ticketKey: string, listener: Listener): () => void {
  let listeners = listenersByKey.get(ticketKey);
  if (!listeners) {
    listeners = new Set();
    listenersByKey.set(ticketKey, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) listenersByKey.delete(ticketKey);
  };
}
