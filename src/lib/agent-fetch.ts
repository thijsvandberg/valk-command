import "server-only";
import { agentUrl, agentHeaders } from "@/lib/agent-proxy";

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
  | { ok: true; data: T; status: number }
  | { ok: false; error: AgentError; status: number };

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_STREAM_TIMEOUT_MS = 60_000;

const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const NON_RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 409, 422]);

function classifyHttpError(status: number, body: string): AgentError {
  if (status === 401 || status === 403) {
    return { error: "Authentication with the workspace failed", code: "AUTH" };
  }
  if (status >= 500) {
    let message = `Workspace returned ${status}`;
    try {
      const parsed = JSON.parse(body);
      if (typeof parsed.error === "string") message = parsed.error;
    } catch { /* use default */ }
    return { error: message, code: "SERVER_ERROR" };
  }
  return { error: `Workspace returned ${status}`, code: "SERVER_ERROR" };
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

function isRetryable(result: AgentResult<unknown>): boolean {
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
      console.warn(JSON.stringify({
        event: "agent_fetch_retry",
        path,
        attempt,
        maxRetries: retries,
        errorCode: lastResult && !lastResult.ok ? lastResult.error.code : null,
        delayMs,
      }));
      await delay(delayMs);
    }

    const result = await singleFetch<T>(path, method, body, timeout, extraHeaders);

    if (result.ok) return result;

    lastResult = result;

    if (!isRetryable(result) || NON_RETRYABLE_STATUSES.has(result.status)) {
      return result;
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
): Promise<AgentResult<T>> {
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

    if (res.status >= 500) {
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

    if (!res.ok) {
      const errMsg = typeof (data as Record<string, unknown>)?.error === "string"
        ? (data as Record<string, unknown>).error as string
        : `Workspace returned ${res.status}`;
      return {
        ok: false,
        error: { error: errMsg, code: "SERVER_ERROR" },
        status: res.status,
      };
    }

    return { ok: true, data, status: res.status };
  } catch (err) {
    return { ok: false, error: classifyNetworkError(err), status: 0 };
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
        return { ok: false, error: classifyHttpError(res.status, text), status: res.status };
      }
      return {
        ok: false,
        error: classifyHttpError(res.status, text),
        status: res.status,
      };
    }

    return { ok: true, data: res, status: res.status };
  } catch (err) {
    return { ok: false, error: classifyNetworkError(err), status: 0 };
  }
}
