# BRDG-284: Deep-Dive Selection + Batch Orchestration

**Status:** Planned
**Priority:** Medium
**Type:** Feature
**Epic:** [Backlog Deprecation Review](../plans/2026-06-04-backlog-deprecation-review-epic.md)

## Description

Lets the PO choose which tickets enter the expensive **Tier-2 deep dive** and runs that work in the
background in **small batches**. This is the bridge between the staleness ranking (BRDG-282) shown in
the scan backlog (BRDG-283) and the AI scoring topics (BRDG-285+). Manual selection first; the
fully-automatic background mode is a separate, later story (BRDG-290).

## Selection methods (all manual-trigger in this story)

- **Manual select** — hand-pick tickets in the scan backlog and queue them.
- **Worst staleness first** — queue the top tickets by Tier-1 staleness score.
- **Oldest last-touched / last-scanned** — queue tickets not evaluated in the longest.
- **Pick X** — take the top X by the chosen ordering.

## Requirements

- Selection UI on the scan backlog view (BRDG-283): multi-select rows + a "deep-scan selected" action,
  plus quick actions for "worst staleness (top X)" and "oldest (top X)".
- A deep-dive queue persisted in the DB (or `app_setting` cursor + a queue table) so it survives
  restarts; enqueue is idempotent (don't double-queue a ticket already pending).
- Background runner as a lazy-cron task that dequeues a **small batch** per tick and invokes the
  Tier-2 topic scorers (the topics themselves are delivered in BRDG-285–288; this story wires the
  orchestration and a no-op/stub topic runner it can call).
- Updates `lastDeepScannedAt` and writes topic scores as they complete; sets `disposition` to
  `"candidate"` when the combined score crosses a threshold.
- **Batch progress** surfaced on the view (queued / running / done counts) and an `activityLog` entry
  per batch run.
- Respects the "small batches, never all at once" constraint and the dismiss cooldown
  (`dispositionUntil`) so dismissed tickets aren't re-queued automatically.

## Out of scope

- The on/off auto-background mode that auto-queues ~N/day (BRDG-290).
- The individual AI topic logic (BRDG-285–288).

## Testing

- Each selection method produces the expected queue (ordering, top-X, dedupe).
- Runner dequeues in batches, updates timestamps/scores, sets candidate on threshold.
- Cooldown respected; restart resumes the queue.

## Implementation Plan

Orchestration backbone for the Tier-2 deep dive. The four scoring-topic stories
(BRDG-285..288) plug into the topic-scorer registry without touching the runner.

1. **Persisted queue** — `deprecationScanQueue` table (jiraKey unique-per-active,
   enqueuedAt, status, source, startedAt, finishedAt, error). Enqueue is
   idempotent: a ticket already `pending`/`running` is never double-queued.
2. **Topic-scorer registry** (`src/lib/deprecation-topics.ts`) — the key
   deliverable. `DeprecationTopicScorer` contract + `registerTopicScorer()` /
   `getTopicScorers()`. `runDeepScan(jiraKey)` loads the ticket, runs every
   registered scorer, merges results into `scanScores[topicKey]`, recomputes
   `scanOverall` via a weighted-sum-with-per-topic-cap combiner, sets
   `disposition="candidate"` on threshold, stamps `lastDeepScannedAt`. Ships one
   clearly-marked example scorer so the runner is testable now.
3. **Background runner** — lazy-cron task `deprecation-deep-scan` dequeues a batch
   of 5 `pending` rows per tick, marks running, calls `runDeepScan`, marks
   done/error, skips tickets in dismiss cooldown (`dispositionUntil`). Logs a
   batch summary; resumes across restarts because the queue is in the DB.
4. **Selection + enqueue API** — `POST /api/cleanup/deep-scan` with methods
   `keys` | `worst-staleness` | `oldest`, each idempotent. `GET` returns queue
   status counts.
5. **Selection UI** on /cleanup — row checkboxes, "Deep-scan selected", quick
   actions "Worst staleness (top X)" / "Oldest (top X)", live batch progress.

scanOverall combination: weighted sum of per-topic contributions, each capped at
its topic's `maxContribution` (default = its weight). A subjective topic can set
a low cap so it alone can never push a ticket to high confidence (the hook
BRDG-288 relevance-decay needs). Normalized by total weight, clamped to 0..1.

## Checklist

- [x] Invoke the `frontend-design` skill before any frontend work
- [x] Selection UI: multi-select + "deep-scan selected", "worst staleness top X", "oldest top X"
- [x] Persisted, idempotent deep-dive queue that survives restarts
- [x] Background runner (lazy-cron) dequeues small batches and calls the Tier-2 topic runner
- [x] Writes `lastDeepScannedAt` + topic scores; sets `disposition="candidate"` on threshold
- [x] Batch progress on the view + `activityLog` entry per run; cooldown respected
- [x] Tests (selection methods, batched runner, threshold, cooldown, resume)
- [x] Run `npm run lint`, `npm run typecheck`, `npm run test` <!-- skipped: npm run build — task instructions forbid running build -->
- [x] Update `docs/architecture/scheduler.md` and reference the epic
