/**
 * Shared HTTP client for outbound integration requests.
 *
 * Centralizes the resilience policy that was previously duplicated (and divergent)
 * across the integration clients: a bounded timeout, exponential backoff with jitter,
 * `Retry-After` honoring, and a consistent error classification. Returns a typed result
 * union and never throws for expected failures (modelled on `agent-fetch`), so each
 * client can adapt the result back to its own public surface.
 */

export type HttpErrorCode =
  | "TIMEOUT"
  | "UNREACHABLE"
  | "AUTH"
  | "SERVER_ERROR"
  | "CLIENT_ERROR"
  | "INVALID_RESPONSE";

export interface HttpError {
  message: string;
  code: HttpErrorCode;
  // Raw response body for HTTP-error results, so adapters can reconstruct legacy
  // error messages (e.g. Confluence's `Confluence API <status>: <body>`).
  body?: string;
}

export type HttpResult<T> =
  | { ok: true; data: T; status: number; retryCount: number }
  | { ok: false; error: HttpError; status: number; retryCount: number };

type SingleResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: HttpError; status: number; retryAfterMs?: number };

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_STATUSES = new Set([429, 503]);
const INITIAL_BACKOFF_MS = 500;
const MAX_RETRY_DELAY_MS = 3_000;

export interface HttpClientOptions<T> {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  // Extra RequestInit passthrough (e.g. Next.js `next: { revalidate: 0 }`).
  init?: RequestInit;
  timeout?: number;
  maxRetries?: number;
  retryStatuses?: Set<number>;
  // Fires once per network attempt — used to keep `trackOutboundCall` accounting accurate.
  onRequest?: () => void;
  // Custom response parser; defaults to `res.json()`.
  parse?: (res: Response) => Promise<T>;
  // Injectable for deterministic tests.
  sleep?: (ms: number) => Promise<void>;
  jitter?: () => number;
}

function classifyHttpError(status: number, body: string): HttpError {
  if (status === 401 || status === 403) {
    return { message: `Authentication failed (${status})`, code: "AUTH", body };
  }
  if (status >= 500) {
    return { message: `Server returned ${status}`, code: "SERVER_ERROR", body };
  }
  return { message: `Request failed with ${status}`, code: "CLIENT_ERROR", body };
}

function classifyNetworkError(err: unknown): HttpError {
  if (err instanceof DOMException && (err.name === "AbortError" || err.name === "TimeoutError")) {
    return { message: "Request timed out", code: "TIMEOUT" };
  }
  const msg = err instanceof Error ? err.message : "Unknown error";
  if (msg.includes("abort") || msg.includes("timeout")) {
    return { message: "Request timed out", code: "TIMEOUT" };
  }
  return { message: "Cannot reach host", code: "UNREACHABLE" };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Parses a `Retry-After` header (delta-seconds form). Returns null when absent/invalid.
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = parseInt(header, 10);
  return isNaN(seconds) ? null : seconds * 1000;
}

async function singleFetch<T>(
  url: string,
  opts: HttpClientOptions<T>,
): Promise<SingleResult<T>> {
  const { method = "GET", body, headers, init, timeout = DEFAULT_TIMEOUT_MS, parse } = opts;
  opts.onRequest?.();
  try {
    const fetchOptions: RequestInit = {
      ...init,
      method,
      headers,
      signal: AbortSignal.timeout(timeout),
    };
    if (body !== undefined) {
      fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    const res = await fetch(url, fetchOptions);

    if (!res.ok) {
      const text = typeof res.text === "function" ? await res.text().catch(() => "") : "";
      return {
        ok: false,
        error: classifyHttpError(res.status, text),
        status: res.status,
        retryAfterMs: parseRetryAfter(res.headers?.get?.("Retry-After") ?? null) ?? undefined,
      };
    }

    try {
      const data = parse ? await parse(res) : ((await res.json()) as T);
      return { ok: true, data, status: res.status };
    } catch {
      return {
        ok: false,
        error: { message: "Response was not valid JSON", code: "INVALID_RESPONSE" },
        status: res.status,
      };
    }
  } catch (err) {
    // Network error / timeout: status 0 signals "the request never produced a response".
    return { ok: false, error: classifyNetworkError(err), status: 0 };
  }
}

function isRetryable(result: SingleResult<unknown>, retryStatuses: Set<number>): boolean {
  if (result.ok) return false;
  const { code } = result.error;
  if (code === "TIMEOUT" || code === "UNREACHABLE") return true;
  return retryStatuses.has(result.status);
}

/**
 * Performs an outbound request with timeout, retry-with-backoff (honoring `Retry-After`),
 * and consistent error classification. Never throws for expected failures.
 */
export async function httpFetch<T = unknown>(
  url: string,
  opts: HttpClientOptions<T> = {},
): Promise<HttpResult<T>> {
  const {
    maxRetries = 0,
    retryStatuses = DEFAULT_RETRY_STATUSES,
    sleep = defaultSleep,
    jitter = Math.random,
  } = opts;

  let last: SingleResult<T> | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await singleFetch<T>(url, opts);
    if (result.ok) return { ...result, retryCount: attempt };

    last = result;

    if (attempt < maxRetries && isRetryable(result, retryStatuses)) {
      const backoff = INITIAL_BACKOFF_MS * 2 ** attempt;
      // Honor an explicit Retry-After when present; otherwise jittered exponential backoff.
      const base = result.retryAfterMs ?? Math.round(backoff * (0.5 + jitter() * 0.5));
      await sleep(Math.min(base, MAX_RETRY_DELAY_MS));
      continue;
    }

    return { ok: false, error: result.error, status: result.status, retryCount: attempt };
  }

  // Unreachable in practice (loop always returns), but satisfies the type checker.
  return { ok: false, error: last!.error, status: last!.status, retryCount: maxRetries };
}
