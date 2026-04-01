import type { TicketEditState } from "@/types/ticket";

/**
 * Derives the edit state of a ticket by comparing local edits against the
 * latest Jira mirror version. No database flag needed; this is pure computation.
 */
export function computeTicketEditState(
  localEdits: { baseJiraVersion: string | null }[],
  latestVersionHash: string | null,
): TicketEditState {
  if (localEdits.length === 0) return "clean";

  const baseHash = localEdits[0].baseJiraVersion;
  if (baseHash === latestVersionHash) return "local_edits";

  return "conflict";
}
