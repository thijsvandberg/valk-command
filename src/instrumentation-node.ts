import type { Instrumentation } from "next";
import { logger } from "@/lib/logger";

// This module is loaded only from instrumentation.ts behind a NEXT_RUNTIME ===
// "nodejs" gate, so it never enters the Edge bundle. That is what lets it safely
// reach for Node-only APIs (process.on) and the server logger (which transitively
// pulls in node:async_hooks via the request context) without tripping the
// "not supported in the Edge Runtime" warnings.

// register() can be invoked more than once (Next may re-call it on certain
// reloads). A module-level guard keeps us from stacking duplicate process
// listeners, which would otherwise multiply every logged crash.
let processHandlersInstalled = false;

/**
 * Errors that mean "the client went away mid-response" rather than "the server
 * is broken". They are routine for an SSE stream or a navigation that cancels an
 * in-flight fetch, so we log them at warn with a short message and no stacktrace
 * to keep the real crashes visible in the prod log.
 */
function isExpectedClientAbort(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  if (code === "ECONNRESET" || code === "ERR_STREAM_PREMATURE_CLOSE") return true;
  const message = (err as { message?: unknown }).message;
  if (typeof message === "string") {
    const m = message.toLowerCase();
    if (
      m.includes("aborted") ||
      m.includes("request aborted") ||
      m.includes("failed to pipe response") ||
      m.includes("the stream has been aborted")
    ) {
      return true;
    }
  }
  const name = (err as { name?: unknown }).name;
  if (name === "AbortError" || name === "ResponseAborted") return true;
  return false;
}

function shortAbortMessage(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") return `client abort (${code})`;
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return `client abort (${message})`;
  }
  return "client abort";
}

export async function register() {
  if (processHandlersInstalled) return;
  processHandlersInstalled = true;

  process.on("uncaughtException", (err) => {
    if (isExpectedClientAbort(err)) {
      logger.warn("uncaught-exception", shortAbortMessage(err));
      return;
    }
    // Deliberately no process.exit: start-prod.sh has no auto-restart and this is a
    // single-user local prod, so staying up beats taking the whole server down.
    logger.error("uncaught-exception", "unhandled exception", err);
  });

  process.on("unhandledRejection", (reason) => {
    if (isExpectedClientAbort(reason)) {
      logger.warn("unhandled-rejection", shortAbortMessage(reason));
      return;
    }
    logger.error("unhandled-rejection", "unhandled promise rejection", reason);
  });

  // Imported dynamically (not at module top) and behind the crash handlers above
  // so a DB-open failure is logged loudly (by getDb's own try/catch) without
  // preventing the net from being set up. Eager-init surfaces "db ready"/"open
  // failed" at boot rather than on the first request.
  const { initDb } = await import("@/db");
  const { logConfigStatus } = await import("@/lib/env");

  try {
    initDb();
  } catch {
    // initDb -> getDb already logged the error with DB_PATH before rethrowing;
    // swallow here so boot continues and the failure is not double-logged.
  }

  // One warn line naming any integration whose credential is empty, so a
  // degraded boot is explicit. Boot-time only (Node runtime), so it does not
  // spam during tests or the build.
  logConfigStatus();
}

/**
 * Next.js stable hook: fires for every server error across all routes, so one
 * place gives method + path context without touching individual handlers.
 * Must never throw, or it would mask the original error.
 */
export const onRequestError: Instrumentation.onRequestError = (error, request) => {
  try {
    const method = request?.method ?? "UNKNOWN";
    const path = request?.path ?? "unknown";

    const digest =
      typeof error === "object" && error !== null && "digest" in error
        ? (error as { digest?: unknown }).digest
        : undefined;

    const userHeader = request?.headers?.["x-bridge-user-id"];
    const userId = Array.isArray(userHeader) ? userHeader[0] : userHeader;

    // The middleware forwards x-request-id on the request; surfacing it here
    // ties a 500 to its access-log line and to any catch-block error from the
    // same request.
    const reqHeader = request?.headers?.["x-request-id"];
    const requestId = Array.isArray(reqHeader) ? reqHeader[0] : reqHeader;

    const context: Record<string, unknown> = {};
    if (digest !== undefined) context.digest = digest;
    if (userId) context.userId = userId;
    if (requestId) context.reqId = requestId;

    if (Object.keys(context).length > 0) {
      logger.error("request-error", `${method} ${path}`, error, context);
    } else {
      logger.error("request-error", `${method} ${path}`, error);
    }
  } catch {
    // A logging failure must not propagate out of the hook.
  }
};
