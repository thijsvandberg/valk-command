import { EventEmitter } from "events";

export type TicketEventType = "content:changed";

export interface TicketEvent {
  type: TicketEventType;
  ticketKey: string;
}

// Singleton emitter shared across API routes within the same process. Lets an
// open Story Writer tab learn that a ticket's content moved on (push, Jira
// webhook, agent sync) without polling, so its staleness banner stays accurate.
const emitter = new EventEmitter();
emitter.setMaxListeners(50);

export function emitTicketEvent(event: TicketEvent): void {
  emitter.emit("ticket", event);
}

export function onTicketEvent(listener: (event: TicketEvent) => void): () => void {
  emitter.on("ticket", listener);
  return () => emitter.off("ticket", listener);
}
