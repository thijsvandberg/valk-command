# BRDG-351: Stop the deleted-sprint (10048) re-fetch loop

**Status:** Completed
**Priority:** High
**Type:** Bug

## Description

As the Product Owner, I want the app to stop re-fetching sprints that no longer exist in Jira, so that the server log isn't flooded with `404 Not Found` errors and my limited Jira API budget isn't burned on dead sprints on every background pass.

In production, the server log shows this line over and over, indefinitely:

```
[jira-client] API error: 404 Not Found path=/rest/agile/1.0/sprint/10048 body={"errorMessages":["We could not find the sprint"]}
```

Sprint **10048 was deleted in Jira**. It has no display name locally (it is not in `sprint_name_cache`); only one ticket still carries the bare numeric value `sprint_name = "10048"`. There is supposed to be a "negative cache" so a missing sprint is not re-fetched, but it does not work: the sprint is re-requested on every read-path backfill pass, 404s every time, and each attempt counts against the Jira outbound rate-limit budget (contributing to the `Approaching Jira API rate limit (80%+)` warnings).

## Root Cause

There is a **source mismatch** between which sprint ids are scheduled for backfill and which ones are considered "done":

- **Candidate ids come from the `ticket` table.** `scheduleSprintBackfill` selects `selectDistinct(ticket.sprintName)` — `src/app/api/jira/sprints/route.ts:40-54` — and feeds them to `ensureSprintsCached`.
- **The "skip / already complete" set comes from `jira_sprints`.** `ensureSprintsCached` builds its `complete` set only from cached sprint rows — `src/lib/sprint-cache.ts:109-110`.
- **A 404 deletes the sprint from `jira_sprints` and `sprint_name_cache`, but never clears `ticket.sprint_name`.** The "missing" outcome removes the id from those caches — `src/lib/sprint-cache.ts:120-122, 131, 141-143` — yet the orphaned ticket row keeps `sprint_name = "10048"`.

Net effect: 10048 is gone from `jira_sprints` (so it is *never* in `complete`), but it is still present in the `ticket`-derived candidate list, so it is a fetch candidate on **every** backfill pass → 404 → forever. The in-process `inFlight` dedup (`src/lib/sprint-cache.ts:20`) only collapses concurrent calls; there is **no time-based negative cache** that says "this id is known-missing, don't retry for N minutes".

The backfill runs via `after()` on every `GET /api/jira/sprints`, so normal board usage keeps the loop alive.

## Context

