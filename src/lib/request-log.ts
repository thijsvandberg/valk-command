import "server-only";

import { logger } from "@/lib/logger";
import { runWithRequestContext } from "@/lib/request-context";

const REQUEST_ID_HEADER = "x-request-id";
const USER_HEADER = "x-bridge-user-id";

// An App Router route handler: first arg is the Request (Next's generated route
// validator requires this exact shape on the export), optional rest is the
// route context (e.g. `{ params }`). A handler may declare fewer params (it can
// ignore the request entirely), which still assigns to this shape.
type RouteHandler<A extends unknown[]> = (
  request: Request,
  ...rest: A
) => Response | Promise<Response>;

/**
 * Wrap a route handler so it emits exactly one access-log line per request:
 *   method, path, status, duration (ms), userId, requestId.
 *
 * It also activates the request context (from the middleware-set `x-request-id`)
 * for the duration of the handler, so any logger.* call inside the handler --
 * including a catch-block error -- carries the same `reqId=` and correlates to
 * this access line and to onRequestError.
 *
 * The handler's Response is returned unchanged, so route behavior and tests are
 * unaffected. This is the standard wrapper for new/edited routes; apply it to
 * fault-prone or high-traffic handlers (see BRDG-400). Full coverage of all
 * routes is incremental, not a retrofit.
 */
export function withRequestLog<A extends unknown[]>(
  handler: RouteHandler<A>,
): RouteHandler<A> {
  return async (request: Request, ...rest: A): Promise<Response> => {
    const start = Date.now();

    // Be defensive: the wrapper may be applied to a handler whose runtime first
    // argument is not a standard Request (some handlers ignore it). Fall back to
    // empty values rather than throwing inside the logging path.
    const headers = request?.headers;
    const requestId = headers?.get(REQUEST_ID_HEADER) ?? undefined;
    const userId = headers?.get(USER_HEADER) ?? undefined;
    const method = request?.method ?? "UNKNOWN";
    const path = safePath(request);

    const run = () => handler(request, ...rest);

    // Without a request id there is no context worth establishing; still emit
    // the access line so the request remains visible.
    const response = requestId
      ? await runWithRequestContext({ requestId }, run)
      : await run();

    const durationMs = Date.now() - start;
    logger.info(
      "access",
      `${method} ${path} ${response.status} ${durationMs}ms${userId ? ` user=${userId}` : ""}${requestId ? ` reqId=${requestId}` : ""}`,
    );

    return response;
  };
}

function safePath(request: Request | undefined): string {
  try {
    if (!request?.url) return "unknown";
    return new URL(request.url).pathname;
  } catch {
    return "unknown";
  }
}
