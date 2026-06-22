# BRDG-376: Harden the Jira sync engine (atomicity & correctness)

**Status:** Not Started
**Priority:** High
**Type:** Stability — sync / data integrity

## Description

The codebase audit ([2026-06-22-codebase-audit.md](../investigations/2026-06-22-codebase-audit.md))
found that the read paths are well batched, but the **write/sync layer** has a set of atomicity and
correctness defects that can drop edits, abort a ticket sync, or do duplicate work. These are
low-frequency in single-user steady state, but they are real (concurrent webhook + user edit,
overlapping scheduler ticks, bulk Jira edits of >50 tickets) and they corrupt the local mirror
silently. This story makes the core sync primitives atomic and correct.

## Current Behaviour

- **Read/write split in `upsertIssue`.** [upsert-issue.ts:123-203](../../src/lib/upsert-issue.ts)
  reads ~7 tables (existing ticket, meta, latest version, attachments, links, comments) *before*
  `db.transaction(...)` at :284-534. The diff decisions (`needsNewVersion`, `isOwnPushEcho`,
  `changedKinds`) are computed from that pre-read snapshot and written later. A concurrent upsert
  of the same key (incremental sync overlapping group-sync, or sync overlapping a push-to-jira
  confirm-fetch) commits in between, so the second writer diffs against stale state.
- **`Date.now()` ids.** [upsert-issue.ts:356,378](../../src/lib/upsert-issue.ts) build
  `sc-${key}-${Date.now()}` / `sv-${key}-${Date.now()}`. Two upserts of the same key within one
  millisecond generate identical PKs; the second insert throws inside the transaction and aborts
  the entire ticket upsert. Other tables already use `randomUUID()`.
- **Watermark on partial batch.** [sync-incremental/route.ts:144-167](../../src/app/api/jira/sync-incremental/route.ts)
  slices `staleItems` to `BATCH_LIMIT` (50) but then advances the watermark to the last
  *processed* item's `updated`. With >50 changed tickets in one window, unprocessed stale items
  whose `updated` is below the new watermark are never re-fetched — silently dropped from the mirror.
- **Non-atomic queue claim.** [deprecation-scan-queue.ts](../../src/lib/deprecation-scan-queue.ts)
  `claimPendingBatch` does `SELECT pending LIMIT n` then a separate `UPDATE ... SET running`. Two
  overlapping ticks SELECT the same ids and both "claim" them — the same ticket is deep-scanned
  twice (expensive) and two `markDone` writes race. The doc comment claims the claim is atomic.
- **`requeueStuckRunning` clobbers live rows.** Same file: it resets ALL `running` rows to
  `pending` at the start of each tick, so an overlapping tick re-queues rows the prior tick is
  still processing.
- **Non-transactional reorder/rank loops.** [placeholder-service.ts:248-259](../../src/services/placeholder-service.ts)
  (reorder), [jira/rank/route.ts:75-79](../../src/app/api/jira/rank/route.ts),
  [jira/move-sprint/route.ts:154-160](../../src/app/api/jira/move-sprint/route.ts) all do one
  `await db.update(...)` per row in a loop with no transaction; a mid-loop failure leaves a
  half-applied ordering. `move-sprint:133-139` already demonstrates the correct in-transaction loop.

## Proposed Approach

1. **Pull `upsertIssue` snapshot reads into the transaction.** better-sqlite3 transactions are
   synchronous, so reads and writes inside the callback are atomic. Resolve the one genuinely-async
   fallback (`getLastChangeAuthor` at :158) before opening the transaction, then re-read
   `existing`/`latestVersion` inside.
2. **Replace `Date.now()` ids with `randomUUID()`** (or add `.onConflictDoNothing()` on those
   inserts) for `storyVersion` and `ticketStatusChange`.
3. **Fix the watermark.** Only advance to the max `updated` across the entire stale+changed set
   once `remaining === 0`; while draining, do not advance past the first unprocessed item. Verify
   against `fetchTimestampFirst`, which avoids the bug by fetching all changed keys.
4. **Make the queue claim atomic** — wrap SELECT+UPDATE in a `db.transaction`, or use
   `UPDATE ... SET running WHERE id IN (SELECT ... LIMIT n) RETURNING *` as one statement.
5. **Scope `requeueStuckRunning` to a timeout** — only requeue rows whose `startedAt` is older
   than a stuck threshold, not all running rows.
6. **Wrap the three reorder/rank loops in `db.transaction`** (faster and atomic), mirroring
   `move-sprint:133-139`.

No behaviour change in the happy path; the goal is that concurrent/large operations stop corrupting
the mirror.

## Implementation Plan

Key fact: better-sqlite3 `db.transaction((tx) => {...})` is fully synchronous and can
return a value (see `src/app/api/tickets/[key]/story-writer/route.ts`). Tests use a real
in-memory better-sqlite3 via `createTestDb()`, so transactions are synchronous there too.

