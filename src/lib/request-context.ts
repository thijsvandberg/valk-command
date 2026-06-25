import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request data that should ride along with every log line emitted while a
 * request is being handled, without each call site having to thread it
 * explicitly. Today this is just the correlation id; it is a record so more
 * fields (e.g. userId) can be added later without touching call sites.
 */
export interface RequestContext {
  requestId: string;
}

// AsyncLocalStorage is a Node-runtime API. The store is undefined outside an
// active request (background jobs, the Edge middleware, scripts), which is why
// every reader below tolerates absence.
const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Run `fn` with `context` active for the duration of the (possibly async) call.
 * Anything awaited inside `fn` keeps the same context, so a logger.* call deep
 * in the stack can recover the request id via getRequestId().
 */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/**
 * The correlation id for the in-flight request, or undefined when no request
 * context is active. The logger appends it only when present, so call sites
 * outside a request keep logging exactly as before.
 */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
