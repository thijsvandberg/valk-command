import "server-only";
import { agentUrl, agentHeaders } from "@/lib/agent-proxy";
import { logger } from "@/lib/logger";

export type AgentErrorCode =
  | "TIMEOUT"
  | "UNREACHABLE"
  | "AUTH"
  | "SERVER_ERROR"
  | "INVALID_RESPONSE";

export interface AgentError {
  error: string;
  code: AgentErrorCode;
}

export type AgentResult<T> =
  | { ok: true; data: T; status: number; retryCount: number }
  | { ok: false; error: AgentError; status: number; retryCount: number };

// Internal type returned by singleFetch before retryCount is attached
type SingleFetchResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: AgentError; status: number };

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_STREAM_TIMEOUT_MS = 60_000;

const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const NON_RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 409, 422]);

// Upstream error bodies can be a full HTML page or a long stack; keep just enough
// to identify the failure without bloating the log or the persisted error.
const MAX_BODY_LEN = 500;

function truncateBody(body: string): string {
  const trimmed = body.trim();
  return trimmed.length > MAX_BODY_LEN ? `${trimmed.slice(0, MAX_BODY_LEN)}...` : trimmed;
}

function classifyHttpError(status: number, body: string): AgentError {
  if (status === 401 || status === 403) {
    return { error: "Authentication with the workspace failed", code: "AUTH" };
  }
  // Prefer the agent's own explanation for ANY non-2xx (BRDG-402): a 4xx used to
  // collapse to a bare "Workspace returned 4xx", discarding the reason (bad skill
  // arg, validation message). Parse a JSON {error}; otherwise fall back to a
  // truncated raw body so the proxy can still surface what went wrong.
  let message = `Workspace returned ${status}`;
  if (body) {
    try {
      const parsed = JSON.parse(body);
      if (typeof parsed.error === "string") message = parsed.error;
    } catch {
      const truncated = truncateBody(body);
      if (truncated) message = `Workspace returned ${status}: ${truncated}`;
    }
  }
  return { error: message, code: "SERVER_ERROR" };
}

function classifyNetworkError(err: unknown): AgentError {
  if (err instanceof DOMException && err.name === "AbortError") {
    return { error: "Request to workspace timed out", code: "TIMEOUT" };
  }
  if (err instanceof DOMException && err.name === "TimeoutError") {
    return { error: "Request to workspace timed out", code: "TIMEOUT" };
  }
  const msg = err instanceof Error ? err.message : "Unknown error";
  if (msg.includes("abort") || msg.includes("timeout")) {
    return { error: "Request to workspace timed out", code: "TIMEOUT" };
  }
  return { error: "Cannot reach workspace", code: "UNREACHABLE" };
}

function isRetryable(result: SingleFetchResult<unknown>): boolean {
  if (result.ok) return false;
  const { code } = result.error;
  if (code === "TIMEOUT" || code === "UNREACHABLE") return true;
  return RETRYABLE_STATUSES.has(result.status);
}

async function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffDelay(attempt: number): number {
  const base = 1000 * Math.pow(3, attempt);
  return Math.round(base * (0.5 + Math.random() * 0.5));
}

export interface AgentFetchOptions {
  method?: string;
  body?: unknown;
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
}

/**
 * Typed fetch wrapper for agent communication.
 * Returns a discriminated union result, never throws for expected failures.
 * Supports timeout via AbortSignal and retry with exponential backoff.
 */
export async function agentFetch<T = unknown>(
  path: string,
  options: AgentFetchOptions = {},
): Promise<AgentResult<T>> {
  const {
    method = "GET",
    body,
    timeout = DEFAULT_TIMEOUT_MS,
    retries = 0,
    headers: extraHeaders,
  } = options;

  let lastResult: AgentResult<T> | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const delayMs = backoffDelay(attempt - 1);
      logger.warn("agent-fetch", "retry", { event: "agent_fetch_retry", path, attempt, maxRetries: retries, errorCode: lastResult && !lastResult.ok ? lastResult.error.code : null, delayMs });
      await delay(delayMs);
    }

    const raw = await singleFetch<T>(path, method, body, timeout, extraHeaders);

    if (raw.ok) return { ...raw, retryCount: attempt };

    lastResult = { ...raw, retryCount: attempt };

    if (!isRetryable(raw) || NON_RETRYABLE_STATUSES.has(raw.status)) {
      return lastResult;
    }
  }

  return lastResult!;
}

async function singleFetch<T>(
  path: string,
  method: string,
  body: unknown,
  timeout: number,
  extraHeaders?: Record<string, string>,
): Promise<SingleFetchResult<T>> {
  try {
    const baseHeaders = agentHeaders();
    const mergedHeaders = extraHeaders ? { ...baseHeaders, ...extraHeaders } : baseHeaders;

    const fetchOptions: RequestInit = {
      method,
      headers: mergedHeaders,
      signal: AbortSignal.timeout(timeout),
    };
    if (body !== undefined) {
      fetchOptions.body = JSON.stringify(body);
    }

    const res = await fetch(agentUrl(path), fetchOptions);

    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: classifyHttpError(res.status, ""), status: res.status };
    }

    // Read the body for ANY non-ok status (not just >=500) so the agent's
    // explanation survives classification. classifyHttpError prefers a JSON
    // {error} and falls back to a truncated raw body (BRDG-402).
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: classifyHttpError(res.status, text), status: res.status };
    }

    let data: T;
    try {
      data = await res.json() as T;
    } catch {
      return {
        ok: false,
        error: { error: "Workspace returned non-JSON response", code: "INVALID_RESPONSE" },
        status: res.status,
      };
    }

    return { ok: true, data, status: res.status };
  } catch (err) {
    const error = classifyNetworkError(err);
    // Log the transport cause BEFORE returning the classified error: the
    // discriminated-union result keeps only a generic code/message, so without
    // this the underlying reason (DNS failure, connection refused, the exact
    // abort) never reaches the log (BRDG-402). Shape of the return is unchanged.
    logger.warn("agent-fetch", "terminal failure", {
      path,
      code: error.code,
      cause: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error, status: 0 };
  }
}

/**
 * Fetch variant for SSE streams. Returns the raw Response on success
 * so the caller can pipe the body to the client.
 */
export async function agentFetchStream(
  path: string,
  options: Omit<AgentFetchOptions, "retries"> = {},
): Promise<AgentResult<Response>> {
  const { timeout = DEFAULT_STREAM_TIMEOUT_MS, headers: extraHeaders } = options;

  try {
    const baseHeaders = agentHeaders();
    delete baseHeaders["Content-Type"];
    const mergedHeaders = extraHeaders ? { ...baseHeaders, ...extraHeaders } : baseHeaders;

    const res = await fetch(agentUrl(path), {
      headers: mergedHeaders,
      signal: AbortSignal.timeout(timeout),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: classifyHttpError(res.status, text), status: res.status, retryCount: 0 };
      }
      return {
        ok: false,
        error: classifyHttpError(res.status, text),
        status: res.status,
        retryCount: 0,
      };
    }

    return { ok: true, data: res, status: res.status, retryCount: 0 };
  } catch (err) {
    const error = classifyNetworkError(err);
    logger.warn("agent-fetch", "terminal failure", {
      path,
      code: error.code,
      cause: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error, status: 0, retryCount: 0 };
  }
}
