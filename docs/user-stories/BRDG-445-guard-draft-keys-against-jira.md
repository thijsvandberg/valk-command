# BRDG-445: Guard DRAFT-xxx keys against Jira calls

<!-- Renumbered from BRDG-443 (collision with parallel BRDG-443-vrw-prod-cutover and BRDG-444). -->

**Status:** To Do
**Priority:** Medium
**Type:** Bug
**Origin:** Production log review (2026-06-30, `/prod-logs`). Recurring across the 2026-06-29 logs.

## Description

A draft ticket carries a synthetic local key (`DRAFT-748b82f8`), not a real Jira
issue key. Several code paths still send that DRAFT key straight to the Jira API,
which rejects it with `400 Bad Request: Invalid Jira issue key`. The PO sees this
as a failing watchers panel and the server logs an unhandled error. No data is
lost, but it is a genuine missing guard that fires repeatedly whenever a draft is
open or a stale reference to a finalized draft lingers in an open tab.

The fix is a guard, in two layers: do not call Jira for a DRAFT key at all on the
client, and have the server short-circuit DRAFT keys cleanly (resolve to the real
key if the draft was already finalized, otherwise return a clean response instead
of a 500 / unhandled error).

## Evidence (from production logs)

Two distinct symptoms, one root cause:

1. **Watchers fetch 500s for a draft.**
   `GET /api/jira/watchers?issueKey=DRAFT-284c9abd` -> Jira `400` -> the route
   returns `500` to the client. Logged at 2026-06-29 13:48:51:
   `ERROR [jira] Failed to fetch watchers Jira API 400 Bad Request ... Invalid Jira issue key: DRAFT-284c9abd`
   and client-side `[swr /api/jira/watchers?issueKey=DRAFT-284c9abd status=500]`.

2. **Pull-from-Jira throws an unhandled error on a draft, even after finalization.**
   At 2026-06-29 13:50:41 `DRAFT-748b82f8` was finalized to `VPL-47045`
   (`[draft-sync] Finalized DRAFT-748b82f8 -> VPL-47045`). Almost two hours later,
   at 15:34:43, `POST /api/tickets/DRAFT-748b82f8/pull-from-jira` still ran with
   the dead DRAFT key (a stale open tab / stale SWR cache), called
   `jiraClient.getIssue("DRAFT-748b82f8")`, and produced
   `ERROR [service] unhandled error JiraApiError: ... Invalid Jira issue key: DRAFT-748b82f8`.

## Current Behaviour (where the guard is missing)

- **Client — watchers always fired:** `WatchersRow`
  (`src/components/shared/WatchersRow.tsx:28`) sets its SWR key to
  `ticketKey ? jira.watchersUrl(ticketKey) : null` — it fires for any non-empty
  key, including DRAFT keys. There is no `startsWith("DRAFT-")` skip.
- **Server — watchers route:** `GET /api/jira/watchers`
  (`src/app/api/jira/watchers/route.ts:20`) passes `issueKey` straight to
  `jiraClient.getWatchers(issueKey)` and maps any failure to a generic `500`.
  No DRAFT awareness.
- **Server — pull-from-jira service:** `ticketService.pullFromJira(key)`
  (`src/services/ticket-service.ts:258`) calls `jiraClient.getIssue(key)` with
  the raw key. It does **not** call `resolveDraftKey()` and does not guard a
  still-pending DRAFT key, so a DRAFT key reaches Jira and throws.
- A resolver already exists but is not used on these paths: `resolveDraftKey(key)`
  in `src/lib/draft-sync.ts:14` maps a finalized DRAFT key (`status === "REPLACED"`,
  real key stored in `description`) to its real key, and returns the input
  unchanged for non-draft or still-pending keys. The `startsWith("DRAFT-")` check
  is currently inline there only.

## Proposed Approach (to discuss)

1. **Add a shared helper** `isDraftKey(key: string): boolean` next to
   `resolveDraftKey` in `src/lib/draft-sync.ts` and reuse it everywhere instead of
   re-typing `startsWith("DRAFT-")`.
2. **Client guard (avoid the call entirely):** in `WatchersRow`, set the SWR key to
   `null` when `isDraftKey(ticketKey)` so no request is made for a draft. A draft
   has no Jira watchers by definition.
3. **Server guard (defense in depth) on the two confirmed routes:**
   - `pull-from-jira`: resolve the key with `resolveDraftKey()` first. If it still
     resolves to a DRAFT key (a pending, not-yet-finalized draft), return a clean
     `409`/`400` ("ticket is a draft and has no Jira issue yet") instead of letting
     a `JiraApiError` bubble up as an unhandled error.
   - `watchers` GET: short-circuit a still-pending DRAFT key with an empty watcher
     list (`{ watchers: [] }`, `200`) rather than calling Jira and returning `500`.
4. **Sweep the sibling Jira-bound routes** for the same gap and decide per route
   whether each needs the same guard (most take a key and could choke on a DRAFT
   key): `src/app/api/tickets/[key]/links/route.ts`,
   `src/app/api/jira/rank/route.ts`, `src/app/api/jira/sync-links/route.ts`,
   `src/app/api/jira/check-updated/route.ts`. Confirmed-broken ones (watchers,
   pull-from-jira) are must-fix; the rest are in scope to verify and fix only if
   they actually hit Jira with an unresolved key.

## Implementation Plan

Derived from an Opus Plan pass over the cited files. Order reflects dependencies.

