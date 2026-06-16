# BRDG-350: Stop persisting no-op round-trip drafts as local edits

**Status:** Done
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

## Implementation Plan

Verified against the code: the autosave-START guard in `handleChange` (only calls `autoSaveDraft` when `!markdownEqualIgnoringSpacing`) already prevents a cosmetic-equal value from ever starting the debounce timer, and `flushPending` (blur/Escape/Cmd-S/push) already DELETEs an existing no-op draft on revert. The remaining real gaps are the two `sendBeacon` paths plus an in-place stale-timer-after-revert case.

1. **Baseline ref** (`EditableDescription.tsx`): add `initialDescriptionRef` mirrored via effect, so the empty-dep unmount cleanup compares against the current Jira baseline rather than the first-render closure.
2. **Guard unmount `sendBeacon` flush**: still `clearTimeout` a pending timer, but only beacon when `!markdownEqualIgnoringSpacing(valueRef.current, initialDescriptionRef.current)`.
3. **Guard `beforeunload` flush**: same cosmetic guard before beaconing; add `initialDescription` to deps.
4. **Stale-timer-after-revert** (`handleChange`): when the new value is cosmetically equal, clear any pending `autoSaveTimerRef` and reset `saveState` to idle, so a real-edit-then-revert while staying mounted does not autosave the pre-revert value. DELETE-on-revert stays in `flushPending` to avoid duplicating cleanup.
5. **Tests** (`EditableDescription.test.tsx`): (a) no-op value does not beacon on unmount; (b) genuine edit still beacons on unmount; (c) revert-to-cosmetic-equal does not beacon/persist the stale value; (d) revert cleanup via `flushPending` still issues the `draftsOnly` DELETE.

No DB/API changes; the `DELETE ?draftsOnly=true` and `PUT` endpoints already exist.

## Checklist

- [x] Autosave does not persist a draft when the value is cosmetically equal to the Jira baseline - already guarded by the autosave-START check in `handleChange` (only calls `autoSaveDraft` when `!markdownEqualIgnoringSpacing`); hardened so reverting to a cosmetic-equal value also cancels a still-pending timer
- [x] Unmount `sendBeacon` flush and `beforeunload` handler skip a no-op value - both now gated on `!markdownEqualIgnoringSpacing` (unmount compares via `initialDescriptionRef` to avoid the empty-dep stale closure)
- [x] A genuine edit still persists; reverting to a cosmetically-equal value cleans up any existing no-op draft - genuine edits still beacon/persist; `flushPending` DELETEs the draft (`?draftsOnly=true`) on revert+close
- [x] Tests cover the no-op-skip and genuine-edit-persists paths - 4 tests added in `EditableDescription.test.tsx` (no-op unmount skip, genuine edit beacons, revert skip, revert cleanup DELETE); 43/43 pass
- [x] All tests pass, build succeeds - `npm run build` PASSES; lint clean; `EditableDescription.test.tsx` 43/43 green. Remaining full-suite reds are unrelated and pre-existing/WIP, not from this change: `api/jira/sprints/route.test.ts` (BRDG-351 WIP in the working tree), `push-to-jira/route.test.ts` + `ChatLayout.test.tsx` (pre-existing on dev), and a `SprintBoardDragDrop.test.tsx` typecheck drift (`backlogTargetName`)
