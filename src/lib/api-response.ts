import "server-only";

import { NextResponse } from "next/server";
import type { ZodError } from "zod";

import type { AgentError } from "@/lib/agent-fetch";
import { logger } from "@/lib/logger";

// Standard error shape consumed by the frontend ApiError class: { error: string; code?: string }

export function errorResponse(
  message: string,
  status: number,
  code?: string,
): NextResponse {
  const body: { error: string; code?: string } = { error: message };
  if (code !== undefined) body.code = code;
  return NextResponse.json(body, { status });
}

// Render a zod issue's location as a dotted field path. The path holds only the
// schema's key/index names (e.g. "items.0.title"), never the rejected value, so
// this is safe to log (no PII/secrets). A top-level issue with an empty path is
// labelled "(root)" so the count and the names still line up. Path segments are
// PropertyKey (string | number | symbol); symbols are stringified defensively.
function issuePath(path: ReadonlyArray<PropertyKey>): string {
  return path.length > 0 ? path.map((p) => String(p)).join(".") : "(root)";
}

export function validationError(
  messageOrZodError: string | ZodError,
): NextResponse {
  const message =
    typeof messageOrZodError === "string"
      ? messageOrZodError
      : messageOrZodError.issues[0]?.message ?? "Invalid request body";

  // Log the validation failure so the ~80 validating routes are no longer
  // silently 400'd (BRDG-401). We log only the issue field PATHS and the COUNT,
  // never the rejected values: the values can carry PII/secrets, the paths cannot.
  if (typeof messageOrZodError !== "string") {
    const paths = messageOrZodError.issues.map((i) => issuePath(i.path));
    logger.warn(
      "validation",
      `request body rejected: ${messageOrZodError.issues.length} issue(s) on [${paths.join(", ")}]`,
    );
  }

  return errorResponse(message, 400);
}

export function successResponse<T>(
  data: T,
  status = 200,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json(data, { status, headers });
}

export function agentErrorResponse(
  error: AgentError,
  status: number,
): NextResponse {
  return NextResponse.json(
    { error: error.error, code: error.code },
    { status: status || 502 },
  );
}