1. **Shared, client-safe helper (AC-1).** The wrinkle: `isDraftKey` is needed in
   the `"use client"` `WatchersRow`, but `draft-sync.ts` imports `@/db` (server).
   So the canonical primitive lives in a new dependency-free module
   `src/lib/draft-key.ts` (`DRAFT_KEY_PREFIX` + `isDraftKey`). `draft-sync.ts`
   imports it, uses it inside `resolveDraftKey` (replacing the inline
   `startsWith`), and re-exports it so server callers can still import from
   `@/lib/draft-sync`.
2. **Server guard — pull-from-jira lives in the SERVICE, not the route**
   (`ticketService.pullFromJira`, AC-2). The row update is keyed by
   `eq(ticket.jiraKey, key)` inside the service, so resolution must happen there
   for `getIssue` and the DB write to use the same real key. Resolve with
   `resolveDraftKey(key)` first; if it is still a draft (pending, not finalized),
   throw a typed `DraftNotFinalizedError` (new `ServiceError` subclass in
   `errors.ts`, code `DRAFT_NOT_FINALIZED`, **409**) which `handleServiceError`
   already turns into a clean handled response. The route needs no change.
3. **Server guard — watchers route** (`/api/jira/watchers`, AC-2). GET: resolve
   the key; if still a draft, return `{ watchers: [] }` 200 without calling Jira;
   otherwise call `getWatchers(resolved)`. POST/DELETE: same resolve, but a draft
   has no Jira issue to watch, so return a handled 409 instead of letting Jira 400
   into a 500.
4. **Client guard — WatchersRow** (AC-2). SWR key becomes
   `ticketKey && !isDraftKey(ticketKey) ? jira.watchersUrl(ticketKey) : null`, so a
   draft never fires the request and renders the existing empty state.
5. **Sibling sweep (AC-5), all verified by reading:**
   - `tickets/[key]/links/route.ts` — already resolves via `resolveDraftKey` in all
     three handlers. No change. (Latent edge: a *pending* draft could still reach
     `createIssueLink`; noted as a follow-up, not in this story's two symptoms.)
   - `jira/check-updated/route.ts` — already rejects DRAFT keys with 400 via
     `isValidJiraKey` (`/^[A-Z][A-Z0-9]+-\d+$/i`; the hex suffix fails `\d+`). N/A.
   - `jira/rank/route.ts` — passes keys straight to `rankIssues`; the board hook
     skips DRAFT keys client-side, no confirmed path. N/A (hardening candidate).
   - `jira/sync-links/route.ts` — bulk, per-batch `try/catch` increments
     `batchErrors` and never 500s the client. N/A (error-tolerant).
6. **Tests:** `draft-key.test.ts` (helper); `WatchersRow.test.tsx` (null key for
   draft); `watchers/route.test.ts` (GET draft → `[]` no Jira call; POST/DELETE
   draft → 409); `ticket-service.test.ts` (pending draft → throws, no `getIssue`;
   finalized draft → resolves to real key and calls `getIssue` with it).

**Notes/risks:** importing `draft-sync` into `WatchersRow` would drag `@/db` into
the client bundle — avoided by the separate `draft-key.ts`. `validatePathParam`
does not reject DRAFT keys (only empty/length/NUL), so the guard is additive.
~9 other inline `startsWith("DRAFT-")` sites exist; out of scope here, follow-up
cleanup candidate to route through `isDraftKey`.

## Acceptance Criteria

- [ ] Opening a draft ticket (DRAFT-xxx) no longer fires `GET /api/jira/watchers`;
      the watchers control renders empty without a network error.
- [x] `POST /api/tickets/DRAFT-xxx/pull-from-jira` never produces an
      `unhandled error` / `JiraApiError` in the server logs. A finalized draft
      resolves to its real key and pulls normally; a pending draft returns a clean,
      handled response. (`pullFromJira` resolves + throws `DraftNotFinalizedError`
      (409) for a pending draft, handled by `handleServiceError`.)
- [ ] No `Invalid Jira issue key: DRAFT-...` `400`s appear in the logs during a
      normal draft-create -> finalize flow.
- [x] A shared `isDraftKey()` helper exists and the inline `startsWith("DRAFT-")`
      checks reuse it. (`src/lib/draft-key.ts`; `resolveDraftKey` now uses it. The
      ~9 other inline sites are an out-of-scope follow-up, noted above.)
- [ ] Sibling Jira-bound routes reviewed; any that pass an unresolved DRAFT key to
      Jira are guarded the same way (or explicitly noted as not applicable).

## Tests

- [ ] `WatchersRow`: SWR key is `null` for a DRAFT key; non-null for a real key.
- [x] `pull-from-jira` route/service: pending DRAFT key returns the handled
      response and does not call `jiraClient.getIssue`; finalized DRAFT key resolves
      to the real key and proceeds.
- [ ] `watchers` GET route: pending DRAFT key returns `{ watchers: [] }` `200`
      without calling Jira.
- [x] `isDraftKey()` unit test (DRAFT-xxx true, VPL-xxx false, empty false).

## Out of Scope

- The whole-backlog `/api/tickets` latency (separate concern, tracked by
  [BRDG-411](completed/BRDG-411-bound-all-tickets-fetch.md) /
  [BRDG-412](BRDG-412-hover-lookup-on-demand.md)).
- Changing how drafts are finalized or how stale tabs are refreshed after
  finalization; this ticket only makes the Jira-bound paths safe for DRAFT keys.
