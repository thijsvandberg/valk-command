import "server-only";

import { errorResponse } from "@/lib/api-response";
import { isDraftKey } from "@/lib/draft-key";

/**
 * The test-doc write routes (generate / save / cache / delete) all refuse draft
 * tickets: a DRAFT-xxx key must never reach Jira (BRDG-426/445). One helper so
 * the 409 status and the message template can never drift between them. Returns
 * the error response to short-circuit with, or null when the key is real.
 */
export function guardTestDocDraftKey(key: string, verb: "generate" | "save" | "cache" | "delete") {
  if (isDraftKey(key)) {
    return errorResponse(`Cannot ${verb} test documentation for a draft ticket`, 409);
  }
  return null;
}
