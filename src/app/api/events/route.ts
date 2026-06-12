import { onTicketEvent } from "@/lib/ticket-events";
import { onRefinementEvent } from "@/lib/refinement-events";
import type { BridgeEventEnvelope } from "@/lib/event-envelope";

export const dynamic = "force-dynamic";

/**
 * Unified SSE stream carrying both ticket and refinement events (BRDG-342).
 * Browsers cap concurrent connections per origin (~6 on HTTP/1.1) across ALL
 * tabs, so each tab holds at most this ONE stream instead of one per event
 * family; the client event bus demultiplexes on the envelope's channel.
 * No server-side filtering: subscribers filter by key/session client-side.
 */
export async function GET() {
  const encoder = new TextEncoder();
  let cleanupTicket: (() => void) | null = null;
  let cleanupRefinement: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(": heartbeat\n\n"));

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          if (heartbeat) clearInterval(heartbeat);
        }
      }, 15_000);

      const send = (envelope: BridgeEventEnvelope) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(envelope)}\n\n`));
        } catch {
          // Client disconnected
        }
      };

      cleanupTicket = onTicketEvent((event) => send({ channel: "ticket", event }));
      cleanupRefinement = onRefinementEvent((event) => send({ channel: "refinement", event }));
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      cleanupTicket?.();
      cleanupTicket = null;
      cleanupRefinement?.();
      cleanupRefinement = null;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
