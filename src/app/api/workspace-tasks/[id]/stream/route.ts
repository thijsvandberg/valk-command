import { agentFetchStream } from "@/lib/agent-fetch";
import { validatePathParam } from "@/lib/api-validation";

const INACTIVITY_TIMEOUT_MS = 180_000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const invalid = validatePathParam(id);
  if (invalid) return invalid;

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
  // The background captureTaskStream handler has its own independent connection
  // to the VRW, so aborting this proxy's upstream does not affect result capture.
  const upstreamAbort = new AbortController();

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

  upstream.body
    .pipeTo(transform.writable, { signal: upstreamAbort.signal })
    .catch(() => {
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
