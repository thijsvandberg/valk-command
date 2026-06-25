import "server-only";

import type { NextResponse } from "next/server";
import type { ZodSchema } from "zod";

import { errorResponse, validationError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

// Pull the request path out for the log line without leaking the query string
// (which can carry tokens/PII). Falls back to the raw url if parsing fails.
function requestPath(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return request.url;
  }
}

type ParseSuccess<T> = { data: T };
type ParseFailure = { error: NextResponse };

/**
 * Parse and optionally validate a JSON request body.
 * Returns a discriminated union so callers can early-return the error response:
 *
 * ```ts
 * const result = await parseJsonBody(request, mySchema);
 * if ("error" in result) return result.error;
 * const { data } = result;
 * ```
 */
export async function parseJsonBody<T = unknown>(
  request: Request,
  schema?: ZodSchema<T>,
): Promise<ParseSuccess<T> | ParseFailure> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    // Log the bad-body 400 so a malformed request is no longer silently
    // rejected (BRDG-401). Only the route path is logged, never the body
    // (it failed to parse and could carry PII/secrets anyway).
    logger.warn("request-parser", `invalid JSON body on ${requestPath(request)}`);
    return { error: errorResponse("Invalid JSON", 400) };
  }

  if (!schema) {
    return { data: raw as T };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return { error: validationError(result.error) };
  }

  return { data: result.data };
}
