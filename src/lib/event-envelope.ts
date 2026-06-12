import type { TicketEvent } from "@/lib/ticket-events";
import type { RefinementEvent } from "@/lib/refinement-events";

/**
 * Wire format of the unified /api/events SSE stream (BRDG-342). Every server
 * event is wrapped with its family so a single connection can carry both the
 * ticket and refinement event buses; clients demultiplex on `channel`.
 */
export type BridgeEventEnvelope =
  | { channel: "ticket"; event: TicketEvent }
  | { channel: "refinement"; event: RefinementEvent };

export function isBridgeEventEnvelope(value: unknown): value is BridgeEventEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { channel?: unknown; event?: unknown };
  if (candidate.channel !== "ticket" && candidate.channel !== "refinement") return false;
  return typeof candidate.event === "object" && candidate.event !== null;
}
