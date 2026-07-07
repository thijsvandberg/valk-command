# BRDG-492: Inbox expiry countdown label

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description

Inbox items older than 6 weeks are silently dropped from the view. To avoid losing track of
tickets that are about to disappear, items within 7 days of their retention cutoff should show
a small "X days left" badge. This gives the PO a clear signal to act before the item falls off.

The countdown derives purely from the shared `INBOX_AGE_WINDOW_MS` constant: changing that
constant in one place automatically updates both the filter and the label values, no settings
UI or DB migration required.

## Current Behaviour

- Inbox items are filtered in `newStoriesWhere()` (`src/lib/new-stories-query.ts:56–85`),
  excluding items where `jiraCreatedAt < now − INBOX_AGE_WINDOW_MS` (42 days / 6 weeks,
  defined at line 22 of that same file).
- Items silently disappear when they age past the cutoff — no warning is shown beforehand.
- The inbox already shows only unread items by definition (absence of a `newStoryRead` row
  for the user), so any visible inbox item is inherently unread.
- Each inbox row already exposes `jiraCreatedAt` from the API response (`/api/new-stories`).
- An existing Clock badge pattern lives in `BoardRow.tsx:971–975`; a relative-date helper
  exists in `src/lib/date-utils.ts:6–22`. Neither produces an absolute countdown.

## Proposed Approach

1. **Extract the constant.** `INBOX_AGE_WINDOW_MS` currently lives in
   `src/lib/new-stories-query.ts`, a server-only Drizzle file. Move it to a new client-safe
   module `src/lib/inbox-constants.ts`. Both the query file and the inbox page (and
   `cleanupReadStoryFlags()` in `scheduled-tasks.ts`) import it from that one location.

2. **Compute expiry client-side.** In the inbox page
   (`src/app/(app)/inbox/page.tsx`), derive `daysLeft` per row:
   - `expiresAt = new Date(row.jiraCreatedAt).getTime() + INBOX_AGE_WINDOW_MS`
   - `daysLeft = Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24))`
   - Pass an `expiryLabel` string (e.g. `"3 days left"`) to `BoardRow` when `daysLeft <= 7`.
   - Singular form: `"1 day left"` (not "1 days left").

3. **Add `expiryLabel` prop to `BoardRow`.** An optional `string` prop rendered as a small
   amber/warning-toned badge, visually distinct from the existing tertiary Clock badge. Placed
   alongside or after the `createdAtLabel` badge on the right side of the row.

4. **No API changes, no DB migration.** Purely a UI-layer addition on top of data already
   delivered to the client.

**Out of scope:** making retention configurable via Settings UI; showing the label on read
items (the inbox already hides them); email/push notification when items near expiry.

## Acceptance Criteria

- [ ] Items with 1–7 days until expiry show a badge reading "X day(s) left"
  <!-- inbox page: compute from jiraCreatedAt + INBOX_AGE_WINDOW_MS; pass as BoardRow expiryLabel -->
- [ ] Items with 8 or more days remaining show no expiry badge
  <!-- daysLeft > 7 → expiryLabel prop not passed -->
- [ ] Day count uses ceiling: expiring today or tomorrow both show "1 day left"; exactly
  7 days left shows "7 days left"
  <!-- Math.ceil in daysLeft computation -->
- [ ] Singular form is correct: "1 day left", not "1 days left"
  <!-- format helper in inbox page or inbox-constants.ts -->
- [ ] Changing `INBOX_AGE_WINDOW_MS` (e.g. from 42 to 28 days) automatically shifts which
  items get a badge and what counts they show, without further code changes
  <!-- constant extracted to src/lib/inbox-constants.ts; both query + page import from there -->
- [ ] Badge is visually distinct from the existing "created X ago" Clock label
  <!-- amber/warning color, not text-text-tertiary -->
- [ ] Badge does not appear on items that are not in the inbox (expired, or marked read)
  <!-- no change to query logic; label is client-side only for visible rows -->

## Tests

- [ ] Unit: `formatExpiryLabel(daysLeft)` returns correct strings for 0, 1, 7, 8 days
  <!-- src/lib/inbox-constants.test.ts -->
- [ ] Unit: badge renders when daysLeft ≤ 7, does not render when daysLeft = 8
  <!-- src/lib/inbox-constants.test.ts -->
- [ ] Unit: singular "1 day left", plural "2 days left"
  <!-- src/lib/inbox-constants.test.ts -->
- [ ] Smoke: `BoardRow` renders `expiryLabel` prop when passed, renders nothing when absent
  <!-- src/components/sprint-board/BoardRow.test.tsx -->

## Related

- `src/lib/new-stories-query.ts` — `INBOX_AGE_WINDOW_MS` (to be relocated to `inbox-constants.ts`)
- `src/lib/scheduled-tasks.ts` — `cleanupReadStoryFlags()` uses the same constant; must import from the new location after the move
- `src/components/sprint-board/BoardRow.tsx:971–975` — existing `createdAtLabel` badge pattern; use as reference for placement and prop shape
- `src/lib/date-utils.ts:6–22` — `relativeDate()` for context; not reused here (countdown is absolute, not relative)
