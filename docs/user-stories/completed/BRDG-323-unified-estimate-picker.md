# BRDG-323: Unified estimate picker (SP + guess, "pencil to ink")

**Status:** Done
**Priority:** Medium
**Type:** Improvement
**Related:** BRDG-303 (forward-planning guestimation), BRDG-321 (slate SP + dashed penciled draft), BRDG-310 (empty SP/BV hover reveal)
**Exploration:** `/dev/exploration/estimate-entry` (flow B "Pencil to ink" chosen)

## Problem

On a Sprint Board row the story-point chip and the forward-planning guestimate chip were two
separate, near-identical slate `#` badges. On an unscored row in planning mode, hovering revealed
**both** empty placeholders side by side (plus a tooltip), so it was unclear which one to click.

## Solution

Merge the two into **one chip** that graduates through a lifecycle (the `EstimatePicker`):

```
empty  ->  dashed PO guess  ->  solid committed SP
```

- An unscored row shows at most **one** affordance on hover.
- A guess wears SP's slate tone, set apart only by a dashed inset border (BRDG-321 "penciled in").
- The popover has the Fibonacci presets, N/A (`-`), a `#` button for **manual entry** (13, 21, ...),
  a reset `X` (clear to *unset*, distinct from N/A), and keyboard entry (preset keys, `0`/`-`,
  Backspace/Delete).
- **Commit** ("pencil to ink") is a quiet dashed action that copies the guess into story points.
- **back to guesstimate (# N)** reverts a committed SP to the preserved prior guess, naming it.

## Key behaviour: the guess is kept as the guesstimate of record

Previously the server **wiped** the guestimate the moment a real SP landed (BRDG-303). That made the
revert impossible. Now the guess is **kept**:

- SP still supersedes the guess for display **everywhere** (a guess only ever shows while SP is empty),
  so no view shows two values.
- The guess stays **Bridge-local** and is never synced to Jira.
- Committing remembers the guess that existed **when the popover opened**, so adjusting then committing
  preserves the *earlier* guess (e.g. guess 3 -> adjust to 5 -> commit => SP 5, guesstimate stays 3),
  instead of overwriting it with the value you replaced it by. A value typed from empty and committed
  straight away leaves **no** guesstimate.

## Scope

- New `src/components/shared/EstimatePicker.tsx`; wired into `BoardRow` (replacing the SP + guess
  placeholder/value slots). `BusinessValuePicker` is untouched.
- Server: removed the guestimation auto-clear in `updateTicketFields` (`src/lib/ticket-detail-builder.ts`);
  updated the `ticketMetadata.guestimation` schema comment.
- Other surfaces (ticket detail, story-writer, epic children) keep their standalone `StoryPointPicker` /
  `GuestimationPicker`; they already gate the guess on "SP empty", so the kept guess stays invisible there.

## Checklist

- [x] `EstimatePicker` component (lifecycle, manual entry, reset, keyboard, commit, revert)
- [x] Wired into `BoardRow`, single estimate slot (placeholder + value)
- [x] Server no longer clears the guess when SP is set; schema comment updated
- [x] Tests: `EstimatePicker.test.tsx`; updated `ticket-detail-builder.test.ts` and `BoardRow.test.tsx`
- [x] Exploration page + hub marked Shipped
