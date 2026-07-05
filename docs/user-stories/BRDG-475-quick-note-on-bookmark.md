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

## Implementation Plan

Open Questions resolved with these defaults (see reasoning below):
1. **Append vs replace:** PRE-FILL with the existing `poNotes` so the PO edits in place, never clobbering an existing note. The metadata route has no GET today, so add one (reviving the already-shipped-but-dead `ticketsApi.getMetadata`) and fetch it on capture open.
2. **Which surfaces:** show ONLY on single-item bookmark-ON (board row toggle, row context menu with exactly one target, inbox hover, ticket single-view header, Story Writer header). Skip bulk / multi-target.
3. **Autofocus:** no autofocus; the auto-dismiss timer cancels on focus or first keystroke.

### A — Backend: metadata GET so pre-fill works
1. Add `getTicketMetadata(key)` to `src/services/ticket-service.ts` (returns the metadata row or `null`; does not throw on a missing row).
2. Add a `GET` handler to `src/app/api/tickets/[key]/metadata/route.ts` mirroring the PUT scaffolding (`validatePathParam` + `resolveDraftKey`), returning `meta ?? {}`. Revives `ticketsApi.getMetadata` (no api-client change needed).

### B — Context/Provider (overlay host)
3. Create `src/contexts/BookmarkNoteContext.tsx` following `StoryLauncherContext.tsx`: `captureBookmarkNote(ticketKey)` opener via context (no-op default), holds one active `{ ticketKey }` at a time, renders `<BookmarkNoteCard key={ticketKey} .../>` (the `key` forces a fresh timer/engage state per bookmark). `useBookmarkNoteCapture()` hook.
4. Mount `BookmarkNoteProvider` in `src/app/(app)/layout.tsx` inside `StoryLauncherProvider` so it wraps all five surfaces and sits under SWR.

### C — The capture card + state machine
5. Create `src/components/shared/BookmarkNoteCard.tsx` reusing `ToastCard` (neutral, bookmark icon, dismiss cross) + `TextInput`, portalled to `document.body`, `fixed right-6 bottom-24 z-notification` (distinct offset from the other three toast stacks: bottom-4/6/16).
6. State machine (local state + refs): `text`, `engaged`, `timerRef`. Auto-dismiss `setTimeout(onClose, 6000)` on mount (module const `AUTO_DISMISS_MS`, tunable). `engage()` (on focus AND first change) clears + nulls the timer permanently. NO autofocus, no `.focus()`. Pre-fill from `getMetadata` on mount via an `AbortController`, guarded by refs (`engagedRef`/`textRef`) so a late fetch never overwrites typed text.
7. Save = Enter or blur-with-text (guarded by `savedRef`): `updateMetadata(key, { poNotes })` → `patchTicketDetailCache(key, { notes })` + `scopedMutate("/api/bookmarks")` → `onClose()`. Dismiss = Esc / cross / auto-timer / empty blur → `onClose()` with NO write.
8. Card renders the ticket key + a `TextInput` with an optional-note placeholder; no focus trap, no backdrop.

### D — Trigger at both choke points (single-item only)
9. `useRowActions.runFieldEdit`: consume `useBookmarkNoteCapture()`; after the existing bookmark `scopedMutate`, `if (field === "bookmarked" && value === true && ok.length === 1) captureBookmarkNote(ok[0])`. Covers board rows, context menu, inbox hover, epic children, bulk bar and `/bookmarks` at one point (bulk/multi-target skipped by `ok.length === 1`, removals skipped by `value === true`).
10. The two header toggles that bypass `useRowActions`: `useTicketDetailPage.handleToggleBookmark` and `StoryWriterLayout.handleBookmarkToggle` — after the successful toggle, `if (next) captureBookmarkNote(key)`.

### E — Tests
11. `BookmarkNoteCard.test.tsx` (fake timers): auto-dismiss + cancel-on-engage; save-on-Enter/blur calls the PUT + `scopedMutate`; Esc/auto-dismiss with no text = no write; no-autofocus + renders key + placeholder; late-pre-fill does not clobber typed text.
12. `BookmarkNoteContext.test.tsx`: card mounts only after `captureBookmarkNote`; consumer outside provider does not throw.
13. Extend `useRowActions.test.ts`: single-item ON triggers capture; two-key / OFF / failed write do not.

### Risks / Gaps
- Late pre-fill must read refs (not state) in the async resolver, or it clobbers typed text (the pre-fill test guards this).
- `getTicketMetadata` on a ticket with no metadata row returns `null` → GET returns `{}` (not 404); the card treats absent `poNotes` as `""`.
- Must use `scopedMutate` (global `mutate` is a no-op in this app).
- Four fixed bottom-right toast stacks now exist (bottom-4/6/16/24); acceptable for a transient, rare card. Offset kept as a single const.
- A rapid second bookmark supersedes the first card (no save); matches "optional, non-blocking".

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
