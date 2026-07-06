// BRDG-483: the "Accepted" marker on a chat draft must survive a hard refresh.
// Accepting a draft copies its content verbatim into the session's localDraft
// (original slot) or targetLocalDraft (target slot); no accepted-id is persisted.
// So we derive the accepted set by matching each draft's content against the
// saved slot value, which is stable across reloads without a DB migration.

export interface AcceptableDraft {
  id: string;
  content: string;
  storySlot: "original" | "target";
}

/**
 * Returns the set of draft ids whose content matches the session's saved draft
 * for their slot. A draft with empty content, or a slot with no saved value, is
 * never considered accepted. Two drafts with identical content both match; that
 * ambiguity is acceptable here (both render as accepted).
 */
export function computeAcceptedDraftIds(
  drafts: ReadonlyArray<AcceptableDraft>,
  localDraft: string | null | undefined,
  targetLocalDraft: string | null | undefined,
): Set<string> {
  const accepted = new Set<string>();
  const original = (localDraft ?? "").trim();
  const target = (targetLocalDraft ?? "").trim();

  for (const draft of drafts) {
    const content = (draft.content ?? "").trim();
    if (!content) continue;
    const saved = draft.storySlot === "target" ? target : original;
    if (saved && content === saved) accepted.add(draft.id);
  }

  return accepted;
}
