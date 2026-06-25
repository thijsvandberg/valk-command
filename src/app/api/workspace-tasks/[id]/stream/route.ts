import { agentFetchStream } from "@/lib/agent-fetch";
import { validatePathParam } from "@/lib/api-validation";
import { logger } from "@/lib/logger";

const INACTIVITY_TIMEOUT_MS = 180_000;

/**
 * A mid-stream pipe error that means "the client (or our own inactivity timer)
 * cut the connection" rather than "the upstream broke". These are routine for an
 * SSE proxy and must not be logged as errors. Mirrors the abort-detection style
 * in instrumentation.ts; kept local because route.ts must export handlers only.
 */
function isExpectedAbort(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const name = (err as { name?: unknown }).name;
  if (name === "AbortError" || name === "ResponseAborted") return true;
  const code = (err as { code?: unknown }).code;
  if (code === "ECONNRESET" || code === "ERR_STREAM_PREMATURE_CLOSE") return true;
  const message = (err as { message?: unknown }).message;
  if (typeof message === "string") {
    const m = message.toLowerCase();
    if (m.includes("abort") || m.includes("the stream has been aborted")) return true;
  }
  return false;
}

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
    .catch((err: unknown) => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      // A genuine upstream failure mid-stream (the agent died, the connection
      // dropped on its side) was swallowed before, so a half-finished proxied
      // task left no trace. Expected client aborts stay silent (BRDG-402).
      if (!isExpectedAbort(err)) {
        logger.warn("workspace-task-stream", "pipe failed", {
          event: "task_stream_pipe_failed",
          taskId: id,
          cause: err instanceof Error ? err.message : String(err),
        });
      }
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
