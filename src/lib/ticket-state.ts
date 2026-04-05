import type { TicketEditState } from "@/types/ticket";

/**
 * Derives the edit state of a ticket by comparing local edits against the
 * latest Jira mirror version. No database flag needed; this is pure computation.
 *
 * States: clean < draft < local_edits < conflict
 * - "draft": only unsaved/auto-saved edits exist (isDraft=true)
 * - "local_edits": at least one explicitly saved edit exists (isDraft=false)
 * - "conflict": saved edits exist but based on an outdated Jira version
 */
export function computeTicketEditState(
  localEdits: { baseJiraVersion: string | null; isDraft: boolean }[],
  latestVersionHash: string | null,
): TicketEditState {
  if (localEdits.length === 0) return "clean";

  const hasSaved = localEdits.some((e) => !e.isDraft);
  const baseHash = localEdits[0].baseJiraVersion;

  if (hasSaved && baseHash !== latestVersionHash) return "conflict";
  if (hasSaved) return "local_edits";
  return "draft";
}
