# BRDG-413: Inbox new-ticket digest notification (per-user, twice-daily on weekdays)

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description

The PO wants to be told, at most twice per working day, how many new tickets have arrived in the Inbox since they last *used* it. "Used" means the last time they took an explicit read action (marked a ticket read) — not merely opening `/inbox`.

Three things together:

1. **Twice-daily weekday digest (per user).** On weekdays only, at two fixed windows (morning ~09:00 and early afternoon ~13:00), the PO gets a digest of new inbox tickets. Maximum two per day, zero on weekends. The digest is scoped to the current user (Clerk `userId`), so the count and the "last used" baseline are personal.

2. **Counts since last inbox use, broken down by relevance bucket.** The digest says how many new tickets arrived since the PO's last read action, *and* how many landed in each relevance bucket (the five inbox relevance groups), e.g. "3 on your team's board, 2 from teammates, 2 generic backlog".

3. **Inbox defaults to Relevance grouping.** The inbox group-by default changes from `date` to `relevance` (falling back to date rendering only when no default team is set, per existing behaviour).

**Surface (decided with PO):** an **in-app banner/card**, not a red-dot badge. It is persistent (server-backed, survives reload), shows the per-bucket breakdown, and offers **Open inbox** (jump to the Inbox in Relevance grouping) and **Dismiss** (clear it). It is not a transient toast.

**Delivery timing (decided with PO):** two **fixed weekday windows** treated as *due times*, not exact fire times. Because the scheduler is browser-driven (lazy-cron), a window's digest is delivered at the first moment the PO is active at or after that window's due time. If the PO only becomes active at 09:30, the morning digest appears then. Cap is two delivered windows per weekday.

## Current Behaviour

- **Inbox** lives at `src/app/(app)/inbox/page.tsx`, listing unread, recently-created tickets from `GET /api/new-stories` (`NewStoryRow[]`). A lightweight `GET /api/new-stories/count` already exists for cheap polling.
- **Read state is already per-user.** Table `new_story_read(userId, ticketKey, readAt)` (`src/db/schema.ts`, PK `(userId, ticketKey)`); read/unread written via `src/lib/new-story-read-store.ts` (`markNewStoryReadForUser`, `bulkMarkNewStoriesRead`) behind `PUT`/`POST /api/new-stories/read`. The inbox query (`src/lib/new-stories-query.ts`, `listNewStories`) excludes rows the user has read via a `NOT EXISTS` subquery on `new_story_read`, and excludes the user's own authored rows (BRDG-359). **There is no inbox-arrival watermark; `ticket.jiraCreatedAt` is the only "when did this appear" signal.**
- **Relevance grouping** (BRDG-372) is a pure classifier in `src/lib/new-stories-grouping.ts`: `RELEVANCE_BUCKETS = ["team_board","teammates","generic_backlog","everything_else","other_pos"]`, labels `On your team's board / From your teammates / Generic backlog / Everything else / From other POs`, and `classifyInboxRelevance(row, { myTeam, teamMap, poAccountIds })`. Inputs come from default team (`userSetting` key `default_team`, `useDefaultTeam()`), team map (`userTeamAssignment` via `buildTeamMap`/`resolveTeam`), and PO markers (`poUser` table / `poUsers` helper).
- **Inbox group-by default is `date`.** `src/components/sprint-board/useInboxGroupBy.ts` persists the choice in `sessionStorage["inbox-group-by"]`, defaulting to `"date"`. Relevance renders only when a default team is set; otherwise it falls back to date rendering while leaving the stored choice intact.
- **Per-user settings pattern (BRDG-343)** exists: table `userSetting(userId, key, value)`, `resolveUserId()` + `readUserSetting`/`writeUserSetting` + `createUserJsonSettingRoute()` in `src/lib/user-settings.ts`, client hook `useAccountSetting(url, default)` (`src/hooks/useAccountSetting.ts`, optimistic + revalidate-on-focus). User identity is Clerk's `userId`, forwarded as header `x-bridge-user-id`.
- **Scheduler** is lazy-cron (browser drives `POST /api/scheduler/tick`); `src/lib/scheduler.ts` + `docs/architecture/scheduler.md`. There is already a precedent for a per-day cap (the deprecation auto-scan daily budget). We will reuse the *philosophy* (evaluate-on-tick, persist per-day bookkeeping) rather than register a global task, because this digest is per-user.
- **Existing notification systems we are deliberately NOT reusing here:** the global `alert` table + `/api/notifications` (no `userId`, team-scoped, surfaced via a bell — not the requested banner) and the transient `useToast`. The banner is its own per-user, server-backed surface.

