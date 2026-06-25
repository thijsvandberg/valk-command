// Client-side error sink (BRDG-398). Forwards browser-side failures to the
// server so they land in the production log (logs/prod-*.log) instead of dying
// silently in the user's console. Used by the global window error listeners
// (ClientErrorReporter), the React error boundaries, the SWR onError hook, and
// explicit call sites (BRDG-401 imports reportClientError for save failures).
//
// Hard guarantees this module must keep:
// - It must never throw. Reporting an error must not itself break the page.
// - It must never flood the server. A render/fetch loop can fire the same
//   error hundreds of times a second; we throttle to one identical report per
//   THROTTLE_MS keyed on message+pathname (matching the server-side dedup).
// - It must not leak secrets/PII: we forward only a bounded, known set of
//   fields and cap their length; no tokens, no full request bodies.

const ENDPOINT = "/api/client-error";

// One identical error per (message+pathname) per this window. Mirrors the
// server-side throttle so a single source is bounded at both ends.
const THROTTLE_MS = 30_000;

// Bound each forwarded string so a giant stack/message cannot blow up the
// request (the server caps again defensively).
const MAX_MESSAGE = 2_000;
const MAX_STACK = 8_000;

export interface ClientErrorPayload {
  message: string;
  stack?: string;
  digest?: string;
  pathname?: string;
  source?: string;
  userAgent?: string;
}

// Last-sent timestamp per dedup key. Module-scoped so it persists for the tab's
// lifetime; a long-lived tab in a render loop stays bounded.
const lastSent = new Map<string, number>();

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

// Pull a human message + stack out of whatever was thrown. Errors carry both;
// strings/objects only give us a message.
function normalizeError(error: unknown): { message: string; stack?: string; digest?: string } {
  if (error instanceof Error) {
    const digest = (error as { digest?: unknown }).digest;
    return {
      message: error.message || error.name || "Unknown error",
      stack: error.stack,
      digest: typeof digest === "string" ? digest : undefined,
    };
  }
  if (typeof error === "string") return { message: error };
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

// True when this (message+pathname) was reported within the throttle window.
// Records the send time when it returns false, so the caller can proceed.
function isThrottled(message: string, pathname: string | undefined): boolean {
  const key = `${message}|${pathname ?? ""}`;
  const now = Date.now();
  const previous = lastSent.get(key);
  if (previous !== undefined && now - previous < THROTTLE_MS) return true;
  lastSent.set(key, now);
  return false;
}

function currentPathname(explicit?: string): string | undefined {
  if (explicit) return explicit;
  if (typeof window !== "undefined") return window.location?.pathname;
  return undefined;
}

function currentUserAgent(explicit?: string): string | undefined {
  if (explicit) return explicit;
  if (typeof navigator !== "undefined") return navigator.userAgent;
  return undefined;
}

// Send the payload, preferring sendBeacon (survives page unload, which is when
// many uncaught errors fire) and falling back to fetch with keepalive so the
// request still completes if the document is going away. Both paths are wrapped
// so a transport failure never propagates.
function dispatch(payload: ClientErrorPayload): void {
  const body = JSON.stringify(payload);

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([body], { type: "application/json" });
      const queued = navigator.sendBeacon(ENDPOINT, blob);
      // sendBeacon returns false when the agent refuses to queue (e.g. payload
      // too large); fall through to fetch in that case.
      if (queued) return;
    } catch {
      // fall through to fetch
    }
  }

  if (typeof fetch === "function") {
    try {
      void fetch(ENDPOINT, {
        method: "POST",
        body,
        keepalive: true,
        headers: { "Content-Type": "application/json" },
      }).catch(() => {
        // Swallow: a failed report must not surface to the user.
      });
    } catch {
      // Swallow: never throw from the sink.
    }
  }
}

/**
 * Report a client-side error to the server sink.
 *
 * Safe to call from any client component; it never throws and is throttled so a
 * loop cannot flood the log. `context` is a short label for the operation that
 * failed (e.g. "save-story", "swr"); it is prefixed onto the message so the log
 * line says which operation failed.
 *
 * @param context short operation label, surfaced in the logged message
 * @param error   the thrown value (Error, string, or anything)
 * @param extra   optional bounded scalars to include (no PII/secrets)
 */
export function reportClientError(
  context: string,
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  try {
    const normalized = normalizeError(error);
    const message = truncate(`[${context}] ${normalized.message}`, MAX_MESSAGE);

    const explicitPathname = typeof extra?.pathname === "string" ? extra.pathname : undefined;
    const pathname = currentPathname(explicitPathname);

    if (isThrottled(message, pathname)) return;

    const explicitSource = typeof extra?.source === "string" ? extra.source : undefined;
    const explicitDigest = typeof extra?.digest === "string" ? extra.digest : normalized.digest;
    const explicitStack = typeof extra?.stack === "string" ? extra.stack : normalized.stack;

    const payload: ClientErrorPayload = { message };
    if (explicitStack) payload.stack = truncate(explicitStack, MAX_STACK);
    if (explicitDigest) payload.digest = truncate(explicitDigest, MAX_MESSAGE);
    if (pathname) payload.pathname = truncate(pathname, MAX_MESSAGE);
    if (explicitSource) payload.source = truncate(explicitSource, MAX_MESSAGE);

    const userAgent = currentUserAgent();
    if (userAgent) payload.userAgent = truncate(userAgent, MAX_MESSAGE);

    dispatch(payload);
  } catch {
    // The sink must never throw. If anything above fails, drop the report.
  }
}

// Exposed for tests to assert/reset throttle behaviour deterministically.
export function _resetClientErrorThrottle(): void {
  lastSent.clear();
}
