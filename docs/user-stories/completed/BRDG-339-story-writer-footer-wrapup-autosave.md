# BRDG-339: Story Writer Footer Rework — Autosave + Wrap Up Flow

**Status:** Ready to implement (design decided via dev exploration)
**Priority:** TBD
**Type:** Story
**Design reference:** `/dev/exploration/story-writer-footer` (Option E, final iteration)

## Problem

The Story Writer footer mixes three concerns (save, push, clear session) behind one primary button that silently changes identity based on invisible state:

- `isDraftDirty` → **Push & Close** (save + push + clear session + set readiness + navigate, five actions in one click)
- `hasLocalSave` → **Push to Jira** (push + set readiness, stays open)
- `hasPushed` → **Close** (just navigates)

On top of that, `ready_to_refine` is set in two inconsistent ways: silently on **every** push (`handlePush`, `handlePushAndClose`), and via an explicit confirm dialog after a manual session delete (`showRefinePrompt`). Pushing to Jira is publishing — something you may do several times while iterating — and should not imply "done, ready for refinement".

## Goal

As the PO, I want a footer with as little chrome as possible and no hidden coupling:

- Saving is automatic (no Save button).
- One visible primary action: **Wrap up** — the terminal move that always pushes and closes the editor.
- Readiness changes only when I explicitly choose them inside Wrap up, never as a side effect of a plain push.

## Design (decided)

The interactive prototype at `/dev/exploration/story-writer-footer` (Option E) is the spec. Footer right side becomes:

```
[ Saving… / ✓ Saved ]   [ ⚑ Wrap up ]   [ … ]
```

### Autosave (replaces the Save draft button)

- Draft title + description autosave via the existing `saveDraft()` path, debounced (~2s after the last keystroke).
- Quiet text indicator instead of a button: spinner + "Saving…" while dirty/in-flight, check + "Saved" when clean.
- Flush pending changes on blur and on unload (the `sendBeacon` POST route on `local-edits` already exists for this).
- Autosave pauses during agent streaming and while a push is in flight (reuse the existing `writer.status === "streaming" || pushing` guards).

### Multi-tab safeguard (required, see Risks)

- The `local-edits` PUT is currently a blind upsert: last writer wins. With autosave this becomes a continuous, silent overwrite risk when the same ticket is open in two tabs.
- Each save sends the draft version (timestamp or counter) the tab last loaded/saved. If the server's current version differs (another tab saved in between), respond `409`; the client pauses autosave and shows a banner: "This draft was changed in another tab" with **Reload draft** and **Overwrite** actions.
- Pushing to Jira keeps its existing baseline conflict detection; this story does not change it.

### Wrap up button + panel

One primary button (Flag icon, brand green). Opens a panel, header "Wrap up this story", subtitle "Pushes to Jira & closes the editor". Three rich options (icon chip + title + description), in this order:

1. **Ready to refine** (BadgeCheck) — push, set `readiness = ready_to_refine`, close the editor. The chat session is **kept** for later.
2. **Ready to refine + clear session** (Archive) — same, but also deletes the session/chat. The story is fully done.
3. **Close as-is** (divider above, muted styling) — push, close the editor. Readiness untouched, session kept. The story is parked, not flagged for refinement.

After option 1 or 2, immediately show the existing **Add to refinement** dialog ("Marked Ready to refine — add BRDG-XXX to an upcoming refinement?") with the upcoming refinement sessions and Skip / Add actions. Skipping still keeps the readiness change.

If there are unsaved/unpushed changes when a Wrap up option is clicked, they are saved and pushed first — Jira always matches what you leave behind. Push conflicts surface the existing conflict error and abort the close.

### Overflow (…) menu

- **Push to Jira (stay open)** moves here: plain publish, session stays, readiness untouched. Disabled when there is nothing new to push.
- Keep: Split story, Pull from Jira, Open in Jira, View in Bridge, Flag issue, Add to refinement, Discard draft / Delete session.
- Remove: the morphing Push & Close / Push to Jira / Close entries (replaced by Wrap up).

### Behavior changes to existing handlers

- `handlePush` no longer calls `handleReadinessChange("ready_to_refine")` — plain push never touches readiness.
- The post-delete "Mark as Ready to Refine?" confirm dialog (`showRefinePrompt`) is removed; deleting a session from the … menu is just a destructive action.
- The dirty/saved/pushed button-swapping logic in `StoryWriterLayout` is replaced by the fixed three-element footer above.

