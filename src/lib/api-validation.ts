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
 * Validate a path param that must be a bare numeric id (e.g. a Confluence pageId).
 * Stricter than validatePathParam: rejects anything carrying `? # / ..` so a route
 * param cannot inject/override upstream query params once interpolated into an
 * external API path. Returns a 400 NextResponse if invalid, or null if valid.
 */
export function validateNumericId(value: string): NextResponse | null {
  if (!value || value.length > 32 || !/^\d+$/.test(value)) {
    return NextResponse.json(
      { error: "Invalid parameter" },
      { status: 400 },
    );
  }
  return null;
}

/**
 * Validate a path param that identifies an agent task/session id interpolated into
 * the upstream agent path. Allows only URL-safe id characters (alphanumerics, `_`,
 * `-`) so `/ ? ..` cannot alter the upstream path shape. Returns a 400 NextResponse
 * if invalid, or null if valid.
 */
export function validateAgentTaskId(value: string): NextResponse | null {
  if (!value || value.length > 128 || !/^[A-Za-z0-9_-]+$/.test(value)) {
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
