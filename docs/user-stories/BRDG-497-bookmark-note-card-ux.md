# BRDG-497: Improve bookmark note card UX

**Status:** To Do
**Priority:** Low
**Type:** Feature

## Description

The bookmark note card (`BookmarkNoteCard`) has three UX gaps:

1. **Closes unexpectedly on blur.** Once the PO has engaged with the text field, any accidental
   click outside the card triggers `commit()`, which saves-or-dismisses without warning. The card
   should stay open until the PO explicitly acts (save or dismiss).
2. **No submit button.** The only save path is a keyboard shortcut (`Enter`). A visible "Save"
   button makes the action discoverable.
3. **Too small for multi-line notes.** A single-row textarea discourages longer notes. The card
   should expand when the PO focuses the field.

Decided behaviour after this story:
- `Enter` inserts a newline (free multiline editing).
- `Cmd+Enter` saves (replaces `Enter` as the keyboard save shortcut).
- A visible "Save" button saves and closes.
- `Esc` and the `×` button dismiss without saving (unchanged).
- Blur **never** saves or dismisses once the PO has started typing; the auto-dismiss timer is
  already cancelled by `engage()` at that point.
- The hint bar updates to reflect the new shortcuts: `⌘↵ save · esc dismiss`.
- The textarea expands to a comfortable minimum height on focus (e.g. `min-h-[5rem]`) and remains
  auto-growing up to the existing `max-h-32` cap.
- Width of the card can be increased slightly (e.g. `24rem` instead of `22rem`) to give the note
  more horizontal room.

## Current Behaviour

- **Component:** `src/components/shared/BookmarkNoteCard.tsx`
- **Blur handler (lines 182–185):** `handleBlur` on the wrapper div calls `commit()` whenever
  focus leaves the card. `commit()` saves if text is present, otherwise dismisses — without any
  explicit PO action.
- **Keyboard handler (lines 168–177):** `Enter` (without `Shift`) saves; `Shift+Enter` inserts a
  newline; `Escape` dismisses.
- **Textarea sizing (line 226):** `rows={1}`, `max-h-32`, `[field-sizing:content]` — starts at
  one row and grows to 8 rem max.
- **Hint bar (lines 229–242):** shows `↵ save · esc dismiss`.
- **Auto-dismiss (lines 130–160):** a 6 s timer fires `close()` if the PO never engages. Once
  engaged, `engage()` cancels the timer permanently — this part is correct and must be preserved.
- **Card width (line 197):** `w-[min(22rem,calc(100vw-3rem))]`.

## Proposed Approach

All changes are localised to `src/components/shared/BookmarkNoteCard.tsx`.

1. **Remove the blur-close path** — delete or stub `handleBlur` so blur never triggers
   `commit()` / `close()`. The `onBlur` prop is removed from the wrapper div. The engaged-state
   and auto-dismiss logic is unchanged.
2. **Swap `Enter` / `Cmd+Enter` in `handleKeyDown`** — `Enter` alone becomes a plain newline
   (no `e.preventDefault()`); `e.metaKey && e.key === "Enter"` (Mac `Cmd`) calls `commit()`.
   `Shift+Enter` behaviour is subsumed by the plain-Enter change (no special handling needed).
3. **Add a Save button** — place it in the hint bar row (left side, next to `⌘↵ save`), or as a
   small primary button replacing the hint text; style consistent with existing `ToastCard` chrome.
   Button calls `commit()` on click; `onMouseDown={e => e.preventDefault()}` prevents blur.
4. **Expand textarea on focus** — track a `focused` boolean with `onFocus`/`onBlur` on the
   textarea; apply `min-h-[5rem]` when focused (smooth via `transition-[min-height]`). Keep
   `[field-sizing:content]` so it still auto-grows above that floor.
5. **Update hint bar** — replace `↵ save` with `⌘↵ save`.
6. **Widen card** — increase max-width from `22rem` to `24rem`.

**Non-goals:** markdown rendering/preview is deliberately out of scope (parked in Open Questions).
The save/persist logic (`commit()`, API calls, optimistic patch, bulk append) is unchanged.

## Open Questions

- **Markdown formatting:** the PO is considering basic markdown rendering of the saved note
  (bold, italic, lists). This would affect both the note card display and wherever notes are read
  back (e.g. `BookmarksView` note tooltip, `TicketMetaContent` PO note textarea). Recommended
  default: defer — implement plain-text improvements now; add a `ReactMarkdown` / `marked` render
  pass on the read side in a follow-up story. No schema change needed; `poNotes` already stores
  plain text and markdown is a valid superset.

## Acceptance Criteria

- [ ] Focusing or typing in the textarea does NOT auto-close the card on blur.
  <!-- engage() already cancels the auto-dismiss timer; remove onBlur → commit() from the wrapper div (BookmarkNoteCard.tsx line 199) -->
- [ ] `Enter` inserts a newline; `Cmd+Enter` saves the note and closes the card.
  <!-- handleKeyDown: remove plain-Enter commit path; add e.metaKey && e.key === "Enter" → commit() -->
- [ ] A "Save" button is visible in the card footer and saves the note on click.
  <!-- new <button> in the hint bar row; onMouseDown preventDefault to avoid blur -->
- [ ] The hint bar reads `⌘↵ save · esc dismiss` (not `↵ save`).
  <!-- update kbd label in hint bar JSX, lines 231–239 -->
- [ ] The textarea expands to a min height of ~5 rem when focused, then contracts when blurred.
  <!-- focused state + conditional min-h-[5rem] class + transition-[min-height] on textarea -->
- [ ] The auto-dismiss timer still fires after 6 s if the PO never focuses the textarea.
  <!-- engage() flow is unchanged; only the onBlur handler is removed -->
- [ ] `Esc` and the `×` button still dismiss without saving.
  <!-- close() path unchanged -->

## Tests

- [ ] Blur after typing text does not close the card.
  <!-- BookmarkNoteCard.test.tsx: simulate blur → assert card still mounted -->
- [ ] `Enter` key inserts a newline, does not call commit.
  <!-- simulate keydown Enter → assert onSaved not called, textarea value has newline -->
- [ ] `Cmd+Enter` saves and closes.
  <!-- simulate keydown { key: "Enter", metaKey: true } → assert onSaved called -->
- [ ] Save button click saves and closes.
  <!-- simulate click on Save button → assert onSaved called -->
- [ ] Auto-dismiss fires when the PO never focuses.
  <!-- vi.useFakeTimers, advance by AUTO_DISMISS_MS, assert onClose called without onSaved -->

## Related

- `src/components/shared/BookmarkNoteCard.tsx` — only file modified.
- [[BRDG-475]] — original bookmark note capture story; established the auto-dismiss, engage, and
  pre-fill patterns that must be preserved.
- [[BRDG-480]] — bulk bookmark append behaviour (commit logic is unchanged here).
- `docs/architecture/ui-primitives.md` — ToastCard surface reused for the card chrome.