## Implementation Plan

Key findings: the debounced per-field save path in `useStoryWriterDrafts.ts` already IS the autosave engine (500ms debounce + `sendBeacon` on unload via `EditableDescription` pattern); `ticket_local_edit.modifiedAt` already exists and is returned by `upsertLocalEdit`, so it serves as the version token with no migration.

1. **Server version check** — add optional `baseModifiedAt` to `UpsertLocalEditInput`; in `ticket-service.upsertLocalEdit`, throw a new `ConflictError` (409 via `handle-service-error`) when an existing row's `modifiedAt` differs. Absent `baseModifiedAt` = legacy blind upsert (keeps `EditableDescription` + sendBeacon working). Files: `src/services/ticket-service.ts`, `src/services/errors.ts` (or equivalent), `src/services/handle-service-error.ts`, `src/app/api/tickets/[key]/local-edits/route.ts` (passthrough only).
2. **Client save path + 409** — `useStoryWriterDrafts.ts`: track per-field `modifiedAt` from each successful PUT, send it as `baseModifiedAt`, surface a conflict signal on 409, add `flushDraft()` (clear debounce timer + immediate PUT), pause guard via ref mirrors of `pushing`/`writer.status` (mirror pattern already in the hook; React Compiler-safe).
3. **Actions layer** — `useStoryWriterActions.ts`: replace `handleSaveDraft`/`showSaved` with derived `saveState` ("saving"/"saved"/"conflict"); remove readiness side effect from `handlePush`; remove `showRefinePrompt`; add three wrap-up handlers (`handleWrapUpReady`, `handleWrapUpReadyClear`, `handleWrapUpClose`) composing push → readiness → (deleteSession) → Add-to-refinement dialog → deferred navigation. Dialog shows BEFORE navigation (it needs the live hooks); Skip/Add/close all trigger the deferred `router.push`. Push conflict aborts the close.
4. **Footer UI** — `StoryWriterLayout.tsx`: autosave indicator + one primary Wrap up button (Flag icon) + panel (three rich options per design) + conflict banner (Reload / Overwrite); overflow gains "Push to Jira (stay open)", loses the morphing entries; `ConfirmDialog` for refine-prompt removed.
5. **Tests** — `route.test.ts` (409 cases), `useStoryWriterDrafts` tests (debounce/flush/guard/409), new `useStoryWriterActions.wrapup.test.ts` (three flows, conflict abort, plain-push regression), `StoryWriterLayout.test.tsx` updates.

Decisions on plan ambiguities: keep the existing 500ms debounce (AC says debounced, not a specific duration; blur/unload flush covers the rest); Wrap up is the single primary in split mode too (`pushToJira` already pushes the target); "nothing new to push" = `isDraftDirty || hasLocalSave`; first save after load without a seeded base behaves as blind upsert (acceptable; every subsequent save carries the token).

## Acceptance criteria

- [x] Save draft button is gone; edits autosave (debounced) with a Saving…/Saved indicator
- [x] Autosave flushes on blur/unload and pauses during streaming and pushes
- [x] `local-edits` PUT rejects stale saves (409 on version mismatch); client pauses autosave and shows the "changed in another tab" banner with Reload / Overwrite
- [x] Footer shows exactly one primary button (Wrap up) plus the … overflow
- [x] Wrap up panel offers the three options with the specified effects (readiness / session / editor close)
- [x] Both Ready to refine options immediately open the Add to refinement dialog; Skip keeps the readiness change
- [x] Wrap up pushes pending changes first; a push conflict aborts the close and shows the existing conflict message
- [x] Plain push (… menu) never changes readiness and never closes the editor
- [x] Post-delete "Mark as Ready to Refine?" prompt is removed
- [x] Tests cover: autosave debounce + flush, 409 stale-save handling, each Wrap up option's effect chain, push-conflict abort, overflow push leaving readiness untouched
- [x] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` pass

## Out of scope

- Draft history / undo beyond the existing Pull from Jira + diff banner
- Changes to the push baseline/conflict system
- The split-mode (target ticket) footer variants beyond keeping them working

## Risks

- Autosave + multi-tab: mitigated by the 409 version check above; without it, two tabs on the same ticket silently overwrite each other every few seconds. Sessions on different tickets are unaffected (saves are keyed per ticket).
- Muscle memory: Push & Close disappears; Wrap up → Ready to refine + clear session is its successor with one extra (explicit) choice.
