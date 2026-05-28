import { EventEmitter } from "events";

export type RefinementEventType =
  | "session:created"
  | "session:updated"
  | "session:deleted"
  | "bulk-suggest:progress"
  | "bulk-suggest:complete"
  | "tickets:updated";

export interface RefinementEvent {
  type: RefinementEventType;
  sessionId?: string;
  ticketKey?: string;
}

// Singleton emitter shared across API routes within the same process
const emitter = new EventEmitter();
emitter.setMaxListeners(50);

export function emitRefinementEvent(event: RefinementEvent): void {
  emitter.emit("refinement", event);
}

export function onRefinementEvent(listener: (event: RefinementEvent) => void): () => void {
  emitter.on("refinement", listener);
  return () => emitter.off("refinement", listener);
}
