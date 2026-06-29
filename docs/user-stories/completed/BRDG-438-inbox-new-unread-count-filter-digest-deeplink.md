# BRDG-438: Inbox new-unread count, all/new filter, and digest deep-link

**Status:** Done
**Priority:** Medium
**Type:** Feature

## Description
Building on BRDG-434's "new since last visit" marker, make the *new* subset of the inbox actionable:

1. **Dual count near the title.** On `/inbox`, next to the "Inbox" title badge (today a single number, the total unread), also show how many are new: `Inbox  7  · 3 new`. The "3 new" is a clickable accent that filters the list to only the new items; clicking the total / "All" clears the filter.
2. **Select all new.** With the list filtered to new, the existing select-all selects exactly the new unreads, so the PO can bulk-action them in one gesture.
3. **Digest deep-link.** From the 2x-per-day new-unread digest banner, "Open inbox" lands on `/inbox` pre-filtered to that digest's new items, ready to select all.

Per the PO, there is ONE definition of "new" everywhere: **new since you last marked something read** — the digest's existing baseline, `MAX(newStoryRead.readAt)`. The banner count, the on-page count/chip/filter, and BRDG-434's per-row dot all read this single baseline, so the numbers always agree and the digest deep-link needs no special handling. This re-points BRDG-434's dot from its visit baseline to this read-based one and retires the visit-baseline machinery (see Proposed Approach).

## Current Behaviour

**Inbox page header count.** `src/app/(app)/inbox/page.tsx:457-462` renders `<ViewHeaderTitle>Inbox</ViewHeaderTitle>` followed by a single badge `<span …>{rows.length}</span>` — the total unread (the unfiltered `rows` from `useSWR("/api/new-stories")`, `page.tsx:92`). There is no "new" count and no all/new control. The nav sidebar shows the same total via `useSidebarData` → `useSWR("/api/new-stories/count")` (`NavPanel.tsx`, `useSidebarData.ts:72`).

**BRDG-434 "new" wiring (reused here).** `page.tsx:105-116` already loads the per-user baseline `useAccountSetting<string|null>("/api/settings/inbox-last-viewed", null)`, freezes it once into `visitBaseline` (adjust-state-during-render), and re-stamps `now` in an effect. Per-row newness is `isNewSinceLastViewed(row.jiraCreatedAt, visitBaseline ?? null)` (`src/lib/inbox-last-viewed.ts`), passed to each `BoardRow` for the dot (`page.tsx:555`). This is the on-page "new" signal this story builds on.

**Filtering + display pipeline.** `useInboxFilters(rows)` (`src/components/sprint-board/useInboxFilters.ts`) produces `filteredRows` (status/epic/assignee/creator/type/team/sprint + search); `useInboxGroupBy(filteredRows, …)` then groups them into the rendered `groups`. There is no "new vs all" dimension today.

**Bulk select.** `checkedKeys` (`page.tsx:94`), `allChecked = filteredRows.length > 0 && filteredRows.every(...)` (`page.tsx:399`), `toggleAll` (`page.tsx:400-405`) operate on `filteredRows`; the `BulkActionBar` (`page.tsx:571+`) and per-group `GroupStatBar` select-all hang off the same set.

**Digest.** The 2x/day digest (BRDG-413) lives in `src/lib/inbox-digest.ts` / `inbox-digest-store.ts`, served by `GET /api/inbox/digest` as `{ active }` where `ActiveDigest = { id, generatedAt, baselineAt, total, buckets }`. `baselineAt` is `MAX(newStoryRead.readAt)` for the user (the last time they marked something read) — a *different, read-based* baseline than BRDG-434's visit baseline. The digest stores **no explicit key list**: "new" = `jiraCreatedAt > baselineAt`. The banner `src/components/notifications/InboxDigestBanner.tsx` "Open inbox" (lines 78-86) sets `sessionStorage["inbox-group-by"]="relevance"`, dismisses, and routes to `/inbox` with no filter. The inbox reads **no query params** today.

