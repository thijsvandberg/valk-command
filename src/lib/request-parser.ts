import "server-only";

import type { NextResponse } from "next/server";
import type { ZodSchema } from "zod";

import { errorResponse, validationError } from "@/lib/api-response";

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
