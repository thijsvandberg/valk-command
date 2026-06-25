import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { withRequestLog } from "@/lib/request-log";
import { errorResponse } from "@/lib/api-response";
import {
  MAX_BODY_BYTES,
  clientErrorSchema,
  shouldThrottle,
} from "@/lib/client-error-sink";

// Client-side error sink (BRDG-398). The browser logger is server-only, so this
// is the single path for a client-side failure (uncaught error, unhandled
// rejection, error-boundary, SWR fetch failure) to reach the production log.
//
// Constraints:
// - Bounded, validated payload: only the known scalar fields, each length-capped
//   (see @/lib/client-error-sink). No tokens, no full request bodies.
// - Server-side throttle/dedup on (message+pathname) so a client loop cannot
//   flood the log even if a misbehaving client ignores its own throttle.
// - Best-effort: a malformed/oversized report is dropped with a 4xx, never 5xx.

// POST /api/client-error - record a client-side error in the server log.
async function recordClientError(request: Request) {
  // Reject obviously oversized bodies before reading them into memory.
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return errorResponse("Payload too large", 413);
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return errorResponse("Invalid body", 400);
  }

  // sendBeacon does not set content-length reliably, so re-check the actual size.
  if (raw.length > MAX_BODY_BYTES) {
    return errorResponse("Payload too large", 413);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  const validation = clientErrorSchema.safeParse(parsedJson);
  if (!validation.success) {
    return errorResponse(validation.error.issues[0]?.message ?? "Invalid request body", 400);
  }

  const { message, stack, digest, pathname, source, userAgent } = validation.data;

  // Always ack so the client never retries; throttling is a server-side concern.
  if (shouldThrottle(message, pathname)) {
    return NextResponse.json({ ok: true, throttled: true });
  }

  // The Clerk user id is forwarded by middleware as x-bridge-user-id; include it
  // when present so a dev can tie the line back to a person. Never trust a
  // client-sent value for anything else.
  const userId = request.headers.get("x-bridge-user-id") ?? undefined;

  // One structured object as the extra arg keeps the [client] line greppable
  // while carrying the stack/digest/path for investigation.
  logger.error("client", message, {
    ...(stack ? { stack } : {}),
    ...(digest ? { digest } : {}),
    ...(pathname ? { pathname } : {}),
    ...(source ? { source } : {}),
    ...(userAgent ? { userAgent } : {}),
    ...(userId ? { userId } : {}),
  });

  return NextResponse.json({ ok: true });
}

// One access-log line per request (BRDG-400); see src/lib/request-log.ts.
export const POST = withRequestLog(recordClientError);
