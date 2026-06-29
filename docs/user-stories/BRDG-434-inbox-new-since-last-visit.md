# BRDG-434: Inbox "new since last visit" marker + tidy unassigned rows

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description
The inbox accumulates unread stories over days. When the PO reopens `/inbox`, there is no way to tell at a glance which items appeared **since their previous visit** versus items that were already there last time. This story adds a subtle per-item marker: a small brand-accent dot at the leading edge of a row, shown only for stories created after the PO last opened the inbox.

While on the inbox row layout, a second, smaller polish: most new stories have no assignee yet, but the row still reserves a fixed 26px avatar slot on the right, leaving an empty gap. Collapse that gap when there is no assignee; keep showing the avatar when there is one.

Both changes are inbox-only and must not touch the sprint board's row rendering.

## Current Behaviour

**Inbox listing.** `/inbox` (`src/app/(app)/inbox/page.tsx`) fetches unread stories from `GET /api/new-stories` and renders each row through the shared `BoardRow` (`src/components/sprint-board/BoardRow.tsx`, used at `page.tsx:513`). The inbox already shows only **unread** stories (per-user read-state, BRDG-359); items leave the list when marked read. There is currently **no notion of "since my last visit"** anywhere in the inbox.

**Available timestamp.** A `NewStoryRow` (`src/lib/new-stories-types.ts`) carries `jiraCreatedAt: string | null` (ISO). It is the only time signal on a row. The inbox can optionally group by creation **date** (Today / Yesterday / This week / Older, via `useInboxGroupBy.ts` + `new-stories-grouping.ts`), but those are absolute calendar buckets, not relative to the viewer's last visit.

**Existing client-side per-view persistence.** `src/lib/recently-viewed-store.ts` is the established pattern for a small client-side store: a `bridge:`-namespaced localStorage key, defensive parsing, and same-tab change events. Filter/row-field prefs persist via `/api/settings/*` (`useInboxFilters.ts`); group-by/collapsed state lives in `sessionStorage`. See `docs/architecture/filter-persistence.md`.

**Assignee slot.** In `BoardRow.tsx:899-932` the assignee block is gated on `tags.has("assignee")` (the inbox includes that tag) and the wrapper always reserves the 26px avatar width. The inbox passes assignee **read-only** (no `onAssigneeChange` at `page.tsx:513-536`), so unassigned rows fall to the read-only branch and render an empty 26px spacer (`BoardRow.tsx:927-929`) purely to keep the column aligned. The sprint board deliberately reserves this width for its hover-reveal behaviour (`hideAssigneeUntilHover`, BRDG-368), so the gap-collapse must be opt-in and inbox-scoped.

## Proposed Approach

### Part 1 — "New since last visit" dot

**Baseline store (server-side, per user — carried across devices).** Persist the last-viewed timestamp per user so it follows the PO across devices/browsers, reusing the account-settings pattern (BRDG-343). Add a route `src/app/api/settings/inbox-last-viewed/route.ts` built with `createUserJsonSettingRoute` (`src/lib/user-settings.ts`): setting key `inbox_last_viewed`, schema `z.string().datetime().nullable()`, default `null`. It stores one row in the `user_setting` table keyed on `(userId, key)`; the acting user is resolved from the Clerk session header by `resolveUserId()`, exactly as `/api/settings/inbox-filters` does. Read/write on the client with `useAccountSetting<string | null>("/api/settings/inbox-last-viewed", null)` (`src/hooks/useAccountSetting.ts`), whose `setValue` is optimistic with a background PUT.

**Unread-line semantics.** The baseline loads asynchronously (SWR). Once it has finished loading, capture it **once** into a session-frozen ref as the comparison baseline for this visit, then call `setValue(now)` to record this visit for the next one. This is the classic email "unread line" pattern: the current visit compares against the *previous* visit, the next visit compares against *this* one. Items arriving via SWR refetch during the open session (created after the frozen baseline) also get the dot. Guard the capture+restamp so it runs once per session and **only after the setting has loaded** — never freeze the default `null` prematurely.
<!-- implementation hint: in InboxPage a ref guards a once-per-session effect: if (!done.current && !isLoading) { baselineRef.current = lastViewed; setValue(new Date().toISOString()); done.current = true; } -->

**First-ever visit.** No stored value (`null`) → mark **nothing** new (avoid a wall of dots), and record `now` as the first baseline.
<!-- implementation hint: isNew = baseline != null && row.jiraCreatedAt != null && row.jiraCreatedAt > baseline -->

**Marker rendering.** Add an opt-in prop `isNewSinceLastViewed?: boolean` to `BoardRow` (default `false`, inert on the board). When true, render a small brand-accent dot at the row's leading edge, just before the status-pill cluster (`BoardRow.tsx:524`). Reserve a small fixed-width slot on all inbox rows so the dot's presence/absence does not shift the ticket keys out of alignment; paint the dot only when `isNewSinceLastViewed`. Use a brand token (`var(--color-brand-400)`) so it stays theme-aware and subtle. Add a `Tooltip` ("New since your last visit") and a visually-hidden label so the signal is not colour-only.
<!-- implementation hint: BoardRow renders the dot left of the <div className="relative flex shrink-0 items-center gap-1.5"> at line 524; gate on the new prop -->

