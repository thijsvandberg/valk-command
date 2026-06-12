import { onTicketEvent } from "@/lib/ticket-events";

export const dynamic = "force-dynamic";

/**
 * Broadcast SSE stream of ticket:changed events for ALL tickets. List views
 * (sprint board, refinement) hold one multiplexed connection here instead of
 * one per visible row: browsers cap concurrent connections per origin (~6 on
 * HTTP/1), so per-row EventSources would starve the app. Clients filter to
 * the keys they render.
 */
export async function GET() {
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;
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

      cleanup = onTicketEvent((event) => {
        try {
          const data = JSON.stringify(event);
          controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${data}\n\n`));
        } catch {
          // Client disconnected
        }
      });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      cleanup?.();
      cleanup = null;
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