## Proposed Approach

### 1. One read-based baseline, exposed to the client
- Define "new" once: a story is new when `jiraCreatedAt > baselineAt`, where `baselineAt = MAX(newStoryRead.readAt)` for the user — reuse `getInboxBaseline` (`src/lib/inbox-digest.ts`). This is exactly the digest's baseline, so every surface agrees. <!-- getInboxBaseline already exists -->
- Expose it to the inbox: include `baselineAt: string | null` in the `/api/new-stories` list response (`NewStoriesResponse`), so the page has rows + baseline in one fetch. The page reuses `isNewSinceLastViewed(row.jiraCreatedAt, baselineAt)` for the dot, the count, and the filter — no extra round-trips. <!-- new-stories route + new-stories-types.ts + new-stories-query.ts -->
- **Behaviour note (high-water mark):** because the baseline is `MAX(readAt)`, marking any item read advances it to that moment, so "new" then covers only stories that arrive afterwards — i.e. marking read = "I've triaged up to now". This is the digest's existing semantics, now shared on-page.
- **Retire the visit baseline (supersedes part of BRDG-434):** remove the `useAccountSetting("/api/settings/inbox-last-viewed")` call, the `visitBaseline` freeze (adjust-state-during-render), and the re-stamp effect from `InboxPage` (`page.tsx:105-116`). The dot now reads `baselineAt` from the list response. Move the now-unused `src/app/api/settings/inbox-last-viewed/route.ts` (+ its test) to `deleted/`. Keep `src/lib/inbox-last-viewed.ts` (the `isNewSinceLastViewed` comparison helper is baseline-agnostic and still used; an optional rename to drop the "last-viewed" connotation is cosmetic only).

