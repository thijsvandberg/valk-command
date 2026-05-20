import "server-only";

import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";

/**
 * Validate a dynamic route path parameter.
 * Returns a 400 NextResponse if invalid, or null if valid.
 */
export function validatePathParam(
  value: string,
  maxLength = 255,
): NextResponse | null {
  if (!value || value.length > maxLength || value.includes("\0")) {
    return NextResponse.json(
      { error: "Invalid parameter" },
      { status: 400 },
    );
  }
  return null;
}

/**
 * Escape SQL LIKE wildcard characters (%, _) in user-provided values.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Safely parse JSON from database-stored strings.
 * Returns fallback on parse failure and logs a warning.
 */
export function safeJsonParse<T>(
  raw: string | null | undefined,
  fallback: T,
  logTag = "safeJsonParse",
): T {
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    logger.warn(logTag, "Malformed JSON in stored data", raw.slice(0, 200));
    return fallback;
  }
}