## Proposed Approach

### Baseline = "last time I used the inbox"

Per user, baseline = `MAX(readAt)` over `new_story_read` for that `userId` (the last explicit read action). If the user has never marked anything read, baseline is `null` → treat the entire current unread inbox as "new" (first-ever digest). Opening `/inbox` does **not** move the baseline; only a read action does. This already falls out of the existing per-user read store — no new write path needed.

### "New since baseline" counts, per relevance bucket

Compute server-side, reusing the existing pure pieces so there is one source of truth:

- Candidate rows = current unread inbox rows for the user (the existing `listNewStories` unread + self-exclude logic).
- New = candidate rows with `jiraCreatedAt > baseline` (all candidates when baseline is `null`).
- Bucket each new row with `classifyInboxRelevance(row, { myTeam, teamMap, poAccountIds })` using the same inputs as the inbox (default team, team map, PO account ids — all readable server-side). Emit non-empty buckets in `RELEVANCE_BUCKETS` order with their existing labels.
- **No default team set:** relevance cannot classify meaningfully, so the digest carries the total only (no bucket breakdown), mirroring the inbox's date fallback.

### Delivery windows + per-day cap (lazy, per-user, evaluate-on-read)

Hardcode two due times and a timezone in a small lib constant (`Europe/Amsterdam`, `09:00` morning, `13:00` afternoon; weekdays Mon–Fri). No holiday calendar (out of scope).

`GET /api/inbox/digest` both **evaluates and returns** the user's active digest (lazy-cron applied per request — naturally per-user via auth, no global scheduler task):