### 2. Dual count + all/new toggle
- Derive both counts from the unfiltered unread list `rows`: total = `rows.length`; new = `rows.filter(r => isNewSinceLastViewed(r.jiraCreatedAt, baselineAt)).length`. <!-- page header -->
- Add an ephemeral `newOnly` boolean (useState, reset on navigation away; also settable via the deep-link). Apply it as one extra step between `filteredRows` and grouping: `displayRows = newOnly ? filteredRows.filter(isNew) : filteredRows`, then feed `displayRows` to `useInboxGroupBy`. <!-- insert before useInboxGroupBy -->
- Render the dual count next to `ViewHeaderTitle`: the existing total badge plus a clickable "N new" accent chip (brand-toned, reusing the BRDG-434 dot's `--color-brand-500` family). Clicking the chip sets `newOnly=true`; clicking the total / an "All" affordance sets `newOnly=false`. Hide the chip when new count is 0. <!-- page.tsx:457-462 -->

### 3. Select all new
- Point `allChecked` / `toggleAll` (and the empty-state guards) at `displayRows` instead of `filteredRows`, so with `newOnly` on, select-all selects exactly the new set. No new bulk action — filter-to-new + existing select-all covers "select all new unreads". <!-- page.tsx:399-405 + BulkActionBar -->

### 4. Digest deep-link
- Banner "Open inbox" routes to `/inbox?new=1` (keep the existing group-by=relevance + dismiss). <!-- InboxDigestBanner.tsx:78-86 -->
- The inbox reads `useSearchParams()`; when `new=1` is present on load, start with `newOnly=true`. Because on-page "new" now uses the same read-based baseline as the digest, the filtered set matches the banner count automatically — no baseline carried in the URL. <!-- add useSearchParams in InboxPage -->
- Do **not** pre-select on arrival (PO decision): pre-filter only; the PO hits select-all themselves.

**Non-goals / out of scope**
- Not changing the digest's schedule, content, or baseline definition.
- Not adding the new-count to the nav sidebar badge (page header only, where the PO pointed); can follow later.
- Not adding a Filters-dropdown category — the all/new control is the count chip itself.
- Not auto-marking anything read, and not auto-selecting on digest landing.

## Implementation Plan
1. **Baseline on the server.** `/api/new-stories` returns `baselineAt` via `getInboxBaseline(ctx.userId)`; extend `NewStoriesResponse`.
2. **Retire visit baseline + wire read baseline.** In `InboxPage`, drop the `inbox_last_viewed` wiring; feed the dot `isNewSinceLastViewed(row.jiraCreatedAt, baselineAt)`; move the dead route (+ test) to `deleted/`.
3. **Counts + toggle.** Compute `newCount` from `rows` + `baselineAt`; add `newOnly` + `displayRows`; feed `displayRows` to `useInboxGroupBy`; point `allChecked`/`toggleAll`/empty-state at `displayRows`.
4. **Header UI.** Total badge + clickable "N new" accent chip next to `ViewHeaderTitle`.
5. **Deep-link.** `useSearchParams()` → initialise `newOnly` from `?new=1`; update `InboxDigestBanner` "Open inbox" to route to `/inbox?new=1`.

## Acceptance Criteria
- [x] "New" is defined once everywhere as `jiraCreatedAt > MAX(readAt)`; the banner count, the on-page chip, and the per-row dot use this same baseline. <!-- getInboxBaseline + baselineAt on NewStoriesResponse + shared isNewSinceLastViewed -->
- [x] The inbox header shows the total unread count and, when > 0, a "N new" count beside it. <!-- page header chip; newCount from rows + baselineAt -->
- [x] Clicking "N new" filters the list to only new items; clicking the total / All restores all unread. <!-- newOnly state + displayRows -->
- [x] With the list filtered to new, select-all selects exactly the new unreads. <!-- allChecked/toggleAll over displayRows -->
- [x] The digest banner "Open inbox" lands on `/inbox?new=1` pre-filtered to new, matching the banner count without carrying a baseline. <!-- InboxDigestBanner -> /inbox?new=1 ; shared read baseline -->
- [x] Marking an item read advances the baseline so already-seen items drop out of "new" (high-water mark). <!-- MAX(readAt) baseline + mark-read invalidates /api/new-stories -->
- [x] The visit-baseline wiring (`inbox_last_viewed` setting + freeze/re-stamp) is removed and its route moved to `deleted/`. <!-- supersedes BRDG-434 visit baseline -->
- [x] Clearing the new filter (or navigating in without `?new=1`) shows all unread again. <!-- newOnly default false -->

## Tests
- [x] `/api/new-stories` returns `baselineAt` = `MAX(readAt)` for the user (null when nothing read). <!-- new-stories route test -->
- [x] `newOnly` filtering: a rows fixture with mixed `jiraCreatedAt` yields the correct new subset and new-count for a given `baselineAt`. <!-- isNewSinceLastViewed derive test -->
- [x] Header renders "N new" only when newCount > 0; clicking it toggles `newOnly`. <!-- inbox header unit test -->
- [x] select-all over the new-filtered list checks exactly the new keys. <!-- toggleAll over displayRows test -->
- [x] `?new=1` initialises the list in new-only mode. <!-- useSearchParams init test -->
- [x] Banner "Open inbox" routes to `/inbox?new=1`. <!-- InboxDigestBanner.test -->

## Related
- [[BRDG-434-inbox-new-since-last-visit]] — provides the per-row dot, the collapse-empty-assignee opt-in, and `isNewSinceLastViewed`; this story supersedes its visit-baseline wiring (`inbox_last_viewed`) in favour of the shared read-based baseline.
- [[BRDG-413-inbox-new-ticket-digest]] — the 2x/day digest whose `MAX(readAt)` baseline (`getInboxBaseline`) becomes the single source of "new".
- `src/components/sprint-board/useInboxFilters.ts` / `useInboxGroupBy.ts` — the filter→group pipeline `displayRows` slots into.
- `src/components/notifications/InboxDigestBanner.tsx` — the deep-link entry point.
