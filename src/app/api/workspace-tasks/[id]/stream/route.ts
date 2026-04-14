import { agentFetchStream } from "@/lib/agent-fetch";

const INACTIVITY_TIMEOUT_MS = 60_000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const result = await agentFetchStream(`/api/tasks/${id}/stream`);

  if (!result.ok) {
    return new Response(
      JSON.stringify({ error: result.error.error, code: result.error.code }),
      {
        status: result.status || 502,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const upstream = result.data;

  if (!upstream.body) {
    return new Response(JSON.stringify({ error: "No stream body", code: "INVALID_RESPONSE" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Use an AbortController so we can kill the upstream read when:
  // - the client disconnects
  // - the stream goes idle for too long
  const upstreamAbort = new AbortController();

  // Detect client disconnect via the incoming request's abort signal
  request.signal.addEventListener("abort", () => {
    upstreamAbort.abort();
  });

  let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

  const resetInactivityTimer = () => {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      upstreamAbort.abort();
    }, INACTIVITY_TIMEOUT_MS);
  };

  // Start the inactivity timer
  resetInactivityTimer();

  const transform = new TransformStream({
    transform(chunk, controller) {
      resetInactivityTimer();
      controller.enqueue(chunk);
    },
    flush() {
      if (inactivityTimer) clearTimeout(inactivityTimer);
    },
  });

  // Pipe upstream through the transform, abort on signal
  upstream.body
    .pipeTo(transform.writable, { signal: upstreamAbort.signal })
    .catch(() => {
      // Expected when aborted (client disconnect / inactivity timeout)
      if (inactivityTimer) clearTimeout(inactivityTimer);
    });

  return new Response(transform.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
