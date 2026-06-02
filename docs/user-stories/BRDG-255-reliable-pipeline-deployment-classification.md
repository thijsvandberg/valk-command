# BRDG-255: Reliable pipeline deployment classification

**Status:** Draft
**Priority:** Medium
**Type:** Bug / Tech
**Source:** Found during BRDG-251 verification (see `docs/investigations/2026-06-02-pipeline-deployment-classification-gap.md`)

## Description

As a Product Owner, I want every deployment pipeline run to be correctly flagged as a deployment, so that the sprint-board hover-card deploy badge (BRDG-251) and any other deployment-driven views reflect reality for all tickets, not just the ones that happened to be classified.

Today, deployment detection in `src/lib/pipeline-sync.ts` is unreliable. A run is flagged `isDeployment = true` only if, at ingest or state-transition time, a best-effort scan of its pipeline steps finds a `deploy`-named step matching an environment pattern. That scan is **capped at 5 runs per sync cycle** on both code paths, **swallows errors with no retry**, and is **never backfilled**. As a result, real deployments are silently missed.

### Evidence

VPL-45794 has two successful `staging/uat-2` runs but **none** flagged as deployments, so it shows no deploy badge. VPL-45152 has an equivalent `staging/uat-2` run that **was** flagged (`UAT2`). Same branch/environment, different outcome — purely because detection ran for one and not the other. Full evidence in the investigation doc.

## Root causes (from investigation)

1. Both detection paths process only `.slice(0, 5)` candidates per cycle; the remainder are never re-queued.
2. The steps-API fetch is wrapped in `catch { /* best-effort */ }` with no retry.
3. No periodic backfill re-scans completed, non-deployment runs.
4. Runs inserted while `IN_PROGRESS` rely solely on the (capped) state-change path.

## Acceptance Criteria

- [ ] Every completed pipeline run that is actually a deployment is flagged `isDeployment = true` with its `environment`/`environmentType`, regardless of how many completed runs arrive in a single sync cycle.
- [ ] Remove or sufficiently raise the per-cycle `.slice(0, 5)` cap, OR queue the remainder so they are processed in subsequent cycles (no silent drop).
- [ ] A backfill pass re-scans recent completed runs that are still `isDeployment = false` and classifies any that are deployments (covers historical misses like VPL-45794, and transient-error recoveries).
- [ ] Transient steps-API failures are retried (or the run is re-queued) rather than permanently left unclassified.
- [ ] Detection remains correct for already-classified runs (idempotent; no duplicate work, no flipping a true back to false).
- [ ] After the fix, VPL-45794 shows its `staging/uat-2` deployment in the hover-card deploy badge.
- [ ] Tests cover: >5 completed runs in one cycle all get classified; a backfill reclassifies a previously-missed deployment; a transient error is retried; classification is idempotent.

## Technical Notes

### Affected files

| File | Likely change |
|------|---------------|
| `src/lib/pipeline-sync.ts` | Remove/raise the `.slice(0, 5)` caps; add a backfill scan over recent `isDeployment = false` completed runs; add retry/re-queue on steps-API failure. |
| `src/app/api/pipelines/tick/route.ts` (or the scheduler entry) | Likely host for a periodic backfill pass. |
| Tests co-located with the sync | New cases per the acceptance criteria. |

### Constraints / considerations

- Bitbucket API rate limits: a backfill must be bounded (e.g. only re-scan runs from the last N days, batch with a sane concurrency) rather than re-scanning everything every tick.
- Keep detection idempotent and cheap for runs already flagged.
- The environment patterns (`ENV_PATTERNS`) and the `deploy`-step heuristic are unchanged unless investigation shows a step-naming mismatch is also at play.

## Dependencies

- Surfaces in BRDG-251 (hover-card deploy badge) — that story is correct; this fixes the underlying data.
