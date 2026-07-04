import { EventEmitter } from "events";
import { CLIENT_ID_HEADER } from "@/lib/client-id";

export type TicketChangeKind =
  | "content"
  | "status"
  | "assignee"
  | "points"
  | "sprint"
  | "labels"
  | "comment"
  | "subtasks"
  | "links"
  | "test_doc";

export interface TicketEvent {
  type: "ticket:changed";
  ticketKey: string;
  /** Which aspects of the ticket changed in this (coalesced) write. */
  kinds: TicketChangeKind[];
  /** Client (tab) id that caused the write, so that tab can suppress its own highlight. */
  origin?: string | null;
}

// Singleton emitter shared across API routes within the same process. Fans a
// local DB write out to every open tab subscribed to the ticket (detail page,
// Story Writer, board/refinement streams) without polling.
const emitter = new EventEmitter();
emitter.setMaxListeners(50);

export function emitTicketEvent(event: TicketEvent): void {
  emitter.emit("ticket", event);
}

export function onTicketEvent(listener: (event: TicketEvent) => void): () => void {
  emitter.on("ticket", listener);
  return () => emitter.off("ticket", listener);
}

/** Tab id of the caller, for echoing back as the event origin. */
export function originFromRequest(request: Request): string | null {
  return request.headers.get(CLIENT_ID_HEADER);
}
