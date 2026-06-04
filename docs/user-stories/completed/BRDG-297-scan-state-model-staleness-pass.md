# BRDG-297: Scan-State Data Model + Tier-1 Staleness Pass

**Status:** Planned
**Priority:** Medium
**Type:** Feature
**Epic:** [Backlog Deprecation Review](../plans/2026-06-04-backlog-deprecation-review-epic.md)

## Description

Foundation story for the Backlog Deprecation Review epic. Adds the **local-only scan-state data model**
to `ticketMetadata` and the **Tier-1 staleness pass**: a cheap, no-AI scorer that runs across the
backlog in small batches, scores each ticket on age/inactivity, and records when it was last scanned.

This story produces the data every later story reads (the scan backlog view, deep-dive selection,
review). It writes **nothing to Jira** and surfaces **no destructive action** — it only scores.

## Scope

- **In:** schema fields, the Tier-1 staleness scorer, the batched/rolling scheduler task, the cursor.
- **Out:** any UI (BRDG-283), any AI topics (BRDG-285+), selection controls (BRDG-284), disposition
  actions (BRDG-289). A minimal way to eyeball results (e.g. a debug count in the scheduler status) is
  fine; the real interface is BRDG-283.

## Data model (local-only on `ticketMetadata`, never synced to Jira)

- `scanScores` — JSON map of per-topic scores + evidence. Tier-1 fills only the `staleness` entry.
- `scanOverall` — combined score (Tier-1: equals staleness until deep-dive topics exist).
- `scanRationale` — assembled human-readable reason (Tier-1: the staleness explanation).
- `lastScannedAt` — ISO timestamp; drives rolling re-scan and oldest-first ordering.
- `lastDeepScannedAt` — reserved for Tier-2 (null in this story).
- `disposition` — `null | "candidate" | "dismissed" | "confirmed"` (default null).
- `dispositionUntil` — dismiss cooldown (unused until BRDG-289).

Migration in `drizzle/`; fields are nullable/defaulted so existing rows are unaffected. Confirm none of
these ever enter the Jira write path (they live in `ticketMetadata`, which is local-only).

## Tier-1 staleness scorer (local, no AI)

- Pure function over already-synced local data: `jiraUpdatedAt` (age/inactivity), sprint membership
  (never scheduled), `status` (still backlog/To Do), and emptiness of PO metadata.
- Returns a normalized staleness score + a plain rationale string
  (e.g. "No activity since 2024-03; never in a sprint; still To Do").
- Deterministic and unit-testable in isolation.

## Scheduler task (batched, rolling)

- New lazy-cron task `deprecation-staleness-scan` registered in `src/lib/scheduled-tasks.ts`, following
  the `revalidate-deleted-tickets` pattern.
- Processes a small batch (≈25) per tick, selecting the tickets with the **oldest `lastScannedAt`**
  (nulls first) across both backlogs, then loops back to the start — continuous re-evaluation.
- Cursor/state in `app_setting` (e.g. `scheduler:deprecation-staleness-scan:cursor`) so it resumes
  cleanly across restarts.
- Writes `scanScores.staleness`, `scanOverall`, `scanRationale`, `lastScannedAt`.
- Logs a run summary to `activityLog`; no notifications in this story.
- Only scans the two configured backlogs.

## Implementation Plan

1. **Schema + migration.** Add the seven local-only fields to `ticketMetadata` in `src/db/schema.ts`
   (`scanScores`, `scanOverall`, `scanRationale`, `lastScannedAt`, `lastDeepScannedAt`, `disposition`,
   `dispositionUntil`), all nullable. Generate via `npm run db:generate`. They live on the local-only
   metadata table, so no Jira write path touches them (verified: Jira payloads are built from explicit
   `ticket` fields in `jira-client.ts`/`draft-sync.ts`, never from `ticketMetadata`).
2. **Staleness scorer.** Pure function `scoreStaleness()` in `src/lib/deprecation-staleness.ts` over
   already-synced data (`jiraUpdatedAt`, `sprintName`, `status`, PO metadata emptiness). Returns a
   normalized 0..1 score + a plain English rationale. Deterministic; injectable `now` for tests.
3. **Backlog definition.** A backlog ticket is one with no sprint (`sprintName === ""`, matching the
   existing backlog convention in `sync-tickets-service`/`tickets` route) and not removed from Jira.
   This covers both board backlogs (BT and regular), which differ only by team-prefixed sprints, not by
   backlog identity. <!-- choice: sprintName === "" is the canonical local backlog marker -->
4. **Scheduler task.** `deprecation-staleness-scan` in `scheduled-tasks.ts`, modeled on
   `revalidate-deleted-tickets`: a batch (~25) per tick selecting OLDEST `lastScannedAt` (nulls first)
   across the backlog, scoring each, writing `scanScores.staleness`/`scanOverall`/`scanRationale`/
   `lastScannedAt`, looping for continuous re-scan. Rolling cursor watermark in `app_setting`.
5. **Activity log.** One run summary per tick via `logActivity()`.
6. **Tests + docs.** Co-located tests for the scorer and the batch selection/cursor; update
   `docs/architecture/scheduler.md`.

## Testing

- Staleness scorer: candidate vs not, boundary ages, never-in-sprint, populated-metadata cases.
- Batch selection: oldest-`lastScannedAt`-first ordering, nulls first, cursor rotation/wraparound.
- Writes: correct fields set; no Jira write path touched.

## Checklist

- [x] Schema migration: add `scanScores`, `scanOverall`, `scanRationale`, `lastScannedAt`,
      `lastDeepScannedAt`, `disposition`, `dispositionUntil` to `ticketMetadata` (local-only)
- [x] Confirm none of the new fields enter any Jira write/sync path
- [x] Tier-1 staleness scorer (pure, local, no AI) with rationale string
- [x] `deprecation-staleness-scan` scheduler task: batched (≈25), oldest-`lastScannedAt`-first, both backlogs
- [x] Rolling cursor in `app_setting`; resumes across restarts; loops for continuous re-scan
- [x] Run summary logged to `activityLog`
- [x] Tests (scorer, batch selection/cursor, writes)
- [x] Run `npm run lint`, `npm run typecheck`, `npm run test` <!-- skipped: npm run build deferred to orchestrator per task instructions -->
- [x] Update `docs/architecture/scheduler.md` (new task) and reference the epic