- **Known-bad data (current snapshot):** three bare-numeric sprint ids carried on tickets with no cached display name. Only `10048` is currently logging 404; `4568` and `4902` are in the same orphaned state and will behave identically if/when those sprints are also deleted in Jira. **Every affected ticket is already closed (DONE or DEPRECATED)** — there is no active sprint planning attached, so local cleanup is low-risk.
  - **Sprint `10048`** (the 404 trigger) — 1 ticket: `VPL-43900` (subtask, DONE).
  - **Sprint `4568`** — 17 tickets, all DONE: `VPL-18870`, `VPL-38267`, `VPL-41459`, `VPL-42203`, `VPL-42616`, `VPL-42687`, `VPL-42993`, `VPL-42995`, `VPL-43008`, `VPL-43009`, `VPL-43014`, `VPL-43032`, `VPL-43072`, `VPL-43135`, `VPL-43158`, `VPL-43212`, `VPL-43381`.
  - **Sprint `4902`** — 39 tickets, DONE + a DEPRECATED block: `VPL-41568`, `VPL-43626`, `VPL-43640`, `VPL-43643`, `VPL-43644`, `VPL-43645`, `VPL-43646`, `VPL-43647`, `VPL-43648`, `VPL-43649`, `VPL-43650`, `VPL-43690`, `VPL-43698`, `VPL-43790`, `VPL-43817`, `VPL-43831`, `VPL-43833`, `VPL-43834`, `VPL-43836`, `VPL-43837`, `VPL-43838`, `VPL-43840`, `VPL-44053`, `VPL-44054`, `VPL-44170`, `VPL-44172`, `VPL-44181`, `VPL-44231`, `VPL-44232`, `VPL-44275`, `VPL-44333`, `VPL-44342`, `VPL-44475`, `VPL-44536`, `VPL-44537`, `VPL-44559`, `VPL-44561`, `VPL-44562`, `VPL-44563`. (`VPL-43626`–`VPL-43650` are DEPRECATED; the rest DONE.)
  - This list is a point-in-time snapshot; the fix must be general (driven by Jira's 404 response), not hard-coded to these ids.
- **A 404 is one outbound Jira call** that counts against the budget: `throttle()` → `trackOutboundCall("jira")` runs at the start of every attempt (`src/lib/jira-client.ts:229`), and 404 is not retryable (`isRetryable` only covers 429/503, `src/lib/jira-client.ts:260-262`), so each pass = exactly one wasted, counted call.
- **The outbound warning** fires at 80% of 100 calls/min (`src/lib/rate-limiter.ts:160-162`), so the dead-sprint churn plus normal sync traffic trips it.
- **Symptom in the UI:** an orphaned ticket shows its sprint as the raw number (`10048`) instead of a name, because there is no cache entry to resolve it.

## Implementation Plan

**PO decision (made):** cleanup = **delete locally**. Affected tickets are valid closed tickets, so we clear their dead sprint reference (`sprintName`/`sprintIds`) and drop the `ticketSprint` bridge rows rather than deleting whole ticket rows (far less destructive, satisfies all ACs). Strictly local; Jira is never written.

**Single mechanism:** a new persistent `missing_sprint` table is written at the existing `outcome.kind === "missing"` (404) branch in `ensureSprintsCached`. The same "missing" event records the negative cache, drives the local orphan cleanup, and is consulted by both `ensureSprintsCached` (suppress fetch) and the backfill candidate query (exclude id). Negative cache = suppression list = cleanup trigger; no duplicated logic. Recovery = row absent or expired.

1. **Schema** (`src/db/schema.ts`): add `missingSprint` table — `sprintId text PK` (string, matches `sprintNameCache`/`ticketSprint`), `missingAt text NOT NULL default datetime('now')`. Add `MissingSprintRow`/`NewMissingSprintRow` types. Run `npm run db:generate` to produce `drizzle/0079_*.sql` + meta + journal (required: `createTestDb` runs migrations).
2. **`sprint-cache.ts` — negative cache + cleanup:**
   - `MISSING_SPRINT_TTL_MS = 24h` suppression window.
   - In `ensureSprintsCached`, after building `complete`: read `missing_sprint`, build `suppressed` set of ids within window, delete expired rows (recovery via expiry). `toFetch = ids.filter(!complete && !suppressed)`.
   - On `missing` (404): upsert `missing_sprint` (refresh timestamp), keep removing from `jira_sprints` JSON + `sprintNameCache`, and clean orphaned ticket refs — for each ticket with `sprintName = id`, blank `sprintName` to `""` and strip the id from `sprintIds` JSON, then `syncTicketSprints` to converge `ticketSprint`. Clearing `ticket.sprintName` is what stops re-seeding (backfill reads distinct `ticket.sprintName`).
   - On `found`: delete any `missing_sprint` row for that id (clear-on-reappearance).
3. **`route.ts` + exported helper:** add exported `getBackfillCandidateIds()` to `sprint-cache.ts` that reads distinct `ticket.sprintName` and filters against positive (`jira_sprints`) + negative (`missing_sprint`) caches. `scheduleSprintBackfill` delegates to it.
4. **Budget verification (log-based):** confirm no recurring `API error: 404 ... sprint/10048` lines and no `getSprint` for the id during normal board usage after fix (one probe allowed per expiry window, by design).
5. **Tests** (`sprint-cache.test.ts`): (a) 404 records known-missing + no further `getSprint` within window; (b) expiry re-fetches and clears row / clear-on-found; (c) `getBackfillCandidateIds` excludes known-missing ids still present in `ticket.sprintName`; (d) orphan cleanup blanks `ticket.sprintName`/`sprintIds` + drops `ticketSprint`; (e) transient 503 writes no `missing_sprint` row and leaves tickets untouched.

## Acceptance Criteria

### Core
- [x] A sprint id that Jira reports as 404 ("missing") is **not re-fetched on every subsequent backfill pass**. After the first 404, repeated `GET /api/jira/sprints` requests must not re-issue `GET /rest/agile/1.0/sprint/{id}` for that id within a reasonable suppression window.
- [x] The repeating `404 Not Found path=/rest/agile/1.0/sprint/10048` log line stops appearing during normal board usage.
- [x] A previously-missing sprint can still recover: if it later reappears in Jira (or the suppression window expires), it is allowed to be fetched again rather than being permanently blacklisted with no path back.

### Negative cache
- [x] Implement a persistent (or sufficiently long-lived) record of "known-missing" sprint ids with a timestamp, consulted by `ensureSprintsCached` / `scheduleSprintBackfill` so missing ids are excluded from the candidate set until the suppression window lapses.
- [x] The candidate-source vs. skip-source mismatch is resolved: ids derived from `ticket.sprint_name` are reconciled against both the positive cache (`jira_sprints`) and the new negative cache before any fetch is scheduled.

### Orphaned data cleanup
- [x] Clean up the orphaned references so the bare numeric id no longer surfaces in the UI and no longer re-seeds the loop. **Local deletion is explicitly allowed** here: it is fine to delete the orphaned sprint rows and/or the affected (already-closed) ticket rows from the local SQLite DB, or to clear their `sprint_name`. See Open decision for which. <!-- per PO decision: clear ticket.sprintName + strip from sprintIds + drop ticketSprint rows; ticket rows kept (valid closed issues) -->
- [x] **Hard constraint — local-only:** the cleanup (and the negative-cache logic) must operate **only on the local database**. It must never issue any delete, update, or other write to Jira. No Jira sprint and no Jira issue may be modified or removed under any circumstance. Verify the code path touches only local storage and read-only Jira GETs. <!-- verified: only db.* writes + read-only jiraClient.getSprint GET -->

### Budget
- [x] Confirm (via logs) that the dead-sprint fetches no longer contribute to the Jira outbound counter, reducing the frequency of `Approaching Jira API rate limit (80%+)` warnings. <!-- log-based verification, see Implementation Plan step 4: suppressed ids never reach jiraClient.getSprint, so trackOutboundCall("jira") is not hit for them -->

### Tests
- [x] Test: a 404 on a sprint fetch records it as known-missing and a subsequent `ensureSprintsCached` pass for the same id issues **no** further Jira call within the window.
- [x] Test: the known-missing record expires (or is cleared on reappearance) so recovery is possible.
- [x] Test: `scheduleSprintBackfill` excludes known-missing ids from its candidate set even though they still appear in `ticket.sprint_name`. <!-- tested via the extracted getBackfillCandidateIds helper that scheduleSprintBackfill delegates to -->`

## Open decision (needs PO input)

What should happen **locally** to tickets that reference a sprint Jira has deleted? (All affected tickets are already closed; this is local cleanup only — Jira is never touched.)

1. **Clear the reference:** null out `ticket.sprint_name` for confirmed-missing sprints (treat as "no sprint"). The ticket stays in the local DB but drops out of that (non-existent) sprint view.
2. **Delete locally:** remove the orphaned local sprint rows and/or the affected ticket rows from SQLite entirely. Acceptable per the PO since these are deleted-in-Jira sprints with only closed tickets; a future sync would re-pull anything Jira still has.
3. **Keep but label:** retain the id but render it as e.g. "Deleted sprint (10048)" so the history is visible without re-fetching.

Default recommendation: **option 1** (clear the local reference) as the minimum to stop the loop, with **option 2** (local delete) acceptable if a cleaner board is preferred. Either way, strictly local. To be confirmed before implementation.

## Technical Notes
- Keep the fix in the sprint-cache / backfill layer: `src/lib/sprint-cache.ts` (negative-cache record + consult it) and `src/app/api/jira/sprints/route.ts` (reconcile candidate ids against it). Do not change retry semantics in `jira-client.ts`.
- The negative cache must be keyed by sprint id with a timestamp; reuse the existing SQLite layer (a small table or a reserved marker), not in-memory only, so it survives restarts.
- Address the sibling orphans `4568` and `4902` with the same mechanism; this is not specific to `10048`.
- Out of scope: the separate `/api/tickets` slow-query / polling cost (heavy `json_each` sprint filter + 60s multi-component polling) — tracked separately.
