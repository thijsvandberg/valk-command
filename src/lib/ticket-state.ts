import type { TicketEditState } from "@/types/ticket";

/**
 * Derives the edit state of a ticket by comparing local edits against the
 * latest Jira mirror version. No database flag needed; this is pure computation.
 *
 * States: clean < local_edits < conflict
 * - "local_edits": any local edit exists that is not in Jira yet (the former
 *   draft/saved split collapsed in BRDG-340 — with autosave everywhere the
 *   only question that matters is "does this differ from Jira?")
 * - "conflict": a local edit is based on an outdated Jira version (this now
 *   also covers autosaved drafts on a stale base, which previously hid)
 */
export function computeTicketEditState(
  localEdits: { baseJiraVersion: string | null; isDraft: boolean }[],
  latestVersionHash: string | null,
): TicketEditState {
  if (localEdits.length === 0) return "clean";

  const baseHash = localEdits[0].baseJiraVersion;
  if (baseHash !== latestVersionHash) return "conflict";
  return "local_edits";
}