The dot is independent of group-by and filters: it is purely `jiraCreatedAt` vs baseline, so it works in every grouping mode and under any active filter.

### Part 2 — Collapse empty assignee gap (inbox-only)

Add an opt-in prop `hideEmptyAssignee?: boolean` to `BoardRow` (default `false`). When set and the row has no assignee and the assignee is not editable, skip the assignee block entirely (no wrapper, no 26px spacer) instead of rendering the empty spacer at `BoardRow.tsx:927-929`. When an assignee is present, render the avatar exactly as today. Pass `hideEmptyAssignee` only from the inbox (`page.tsx:513`); the board, epic children, cleanup and refinement hosts are untouched.
<!-- implementation hint: BoardRow.tsx:899-932 - when hideEmptyAssignee && !ticket.assignee && !(onAssigneeChange && !isRemoved), render nothing; else keep current branches -->

**Non-goals / out of scope**
- No "changed/updated since last visit" detection — only newly-appeared (created) items; the row carries no update timestamp.
- No change to the existing date group-by buckets, read-state, or the count badge.
- No change to the sprint board's assignee rendering or its hover-reveal behaviour.

## Implementation Plan

1. **Setting route + helper.** Add `src/app/api/settings/inbox-last-viewed/route.ts` via `createUserJsonSettingRoute` (key `inbox_last_viewed`, nullable ISO datetime, default `null`), and a pure `isNewSinceLastViewed(jiraCreatedAt, baseline)` helper in a lib (`src/lib/inbox-last-viewed.ts`). Test the route (default + round-trip) and the helper.
2. **Wire the baseline in the inbox.** In `InboxPage`, read the setting with `useAccountSetting`, freeze it once after load into a ref, then re-stamp `now`; compute `isNew` per row; pass `isNewSinceLastViewed` to `BoardRow`.
3. **Render the dot.** Add the `isNewSinceLastViewed` prop to `BoardRow` and render the subtle leading dot + tooltip + a11y label, with a reserved slot so keys stay aligned.
4. **Collapse empty assignee.** Add the `hideEmptyAssignee` prop to `BoardRow`; pass it from the inbox only.

## Acceptance Criteria
- [ ] On reopening `/inbox`, stories created after the previous visit show a subtle brand-accent dot at the row's leading edge; older unread stories do not. <!-- BoardRow isNewSinceLastViewed prop + inbox baseline compare -->
- [ ] The last-viewed baseline is stored per user server-side and is carried across devices/browsers (not device-local). <!-- /api/settings/inbox-last-viewed via createUserJsonSettingRoute -->
- [ ] The baseline advances on each visit: items dotted on one visit are no longer dotted on the next visit (unless newer items arrived). <!-- capture+freeze after load, then setValue(now) -->
- [ ] First-ever visit (no stored value) shows no dots. <!-- baseline == null => isNew false -->
- [ ] The dot is shown correctly regardless of group-by mode (relevance / date / epic / creator / sprint) and active filters. <!-- compare is purely jiraCreatedAt vs baseline -->
- [ ] The dot has a hover tooltip ("New since your last visit") and a non-colour-only accessible label. <!-- Tooltip + sr-only text -->
- [ ] Reserving/painting the dot does not shift ticket keys between new and non-new rows. <!-- fixed-width leading slot -->
- [ ] In the inbox, unassigned rows render no avatar gap; rows with an assignee still show the avatar. <!-- hideEmptyAssignee in BoardRow.tsx:899-932 -->
- [ ] The sprint board's assignee rendering and hover-reveal behaviour are unchanged. <!-- hideEmptyAssignee default false, not passed by the board -->

## Tests
- [x] `isNewSinceLastViewed` returns `false` for null baseline, null `jiraCreatedAt`, and equal timestamps; `true` when `jiraCreatedAt > baseline`. <!-- src/lib/inbox-last-viewed.test.ts -->
- [x] Setting route: `GET` returns `null` by default; after a `PUT` of an ISO timestamp, `GET` returns it; a non-datetime value is rejected by the Zod schema. <!-- src/app/api/settings/inbox-last-viewed/route.test.ts -->
- [ ] `BoardRow` renders the dot when `isNewSinceLastViewed` is true and not when false/absent. <!-- src/components/sprint-board/BoardRow.test.tsx -->
- [ ] `BoardRow` renders no assignee slot when `hideEmptyAssignee` is set and the ticket is unassigned, and still renders the avatar when assigned. <!-- src/components/sprint-board/BoardRow.test.tsx -->

## Related
- [[BRDG-359-per-user-new-story-read-state]] — the per-user unread model this builds on; the visit baseline is persisted per user the same way.
- [[BRDG-343]] — established the per-account settings pattern (`user_setting` table + `createUserJsonSettingRoute` + `useAccountSetting`) reused for the baseline.
- [[BRDG-358]] — added the inbox `createdAtLabel` chip; same `jiraCreatedAt` signal feeds this marker.
- [[BRDG-368]] — sprint-board `hideAssigneeUntilHover`; the reason the empty-assignee collapse must stay opt-in/inbox-scoped.
- `src/lib/user-settings.ts` / `src/hooks/useAccountSetting.ts` — the server-side per-user setting plumbing.
- `docs/investigations/2026-06-15-account-and-permissions-system.md` — the per-account scoping decision (Option B).