1. **UUID ids (AC2)** — `upsert-issue.ts`: import `randomUUID` from `crypto`; replace
   `sc-${key}-${Date.now()}` (:356) and `sv-${key}-${Date.now()}` (:378) with `randomUUID()`.
   Chosen over `onConflictDoNothing` because the PK is the only unique column and dropping
   on conflict would silently swallow a legitimately-distinct version.
2. **Snapshot reads into the tx (AC1)** — `upsert-issue.ts`: resolve the async change-author
   fallback (`getLastChangeAuthor`) *before* opening the tx (unconditionally, capture as
   `resolvedChangeAuthor`; only use it inside the tx when `latestVersion` exists). Move the
   seven pre-reads (`existing`, `meta`, `latestVersion`, `existingAttachments`, `localLinks`,
   `existingComments`, `previousJiraLinks`) inside the tx using `tx.select().get()/.all()`
   (the `db.query.X.findFirst` relational API is not on `tx`). Move `storyPoints` clamp,
   `ticketData` construction, `needsNewVersion`, `isOwnPushEcho`, `versionAuthor`,
   `pointsChanged`, `statusChanged`, and the `changedKinds` block inside the tx. Hoist
   `needsNewVersion`/`isOwnPushEcho`/`changedKinds` to outer `let`/`const` so the post-tx
   storyWriterSession rebase and event emission still see them.
3. **Watermark drain (AC3)** — `sync-incremental/route.ts`: when `remaining > 0`, advance the
   watermark only up to just below the earliest unprocessed stale item (never skip a stale
   item below the watermark); when `remaining === 0`, advance to the max `updated` of the whole
   `changed` set. Return the actually-persisted watermark.
4. **Atomic queue claim (AC4)** — `deprecation-scan-queue.ts` `claimPendingBatch`: wrap the
   SELECT-then-UPDATE in one `db.transaction` returning the claimed rows.
5. **Stuck-timeout requeue (AC4)** — `deprecation-scan-queue.ts` `requeueStuckRunning`: only
   requeue rows whose `startedAt` is older than a `STUCK_THRESHOLD_MS` cutoff (ISO strings
   sort lexicographically; use `lt`). Wrap in a transaction; defend against null `startedAt`.
6. **Transactional reorder/rank loops (AC5)** — wrap the per-row update loops in
   `reorderPlaceholders` (`placeholder-service.ts`), `jira/rank/route.ts`, and the jiraRank
   reindex loop in `jira/move-sprint/route.ts` in `db.transaction`, mirroring move-sprint's
   existing `syncTicketSprints` loop.

Order: 1 → 2 (largest, after 1 so the in-tx insert already uses UUID) → 3 → 4 → 5 (after 4)
→ 6. Tests authored alongside each, mirroring existing `createTestDb()` + `vi.mock("@/db")`
patterns. Note: true concurrency cannot be unit-tested with synchronous better-sqlite3; tests
assert the invariant (single version row, committed-state diff, disjoint claim sets) via
sequential calls.

## Acceptance Criteria

- [x] Two concurrent `upsertIssue` calls for the same key cannot produce duplicate `story_version`
      rows or diff against stale state (snapshot reads are inside the write transaction).
- [x] Same-millisecond double-upserts no longer abort the ticket sync (UUID ids or onConflict).
- [x] An incremental sync window with >50 changed tickets eventually mirrors all of them (no
      silently dropped edits); `remaining` drives the drain loop.
- [ ] Overlapping scan-queue ticks cannot double-claim the same row; `requeueStuckRunning` only
      requeues genuinely-stuck rows.
- [ ] Reorder / rank / move-sprint reindex is atomic — a mid-loop failure leaves no partial ordering.

## Tests

- [x] `upsert-issue` test simulating an interleaved second upsert asserts a single version row and
      a correct diff.
- [x] `upsert-issue` test: two upserts with a stubbed identical timestamp both succeed (no PK clash).
- [x] `sync-incremental` test: >50 stale items across two calls mirrors every item and advances
      the watermark only when drained.
- [ ] `deprecation-scan-queue` test: two `claimPendingBatch` calls return disjoint id sets;
      `requeueStuckRunning` leaves a fresh running row untouched.
- [ ] reorder/rank tests assert all-or-nothing ordering when one update throws.

## Open Questions

- **Serialization vs. atomicity.** Atomic per-call transactions (recommended, low-risk) vs. a
  coarser sync mutex that serializes sync routes against push-to-jira. The transaction approach
  fixes the corruption without a global lock; confirm that is sufficient.

## Related

- [[2026-06-22-codebase-audit]] — source audit (Stability — sync engine).
- [optimistic-updates.md](../architecture/optimistic-updates.md) — the reorder/rank paths feed it.
- Touch points: `upsert-issue.ts`, `sync-incremental` route, `deprecation-scan-queue.ts`,
  `placeholder-service.ts`, `jira/rank` + `jira/move-sprint` routes.
