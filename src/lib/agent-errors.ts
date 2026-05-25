/**
 * Maps agent error codes to user-friendly messages.
 * This file is safe for both client and server imports.
 */

const ERROR_MESSAGES: Record<string, string> = {
  TIMEOUT: "The workspace took too long to respond",
  UNREACHABLE: "Cannot reach the workspace. Is it running?",
  AUTH: "Authentication with the workspace failed",
  SERVER_ERROR: "The workspace encountered an error",
  INVALID_RESPONSE: "Received an unexpected response from the workspace",
};

/**
 * Returns a user-friendly message from an API error response body.
 * Falls back to the raw error string or a default message.
 */
export function friendlyAgentError(
  body: { error?: string; code?: string } | null | undefined,
  fallback = "Something went wrong",
): string {
  if (!body) return fallback;
  if (body.code && ERROR_MESSAGES[body.code]) {
    return ERROR_MESSAGES[body.code];
  }
  if (body.error) return body.error;
  return fallback;
}

const RETRYABLE_PATTERN = /usage.?policy|content.?policy|violat/i;

/**
 * Returns true if a stream error message indicates an API refusal
 * that may succeed on retry (non-deterministic safety classifier).
 */
export function isRetryableStreamError(message: string): boolean {
  return RETRYABLE_PATTERN.test(message);
}

/**
 * Maps raw SSE error messages to user-friendly text.
 * Used for stream-level errors (as opposed to HTTP-level errors handled by friendlyAgentError).
 */
export function friendlyStreamError(raw: string): string {
  if (RETRYABLE_PATTERN.test(raw)) {
    return "Could not generate suggestions. Try again or add subtasks manually.";
  }
  return raw;
}
