import "server-only";

import { z } from "zod";

// Server-side helpers for the client-error sink (BRDG-398). Lives in lib (not in
// the route) because a Next.js route.ts may export only HTTP handlers; the
// schema, caps, and throttle live here so the route stays handlers-only and the
// throttle is unit-testable in isolation.

// Field caps. The browser caps too, but a client is untrusted, so re-bound here.
export const MAX_MESSAGE = 2_000;
export const MAX_STACK = 8_000;
export const MAX_PATH = 2_000;
export const MAX_SOURCE = 2_000;
export const MAX_USER_AGENT = 2_000;

// Reject a body larger than this outright. sendBeacon/keepalive bodies are tiny;
// anything this large is abuse or a bug. (Middleware also caps at 1 MB, but a
// route-local guard keeps the contract explicit and testable in isolation.)
export const MAX_BODY_BYTES = 16_384;

export const clientErrorSchema = z.object({
  message: z.string().min(1).max(MAX_MESSAGE),
  stack: z.string().max(MAX_STACK).optional(),
  digest: z.string().max(MAX_MESSAGE).optional(),
  pathname: z.string().max(MAX_PATH).optional(),
  source: z.string().max(MAX_SOURCE).optional(),
  userAgent: z.string().max(MAX_USER_AGENT).optional(),
});

export type ClientErrorInput = z.infer<typeof clientErrorSchema>;

// One identical (message+pathname) per window. Mirrors the client throttle so a
// repeated error is bounded at both ends.
const THROTTLE_MS = 30_000;
const lastLogged = new Map<string, number>();

// Bound the dedup map so a flood of *distinct* messages cannot grow it without
// limit. When full we drop the oldest insertion (Map preserves insertion order).
const MAX_DEDUP_KEYS = 1_000;

/**
 * True when this (message+pathname) was logged within the throttle window.
 * Records the time when it returns false so the next identical report inside the
 * window is suppressed.
 */
export function shouldThrottle(message: string, pathname: string | undefined): boolean {
  const key = `${message}|${pathname ?? ""}`;
  const now = Date.now();
  const previous = lastLogged.get(key);
  if (previous !== undefined && now - previous < THROTTLE_MS) return true;

  if (!lastLogged.has(key) && lastLogged.size >= MAX_DEDUP_KEYS) {
    const oldest = lastLogged.keys().next().value;
    if (oldest !== undefined) lastLogged.delete(oldest);
  }
  lastLogged.set(key, now);
  return false;
}

// Exposed for tests to reset throttle state deterministically.
export function _resetClientErrorSinkThrottle(): void {
  lastLogged.clear();
}
