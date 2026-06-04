# Epic: Backlog Deprecation Review

**Status:** Planned
**Type:** Epic (multiple stories)
**Owner:** PO

## Problem

The backlog has grown large and stale (BT: Backlog ≈347 items, regular Backlog ≈208 items). Many
tickets are probably obsolete — old and untouched, duplicated by newer tickets, already built, or
about product areas that have since been replaced (e.g. CWI, RezExchange, IDPMS, hybrid cloud).
Combing through this by hand is impractical.

## Goal

Build a management surface in Bridge where the PO can see every backlog ticket's **scan state and
multi-topic scores**, choose which slice to **deep-scan in the background in small batches**, and
**review/dispose** the candidates it surfaces. Each surfaced candidate carries a **written rationale**.

## Hard constraints (non-negotiable)

- **Marking only.** Nothing is ever auto-deprecated. The scanner nominates; the PO decides.
- **Never writes to Jira.** All scan state, scores, and dispositions live local-only on Bridge
  (`ticketMetadata`), never synced back. The bidirectional `ticket.flagged` field is **not** reused.
- **Small batches, never all at once.** Scanning is gradual and controlled — never blast 500+ tickets.
- **Everything re-checkable over time.** Last-scanned-at per ticket drives rolling re-evaluation.

## Two-tier scan model

This is the core design idea that ties the feature together.

### Tier 1 — Staleness pass (cheap, local, broad)
- Pure local heuristics (no AI): age, inactivity, never-in-a-sprint, empty PO metadata.
- Runs fast across the whole backlog, produces a **staleness score** + records `lastScannedAt`.
- This tier is what **ranks** the backlog and feeds selection for Tier 2.

### Tier 2 — Deep dive (AI, expensive, selective)
- Runs the heavier topics only on a **selected subset** (see Selection below), so agent load stays low.
- Produces the remaining topic scores and assembles the rationale.

## Scoring topics (per ticket — multi-dimensional, not one flag)

Each scan writes a score per topic; the topics combine into an overall "deprecation likelihood" plus
a rationale assembled from whichever topics fired.

| # | Topic | Tier | Signal source |
|---|-------|------|---------------|
| 1 | **Staleness / age** | 1 | Local: `jiraUpdatedAt`, sprint membership, status, PO metadata |
| 2 | **Replaced / obsolete area** | 2 (cheap) | Maintained keyword list (CWI, RezExchange, IDPMS, hybrid cloud, …) + AI confirmation |
| 3 | **Duplication / superseded by another ticket** | 2 | AI via existing `find-related` skill |
| 4 | **Already built** | 2 (expensive) | Selective codebase-research check via the agent |
| 5 | **Relevance decay** | 2 | AI judgement against current product context |

The **replaced/obsolete-area** topic is partly a maintained list of deprecated domains/keywords, so any
ticket mentioning a retired area scores high immediately — cheap and accurate. The list is editable.

## Selecting what gets deep-scanned

The PO controls which tickets enter the Tier-2 deep dive. Supported methods:

- **Manual select** — hand-pick tickets from the scan backlog.
- **Worst staleness first** — use the Tier-1 staleness ranking to pick the most-likely-stale first.
- **Oldest last-touched / last-scanned** — pick tickets not looked at in the longest.
- **Pick X** — take the top X by the chosen ordering.
- **Auto N/day (on/off toggle)** — *deferred to a later story.* Get manual selection working first, then
  add a background setting that auto-deep-scans ~10/day when enabled.

## Interface

- **Scan backlog view** — the control center: every eligible ticket with `lastScannedAt`, a column per
  topic score, an overall score, and current disposition. Sortable/filterable.
- **Selection + run controls** — queue a deep-dive batch using one of the selection methods; show batch
  progress and update last-scanned timestamps.
- **Review & disposition** — per-ticket score breakdown + assembled rationale; **Confirm** / **Dismiss
  (snooze)** with a cooldown so dismissed false positives don't keep reappearing.

## Data model (local-only on `ticketMetadata`, never synced to Jira)

- `scanScores` — JSON: per-topic scores + evidence (e.g. `supersededBy: "BT-123"`, matched keywords).
- `scanOverall` — combined deprecation-likelihood score.
- `scanRationale` — assembled human-readable "why this can probably go".
- `lastScannedAt` — drives rolling re-scan and the "oldest first" ordering.
- `lastDeepScannedAt` — separate from the cheap Tier-1 timestamp.
- `disposition` — `null | "candidate" | "dismissed" | "confirmed"`.
- `dispositionUntil` — dismiss cooldown.

Scan cursors/state in `app_setting` (same pattern as Jira sync watermark + the revalidation task).
Background batching reuses the lazy-cron scheduler (`src/lib/scheduler.ts`, `scheduled-tasks.ts`).
Tier-2 AI reuses the workspace agent (`find-related`, codebase-research) — no new AI infra.

## Proposed story breakdown

> Order roughly by dependency; each ships with co-located tests and passes lint/typecheck/test/build.

1. **BRDG-297 — Scan-state data model + Tier-1 staleness pass.** Schema fields above; the cheap local
   staleness scorer; rolling `lastScannedAt`. Foundation, no AI, no UI yet (or minimal).
2. **BRDG-283 — Scan backlog interface.** The list view: every eligible ticket, last-scan time, score
   columns, overall, disposition; sort/filter. Reads Tier-1 data.
3. **BRDG-284 — Deep-dive selection + batch orchestration.** Manual / worst-staleness / oldest /
   pick-X selection; background batched runner via the scheduler; progress + timestamps.
   (Auto N/day toggle deferred — see story 9.)
4. **BRDG-285 — Scoring topic: replaced / obsolete area.** Editable keyword list + AI confirmation.
5. **BRDG-286 — Scoring topic: duplication / superseded.** Reuse `find-related`; "superseded by BT-XXX".
6. **BRDG-287 — Scoring topic: already built.** Selective, throttled codebase-research check.
7. **BRDG-288 — Scoring topic: relevance decay.** AI judgement against product context.
8. **BRDG-289 — Review & disposition.** Score breakdown + rationale; confirm/dismiss + cooldown;
   activity-log + notifications.
9. **BRDG-290 — Auto background scanning (deferred).** On/off setting; auto ~N/day deep scans once
   manual flow is proven.

## Out of scope (epic-wide)

- Any write-back to Jira (deprecating/closing tickets is the PO's manual action, possibly a later story).
- New embedding/vector search infrastructure — reuse the existing keyword + `find-related` approach.
