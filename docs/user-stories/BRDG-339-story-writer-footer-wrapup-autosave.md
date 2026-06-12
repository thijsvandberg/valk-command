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

## Acceptance criteria

- [ ] Save draft button is gone; edits autosave (debounced) with a Saving…/Saved indicator
- [ ] Autosave flushes on blur/unload and pauses during streaming and pushes
- [ ] `local-edits` PUT rejects stale saves (409 on version mismatch); client pauses autosave and shows the "changed in another tab" banner with Reload / Overwrite
- [ ] Footer shows exactly one primary button (Wrap up) plus the … overflow
- [ ] Wrap up panel offers the three options with the specified effects (readiness / session / editor close)
- [ ] Both Ready to refine options immediately open the Add to refinement dialog; Skip keeps the readiness change
- [ ] Wrap up pushes pending changes first; a push conflict aborts the close and shows the existing conflict message
- [ ] Plain push (… menu) never changes readiness and never closes the editor
- [ ] Post-delete "Mark as Ready to Refine?" prompt is removed
- [ ] Tests cover: autosave debounce + flush, 409 stale-save handling, each Wrap up option's effect chain, push-conflict abort, overflow push leaving readiness untouched
- [ ] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` pass

## Out of scope

- Draft history / undo beyond the existing Pull from Jira + diff banner
- Changes to the push baseline/conflict system
- The split-mode (target ticket) footer variants beyond keeping them working

## Risks

- Autosave + multi-tab: mitigated by the 409 version check above; without it, two tabs on the same ticket silently overwrite each other every few seconds. Sessions on different tickets are unaffected (saves are keyed per ticket).
- Muscle memory: Push & Close disappears; Wrap up → Ready to refine + clear session is its successor with one extra (explicit) choice.
