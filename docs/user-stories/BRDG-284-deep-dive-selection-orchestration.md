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

## Checklist

- [ ] Invoke the `frontend-design` skill before any frontend work
- [ ] Selection UI: multi-select + "deep-scan selected", "worst staleness top X", "oldest top X"
- [ ] Persisted, idempotent deep-dive queue that survives restarts
- [ ] Background runner (lazy-cron) dequeues small batches and calls the Tier-2 topic runner
- [ ] Writes `lastDeepScannedAt` + topic scores; sets `disposition="candidate"` on threshold
- [ ] Batch progress on the view + `activityLog` entry per run; cooldown respected
- [ ] Tests (selection methods, batched runner, threshold, cooldown, resume)
- [ ] Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`
- [ ] Update `docs/architecture/scheduler.md` and reference the epic
