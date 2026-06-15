# BRDG-350: Stop persisting no-op round-trip drafts as local edits

**Status:** Not Started
**Priority:** Low
**Type:** Bugfix

## Description

As a PO, I want the app to never store a "local edit" for a description that is only different from the Jira version by serializer round-trip artefacts, so that the database does not accumulate no-op draft rows that masquerade as pending changes.

This is the deferred second layer of BRDG-348. BRDG-348 fixed the **detection/display** side: `normalizeMarkdownForCompare` now folds inline-mark ordering and inert-punctuation escapes, so a round-trip-only difference no longer shows a phantom "Local edits" badge or diff noise. However, the app can still **persist** such a no-op draft to the DB (via the autosave debounce and the unmount `sendBeacon` flush in `EditableDescription`). The comparison fix hides this from the UI, but the row still exists and is wasteful/misleading at the data layer.

## Why this was split out

- It is explicitly optional in BRDG-348 ("Optional follow-up layer - can be deferred / split out").
- It touches `EditableDescription.tsx` (autosave + unmount flush), which was under active parallel modification when BRDG-348 was implemented; landing it then risked clashing with that work.

## Expected behaviour

- When the current description value is cosmetically equal to the Jira baseline (`markdownEqualIgnoringSpacing` is true), no draft local edit is persisted - not by the debounced autosave, and not by the unmount `sendBeacon` flush.
- If a no-op draft already exists, reverting to a cosmetically-equal value cleans it up (the existing `flushPending` already does this for the in-component path; extend the same guard to the autosave and beacon paths).
- A genuine edit still persists normally.

## Proposed approach

- In `EditableDescription.tsx`, gate the persist paths on `!markdownEqualIgnoringSpacing(value, initialDescription)`:
  - `autoSaveDraft` already only runs from `handleChange` when the value differs; confirm the guard uses the normalized comparison rather than a raw string compare.
  - The unmount `sendBeacon` flush (and the `beforeunload` handler) currently fire whenever `autoSaveTimerRef.current` is set; add the cosmetic-equality guard so a pending timer for a no-op value does not beacon a phantom draft.
- Keep this purely about *persistence*; do not change what is pushed to Jira.

## Out of scope

- The comparison/display fix - done in BRDG-348.
- The serializer round-trip itself (BRDG-267 / BRDG-268 / BRDG-280).

## Technical notes

- `src/components/ticket-detail/EditableDescription.tsx`: `autoSaveDraft` (~line 162), unmount flush effect (~line 177), `beforeunload` handler (~line 191), `flushPending` (~line 219). All persist paths should share one cosmetic-equality guard.
- Reuse `markdownEqualIgnoringSpacing` from `src/lib/normalize-markdown.ts` (extended in BRDG-348).

## Related

- BRDG-348 (the detection/display fix; this is its deferred persistence layer).

## Checklist

- [ ] Autosave does not persist a draft when the value is cosmetically equal to the Jira baseline
- [ ] Unmount `sendBeacon` flush and `beforeunload` handler skip a no-op value
- [ ] A genuine edit still persists; reverting to a cosmetically-equal value cleans up any existing no-op draft
- [ ] Tests cover the no-op-skip and genuine-edit-persists paths
- [ ] All tests pass, build succeeds
