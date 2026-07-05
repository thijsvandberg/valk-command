# BRDG-475: Quick optional note when bookmarking

**Status:** Not Started
**Priority:** Medium
**Type:** Feature

## Description

As the Product Owner, when I bookmark a story I want to **optionally** jot a short note (a PO comment — *why* I saved it) **right then**, without leaving what I'm doing. The affordance must be:

- **Not page-blocking** — no modal, no focus trap; I can ignore it and keep working.
- **Auto-dismissing, but not too fast** — if I don't engage, it fades on its own after a comfortable few seconds.
- **Sticky once I engage** — the moment I focus it or start typing, the auto-dismiss timer is cancelled so it never disappears mid-sentence. It then only closes when I save (blur / Enter) or explicitly dismiss it.

The note is optional: bookmarking never requires one, and dismissing without typing leaves no note.

## Background

BRDG-355 shipped bookmarks. The bookmark's optional note **reuses the existing PO note** (`ticketMetadata.poNotes`) — there is no separate note field, and the launcher/`/bookmarks` list already reveal that note on hover. Today the only way to add the note is to open the ticket and type in the PO Note field; there is no capture-at-bookmark-time affordance. This story adds that affordance.

## Current Behaviour

- Bookmarking is a one-tap toggle on several surfaces (BRDG-355): board rows + right-click menu, the bulk bar, the inbox hover action, the ticket single-view header, the Story Writer header, and un-bookmark on `/bookmarks`. None of them prompt for a note.
- The PO note is `ticketMetadata.poNotes`, written through `PUT /api/tickets/[key]/metadata` (`updateTicketMetadata({ poNotes })`) and surfaced as `notes` on the ticket payload. It is **not** a board-row field, so its writes may use `patchTicketCaches` (see `docs/architecture/optimistic-updates.md`), unlike `bookmarked`.
- The app already has the primitives for a non-blocking, auto-dismissing surface: `ToastCard` and the `useToast` hook, and the `AnchoredPanel` engine for popovers anchored to a trigger (see `docs/architecture/ui-primitives.md`).

## Proposed Approach

When a bookmark is **turned on** (not when removed), surface a small **note-capture card** that lets the PO type a quick note into `poNotes`.

Two candidate surfaces (decide in refinement):
1. **Toast-style card** (`ToastCard` + `useToast`), bottom-corner, containing a one-line input + a subtle "Add a note (optional)" placeholder. Non-blocking by nature; already has enter/exit motion. Needs a per-toast timer that pauses on focus/typing.
2. **Anchored popover** (`AnchoredPanel`) next to the bookmark toggle that was clicked. More contextual, but the trigger location differs per surface (header button, board row, inbox hover, bulk bar), so the toast is likely the more uniform choice across all bookmark surfaces.

Recommendation: the **toast-style card**, because bookmarking happens from many different triggers and a single, trigger-independent surface is simpler and consistent.

Behaviour:
- Appears only on bookmark **on**. Shows the ticket key + a compact text input.
- **Auto-dismiss** after ~6s (tunable) when untouched.
- On **focus or first keystroke**, cancel the auto-dismiss timer permanently for that instance.
- **Save** on Enter or on blur when there is text: `updateTicketMetadata({ poNotes })` (append or set — see Open Questions), then close. Reuses the metadata PUT; `poNotes` is not a board-row field so `patchTicketCaches` + revalidate the ticket + `scopedMutate("/api/bookmarks")` (so the list's note-hover reflects it).
- **Dismiss** (Esc / close / auto-dismiss with no text) leaves `poNotes` untouched.
- Never steals focus on appear (no autofocus) so it is not page-blocking; the PO opts in by clicking/tabbing into it.

## Open Questions

- **Append vs. replace:** if the ticket already has a `poNotes`, does the quick note **append** (timestamped line) or is capture suppressed / pre-filled with the existing note? Leaning: if a note already exists, pre-fill it so the PO edits in place rather than clobbering.
- **Which surfaces trigger the card:** all bookmark-on actions, or only the deliberate single-item ones (skip bulk-bookmark, where N notes at once makes no sense)? Leaning: skip on bulk; show on single-item bookmark-on (row, menu, header, editor, inbox).
- **Autofocus vs. opt-in focus:** to stay non-blocking, do NOT autofocus; the timer cancels on the PO's focus/keystroke. Confirm this matches the intent ("zodra je het activeert/begint te typen").

## Acceptance Criteria

- [ ] Turning a bookmark **on** surfaces an optional quick-note capture that is non-blocking (no modal, no focus trap, no autofocus).
- [ ] Left untouched, it auto-dismisses after a comfortable delay (not too fast) and writes no note.
- [ ] Focusing it or typing in it cancels the auto-dismiss for good; it then stays until save or explicit dismiss.
- [ ] Saving writes the text to the ticket's `poNotes`; the launcher/`/bookmarks` note-hover reflects it without a manual refresh.
- [ ] Removing a bookmark never shows the capture.
- [ ] The note remains fully optional — dismissing without typing changes nothing.

## Tests

- [ ] Timer test: the capture auto-dismisses after the delay when untouched; the timer is cancelled on focus/keystroke and does not fire afterward (fake timers).
- [ ] Save test: entering text + confirm calls `updateTicketMetadata`/metadata PUT with `poNotes`, and revalidates the bookmarks list.
- [ ] Dismiss test: auto-dismiss or Esc with no text makes no metadata write.
- [ ] Component test: no autofocus on appear (does not move focus); renders the ticket key + optional-note placeholder.

## Related

- [[BRDG-355-bookmark-story-for-reference]] — bookmarks; the note reuses `poNotes`, revealed on hover in the launcher list and `/bookmarks`. This story adds capture-at-bookmark-time.
- `docs/architecture/ui-primitives.md` — `ToastCard`, `useToast`, `AnchoredPanel` (the non-blocking surfaces to reuse; do not hand-roll).
- `docs/architecture/optimistic-updates.md` — `poNotes` is NOT a board-row field, so it uses `patchTicketCaches`, unlike `bookmarked`.
