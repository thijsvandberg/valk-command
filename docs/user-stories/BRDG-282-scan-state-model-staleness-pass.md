# BRDG-282: Scan-State Data Model + Tier-1 Staleness Pass

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

## Testing

- Staleness scorer: candidate vs not, boundary ages, never-in-sprint, populated-metadata cases.
- Batch selection: oldest-`lastScannedAt`-first ordering, nulls first, cursor rotation/wraparound.
- Writes: correct fields set; no Jira write path touched.

## Checklist

- [ ] Schema migration: add `scanScores`, `scanOverall`, `scanRationale`, `lastScannedAt`,
      `lastDeepScannedAt`, `disposition`, `dispositionUntil` to `ticketMetadata` (local-only)
- [ ] Confirm none of the new fields enter any Jira write/sync path
- [ ] Tier-1 staleness scorer (pure, local, no AI) with rationale string
- [ ] `deprecation-staleness-scan` scheduler task: batched (≈25), oldest-`lastScannedAt`-first, both backlogs
- [ ] Rolling cursor in `app_setting`; resumes across restarts; loops for continuous re-scan
- [ ] Run summary logged to `activityLog`
- [ ] Tests (scorer, batch selection/cursor, writes)
- [ ] Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`
- [ ] Update `docs/architecture/scheduler.md` (new task) and reference the epic
