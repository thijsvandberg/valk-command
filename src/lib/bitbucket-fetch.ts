/**
 * Shared Bitbucket Cloud config, auth, and fetch variants. Previously `bitbucket-client.ts`
 * and `pipeline-sync.ts` each carried their own divergent copies (BRDG-379). This is the
 * single source, built on the shared `httpClient` so every request has a bounded timeout —
 * a hung upstream can no longer wedge a background sync tick.
 */
import { env } from "@/lib/env";
import { trackOutboundCall } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";
import { httpFetch } from "@/lib/http-client";

export function getBitbucketConfig() {
  const repoSlugs = env.BITBUCKET_REPO_SLUG.split(",").map((s) => s.trim()).filter(Boolean);
  return {
    workspace: env.BITBUCKET_WORKSPACE,
    repoSlugs,
    email: env.BITBUCKET_EMAIL || env.JIRA_EMAIL,
    token: env.BITBUCKET_APP_PASSWORD || env.BITBUCKET_API_TOKEN,
  };
}

export function isBitbucketConfigured(): boolean {
  const cfg = getBitbucketConfig();
  return Boolean(cfg.workspace && cfg.repoSlugs.length > 0 && cfg.email && cfg.token);
}

export function bbAuthHeaders(): Record<string, string> {
  const cfg = getBitbucketConfig();
  const auth = Buffer.from(`${cfg.email}:${cfg.token}`).toString("base64");
  return { Authorization: `Basic ${auth}`, Accept: "application/json" };
}

function repoUrl(repoSlug: string, path: string): string {
  const cfg = getBitbucketConfig();
  return `https://api.bitbucket.org/2.0/repositories/${cfg.workspace}/${repoSlug}${path}`;
}

// Keep enough of Bitbucket's error body to identify the cause (e.g. its JSON
// {"error":{"message":...}}) without bloating the log. The body never contains
// our credentials — auth rides in the Authorization header, which is never logged.
const MAX_BB_BODY_LEN = 300;

function truncateBbBody(body: string | undefined): string {
  if (!body) return "";
  const trimmed = body.trim();
  return trimmed.length > MAX_BB_BODY_LEN ? `${trimmed.slice(0, MAX_BB_BODY_LEN)}...` : trimmed;
}

/**
 * Fetch a Bitbucket resource. Returns the parsed body, or `null` on an HTTP error
 * (logged unless it is a silenced 404). A network error or timeout is re-thrown so
 * callers' existing try/catch + retry logic still fires (e.g. classifyRunDeployment's
 * in-cycle retry); previously these clients had no timeout and could hang indefinitely.
 */
export async function bbFetch<T>(repoSlug: string, path: string, silent404 = false): Promise<T | null> {
  const result = await httpFetch<T>(repoUrl(repoSlug, path), {
    init: { redirect: "follow" },
    headers: bbAuthHeaders(),
    onRequest: () => trackOutboundCall("bitbucket"),
  });
  if (result.ok) return result.data;
  if (result.status === 0) throw new Error(result.error.message);
  if (!(silent404 && result.status === 404)) {
    // Raised from info to warn (BRDG-402): a non-2xx here means a Bitbucket call
    // failed silently in a background sync. A 401/403 (code AUTH) is the tell for
    // an expired app-password and must stand out from a transient 5xx/429. The
    // body carries Bitbucket's own explanation; credentials live only in the
    // (never-logged) Authorization header.
    logger.warn("bitbucket", `bbFetch ${result.status} for ${path} on ${repoSlug}`, {
      code: result.error.code,
      body: truncateBbBody(result.error.body),
    });
  }
  return null;
}

/** Absolute-URL variant for paginated `next` links. Same error semantics as bbFetch. */
export async function bbFetchUrl<T>(url: string): Promise<T | null> {
  const result = await httpFetch<T>(url, {
    init: { redirect: "follow" },
    headers: bbAuthHeaders(),
    onRequest: () => trackOutboundCall("bitbucket"),
  });
  if (result.ok) return result.data;
  if (result.status === 0) throw new Error(result.error.message);
  // Paginated follow-up calls were silent before (BRDG-402); a non-2xx here
  // truncated attribution with no trace. The full URL is not logged (it can carry
  // query secrets) — http-client already logged the host.
  logger.warn("bitbucket", `bbFetchUrl ${result.status}`, {
    code: result.error.code,
    body: truncateBbBody(result.error.body),
  });
  return null;
}

/**
 * Status-aware fetch used where a 404 must be distinguished from a transient error. The range
 * walk anchors on a commit hash, but staging branches are force-pushed (GitOps), so historical
 * deploy commits get orphaned and 404 permanently; a network blip or 429/5xx is transient.
 * status === 0 means the request threw (or timed out).
 */
export async function bbFetchStatus<T>(repoSlug: string, path: string): Promise<{ status: number; data: T | null }> {
  const result = await httpFetch<T>(repoUrl(repoSlug, path), {
    init: { redirect: "follow" },
    headers: bbAuthHeaders(),
    onRequest: () => trackOutboundCall("bitbucket"),
  });
  if (result.ok) return { status: result.status, data: result.data };
  // Warn on non-2xx (BRDG-402). The caller keeps acting on the returned status;
  // this only adds a trace. Note a 404 is often expected here (force-pushed
  // commits 404 permanently), but the transient codes (0/401/403/429/5xx,
  // isTransientStatus) are the actionable ones a reader is hunting for.
  logger.warn("bitbucket", `bbFetchStatus ${result.status} for ${path} on ${repoSlug}`, {
    code: result.error.code,
    transient: isTransientStatus(result.status),
    body: truncateBbBody(result.error.body),
  });
  return { status: result.status, data: null };
}

/** A non-ok status worth retrying later (network throw, auth blip, rate limit, server error). */
export function isTransientStatus(status: number): boolean {
  return status === 0 || status === 401 || status === 403 || status === 429 || status >= 500;
}
