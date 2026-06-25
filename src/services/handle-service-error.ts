import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { JiraOperationError, ServiceError } from "./errors";

export function handleServiceError(err: unknown): NextResponse {
  if (err instanceof ServiceError) {
    // Deliberate app errors (validation, not-found, conflict): visible but not
    // fatal noise, so warn with the code rather than a 500-style stacktrace.
    logger.warn("service", `${err.code}: ${err.message}`, { statusCode: err.statusCode });
    const body: { error: string; code: string; detail?: string } = {
      error: err.message,
      code: err.code,
    };
    if (err instanceof JiraOperationError) {
      body.detail = err.detail;
    }
    return NextResponse.json(body, { status: err.statusCode });
  }
  // Unknown errors (incl. DB locks/constraint violations) previously vanished here
  // without a trace; log the full error so every route on this path leaves one.
  logger.error("service", "unhandled error", err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