1. Resolve `userId`, compute "now" in the configured timezone. Load the user's digest state from `userSetting` key `inbox_digest`.
2. If the stored `deliveryDate` is not today, reset `deliveredWindows = []` and `deliveryDate = today`.
3. Weekend → generate nothing (an already-active, undismissed digest may still display; it just won't refresh until the next weekday).
4. `dueWindows` = windows whose due time ≤ now today. `unconsumed = dueWindows − deliveredWindows`.
5. If `unconsumed` is non-empty **and** the new-since-baseline total > 0: compute the digest, set it as `active`, and mark **all** `unconsumed` due windows as consumed. (Marking all unconsumed-due windows consumed means arriving at 14:00 shows a single fresh banner and consumes both slots — never two banners at once — while arriving at 09:30 consumes only the morning slot and leaves the afternoon available.)
6. If `unconsumed` is empty or there is nothing new, leave `active` unchanged (an empty window is not "spent" — a 09:30 check with nothing new keeps the morning slot open until something arrives or the day ends).
7. Return `active` (or `null`).

This guarantees ≤ 2 delivered windows per weekday, 0 on weekends, and the "active at 09:30 ⇒ morning digest at 09:30" behaviour.

### Banner state shape (`userSetting` key `inbox_digest`, server-written only)

```jsonc
{
  "active": null | {
    "id": "2026-06-26:afternoon",       // dedupe / render key
    "generatedAt": "<ISO>",
    "baselineAt": "<ISO>" | null,        // the read action this is measured from
    "total": 7,
    "buckets": [                          // omitted/empty when no default team
      { "key": "team_board", "label": "On your team's board", "count": 3 },
      { "key": "teammates",  "label": "From your teammates",  "count": 2 },
      { "key": "generic_backlog", "label": "Generic backlog", "count": 2 }
    ]
  },
  "deliveryDate": "2026-06-26",
  "deliveredWindows": ["morning", "afternoon"]
}
```

Reads use `readUserSetting`; the evaluation writes with `writeUserSetting`. The client never writes delivery bookkeeping (so the cap can't be forged); the only client-initiated mutation is **dismiss**.

### Banner component

A persistent banner/card rendered in the app shell layout (`src/app/(app)/layout.tsx`), reading `GET /api/inbox/digest` via SWR (`refreshInterval` ~60s + `revalidateOnFocus`, so becoming active triggers an immediate evaluation). When `active` is non-null it renders the total plus the non-empty bucket lines, with:

- **Open inbox** → navigate to `/inbox` (Relevance grouping) and clear `active`.
- **Dismiss** → clear `active` (no navigation).

Both call `DELETE /api/inbox/digest` (clears `active`, leaves `deliveredWindows` intact so the slot stays spent). Because state is server-backed, the banner survives reloads until acted on. Styling follows the project's banner/card conventions (layered surface, not a flat badge); no red dot.

### Inbox default → Relevance

In `useInboxGroupBy.ts` change the default from `"date"` to `"relevance"`. Existing fallback (relevance → date rendering when no default team) is unchanged, so this is safe with or without a team. A previously persisted explicit choice is still respected (default only applies when nothing is stored).

### Out of scope / non-goals

- A Settings toggle to enable/disable or retime the digest (always-on, fixed windows for now). Note as a future enhancement, ideally folded into a per-user version of notification preferences (currently global; re-scoping deferred per BRDG-343).
- Holiday calendars, configurable timezone, OS/desktop notifications, and reusing the global `alert`/bell system.

## Implementation Plan

> Verified against the codebase before implementation. Key corrections vs. the original draft:
> - `listNewStories` takes a full `NewStoryQueryCtx = { userId, jiraAccountId, jiraName }`, not a bare `userId`. The acting Jira identity is resolved server-side by the existing `resolveNewStoryQueryCtx()` (`src/lib/new-stories-ctx.ts`) — reuse it so the digest sees the exact same candidate set as the inbox.
> - `classifyInboxRelevance` needs **four** inputs: `{ myTeam, teamMap, poAccountIds, poNames }` (the draft omitted `poNames`).
> - No timezone util exists. Use `Intl.DateTimeFormat` with `timeZone: "Europe/Amsterdam"` to derive local weekday / HH:mm / YYYY-MM-DD from a passed-in `now: Date` (DST-correct, no new deps, testable).
> - `default_team` is stored JSON-encoded (`createUserJsonSettingRoute` does `JSON.stringify`), so read it via `readUserSetting("default_team", userId)` + `JSON.parse`.
> - `GET /api/inbox/digest` mutates (consumes windows), so it must NOT use the read-through `cache` and must return `Cache-Control: private, no-store`.

**Phase 1 — digest computation (pure + query)** · `src/lib/inbox-digest.ts` (new)
1. Constants: `TIMEZONE = "Europe/Amsterdam"`, `WINDOWS = [{ key: "morning", hour: 9, minute: 0 }, { key: "afternoon", hour: 13, minute: 0 }]`, `DigestWindowKey = "morning" | "afternoon"`.
2. Pure tz helpers over `now: Date` via `Intl.DateTimeFormat`: `localDateKey(now)` → `YYYY-MM-DD`; `isWeekday(now)`; `dueWindows(now)` → window keys whose local HH:mm ≤ now.
3. `getInboxBaseline(userId)` → `MAX(newStoryRead.readAt)` for the user (new small query); `null` when never read.
4. `computeInboxDigest(ctx: NewStoryQueryCtx, now)` → baseline; `listNewStories(ctx)` candidates; keep rows where `baseline == null || jiraCreatedAt == null || jiraCreatedAt > baseline`; read `default_team` (null → `{ total, buckets: [] }`); else build `teamMap` from `userTeamAssignment` + `poAccountIds`/`poNames` from `poUser`, classify each new row, emit non-empty buckets in `RELEVANCE_BUCKETS` order. Returns `{ total, baselineAt, buckets }`.
5. Reuse, do not duplicate: `classifyInboxRelevance` / `RELEVANCE_BUCKETS` / `RELEVANCE_BUCKET_LABELS` / `buildTeamMap` (`new-stories-grouping.ts`), `listNewStories` (`new-stories-query.ts`), `resolveNewStoryQueryCtx` (`new-stories-ctx.ts`), `readUserSetting` (`user-settings.ts`).

**Phase 2 — digest state + route (lazy evaluate-on-read)**
6. `src/lib/inbox-digest-store.ts` (new) — `InboxDigestState` type matching the story shape; `readDigestState`/`writeDigestState` over `readUserSetting`/`writeUserSetting` key `"inbox_digest"`; `evaluateInboxDigest(ctx, now)` implementing steps 1–7 (day reset, weekend short-circuit, `dueWindows − deliveredWindows`, compute only when unconsumed non-empty AND total > 0, mark all unconsumed consumed, else leave active); `clearActiveDigest(userId)` (active → null, keep deliveredWindows).
7. `src/app/api/inbox/digest/route.ts` (new) — `GET`: `resolveNewStoryQueryCtx()` → `evaluateInboxDigest(ctx, new Date())` → `{ active }` with `Cache-Control: private, no-store`, no read-through cache. `DELETE`: `applyRateLimit("delete")` → `resolveUserId()` → `clearActiveDigest`. Patterns copied from `new-stories/read/route.ts` + `po-users/route.ts`.
8. `src/lib/api-client.ts` — add `inboxDigest` helper (`url()`, `get`, `dismiss`).

**Phase 3 — banner UI**
9. `src/components/notifications/InboxDigestBanner.tsx` (new) — `useSWR(inboxDigest.url(), swrFetcher, { refreshInterval: 60000, revalidateOnFocus: true, dedupingInterval: 30000 })`; null when `active` is null; persistent card with total + non-empty bucket lines, **Open inbox** (dismiss + set `sessionStorage["inbox-group-by"]="relevance"` + `router.push("/inbox")`) / **Dismiss** (dismiss + mutate). Calls `DELETE /api/inbox/digest`.
10. `src/app/(app)/layout.tsx` — mount as a dynamic sibling of `DeployNotifier` inside `ActivityProvider`.

**Phase 4 — inbox default grouping**
11. `src/components/sprint-board/useInboxGroupBy.ts` — default `"date"` → `"relevance"` (existing `effectiveGroupBy` fallback to date with no team is unchanged; persisted explicit choice still respected).

**Tests:** `src/lib/inbox-digest.test.ts` (tz/weekday/due-window helpers incl. DST + weekend; baseline incl. null & null createdAt; per-bucket counts; no-team total-only), `src/lib/inbox-digest-store.test.ts` (weekday/weekend gating; 09:30 morning delivery; ≤2/day cap; arrive-at-14:00 consumes both windows with one banner; day rollover reset; empty digest does not spend a slot; dismiss clears active but not bookkeeping), `src/app/api/inbox/digest/route.test.ts` (GET evaluate + DELETE clear, per-user), `src/components/sprint-board/useInboxGroupBy.test.ts` (default now relevance, still falls back to date with no team).

## Acceptance Criteria

- [ ] On weekdays I receive at most two inbox digests per day (morning ~09:00 and early afternoon ~13:00); none on weekends. <!-- evaluateInboxDigest windows + cap -->
- [ ] A window's digest is delivered at the first moment I am active at/after its due time (e.g. active at 09:30 → morning digest at 09:30), not only at the exact clock time. <!-- lazy evaluate-on-read -->
- [x] The digest counts only tickets that arrived in the inbox since the last time I marked something read (not since I opened /inbox); with no prior read action it counts the whole current unread inbox. <!-- baseline = MAX(readAt), jiraCreatedAt > baseline -->
- [x] The digest is per-user (my baseline and counts are mine). <!-- userId-scoped throughout -->
- [x] The digest shows the total and how many new tickets landed in each relevance bucket (non-empty buckets, in ladder order with their labels); with no default team it shows the total only. <!-- classifyInboxRelevance reuse -->
- [ ] The notification is a persistent in-app banner/card (not a red dot); it survives reload, and I can Open inbox (jump to Inbox in Relevance grouping) or Dismiss it. <!-- InboxDigestBanner + server-backed state -->
- [ ] The Inbox defaults to Relevance grouping (falling back to date rendering only when no default team is set). <!-- useInboxGroupBy default -->

## Tests

- [x] Baseline selection: latest `readAt` wins; `null` when the user has never read; opening the inbox does not change it. <!-- inbox-digest.test -->
- [x] New-since-baseline filtering and per-bucket counts are correct, including total-only fallback when no default team. <!-- inbox-digest.test -->
- [ ] Window/cap logic: weekend yields nothing; morning delivers at 09:30; ≤2 deliveries/weekday; arriving at 14:00 shows one fresh banner and consumes both slots; an empty digest leaves the slot open; day rollover resets bookkeeping. <!-- inbox-digest-store.test -->
- [ ] `GET /api/inbox/digest` evaluates + returns per user; `DELETE` clears `active` but preserves `deliveredWindows`. <!-- route.test -->
- [ ] Inbox group-by default is `relevance` and still falls back to date when no default team is set. <!-- useInboxGroupBy.test -->

## Related

- [[BRDG-372-new-story-inbox-relevance-grouping]] — the relevance buckets + classifier this reuses; the grouping mode whose default this flips.
- [[BRDG-359-new-story-inbox-user-scoped-read-and-self-exclude]] — per-user `new_story_read` table and self-exclusion (the baseline source).
- [[BRDG-356-newly-created-stories-inbox]] / [[BRDG-358-new-story-inbox-grouping-and-group-actions]] — the inbox and its group-by modes.
- [[BRDG-343-account-scoped-saved-views]] — per-user `userSetting` pattern (`createUserJsonSettingRoute`, `useAccountSetting`) the digest state follows; note global notification prefs were deferred there.
- Scheduler lazy-cron + daily-budget precedent: `docs/architecture/scheduler.md`, `src/lib/scheduler.ts`.
- Deliberately not reused: global `alert` table + `/api/notifications` (bell), `useToast` (transient).
