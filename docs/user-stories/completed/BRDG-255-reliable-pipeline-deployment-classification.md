# BRDG-255: Reliable pipeline deployment classification

**Status:** Done
**Priority:** Medium
**Type:** Bug / Tech
**Source:** Found during BRDG-251 verification

## Description

As a Product Owner, I want every deployment pipeline run to be correctly flagged as a deployment, so that the sprint-board hover-card deploy badge (BRDG-251) and any other deployment-driven views reflect reality for all tickets, not just the ones that happened to be classified.

Today, deployment detection in `src/lib/pipeline-sync.ts` is unreliable. A run is flagged `isDeployment = true` only if, at ingest or state-transition time, a best-effort scan of its pipeline steps finds a `deploy`-named step matching an environment pattern. That scan is **capped at 5 runs per sync cycle** on both code paths, **swallows errors with no retry**, and is **never backfilled**. As a result, real deployments are silently missed.

### Evidence (from the local `sqlite.db`)

VPL-45794 — 7 runs, **none** flagged as a deployment despite two successful `staging/uat-2` runs:

| build | branch | state | is_deployment | env |
|-------|--------|-------|---------------|-----|
| 29663 | master | FAILED | 0 | |
| 29659 | | SUCCESSFUL | 0 | |
| 29610 | staging/uat-2 | SUCCESSFUL | **0** | |
| 29605 | | SUCCESSFUL | 0 | |
| 29602 | | FAILED | 0 | |
| 29601 | | FAILED | 0 | |
| 29596 | staging/uat-2 | SUCCESSFUL | **0** | |

VPL-45152 — an equivalent `staging/uat-2` run **was** flagged:

| build | branch | state | is_deployment | env |
|-------|--------|-------|---------------|-----|
| 25432 | staging/uat-2 | SUCCESSFUL | **1** | **UAT2** |
| (others) | master / uat-3 / … | mixed | 0 | |

Same branch/environment, different outcome — purely because detection ran for one and not the other. So this is a data-classification bug, not a rendering bug, and not a branch/environment difference.

### How `isDeployment` gets set (`src/lib/pipeline-sync.ts`)

- On insert, every run is created with `isDeployment: false, environment: null` (lines ~474-484).
- Deployment detection runs in two places, both of which fetch `/pipelines/{buildNumber}/steps` and set `isDeployment = true` only when a step matches:
  `step.name.toLowerCase().includes("deploy") && !step.name.includes("set build") && detectEnvironment(step.name)` (lines ~506 and ~559).
- `detectEnvironment` matches step names against `ENV_PATTERNS` (`prod`, `uat 1/2/3`, `staging`, `test`) (lines ~12-26).
- The `last-deployed` API (`src/app/api/pipelines/last-deployed/route.ts`) only returns runs WHERE `isDeployment = true AND ticketKey IS NOT NULL AND completedAt IS NOT NULL`.

## Root causes

1. **Per-cycle cap with no backfill.** Both detection paths process only `.slice(0, 5)` candidates per cycle (`pendingDeployDetection.slice(0, 5)` ~line 498; `candidates.slice(0, 5)` ~line 553); the remainder are never re-queued, so a burst of >5 completed runs silently drops the rest's classification.
2. **Errors swallowed.** The steps-API fetch is wrapped in `catch { /* best-effort */ }` with no retry — a transient Bitbucket error permanently leaves the run unclassified.
3. **No periodic backfill** re-scans completed, non-deployment runs to recover misses.
4. Runs inserted while `IN_PROGRESS` rely solely on the (capped) state-change path.

## Implementation Plan

1. **Extract detection into a pure classifier + thin orchestrator.** Add `classifyStepsForDeployment(steps)` (no I/O, exported) holding the single copy of the deploy-step + `ENV_PATTERNS` heuristic. Add `classifyRunDeployment(repoSlug, buildNumber, id)` that: re-reads the row and short-circuits if already `isDeployment=true` (idempotent, no fetch); fetches `/pipelines/{n}/steps`; on a thrown network error retries once; returns `flagged | not-deployment | transient-error`; only ever writes `isDeployment=true` (never false). Both the new-run path and `runDeployDetectionForStateChanges` call it.
2. **Remove the `.slice(0, 5)` caps.** Add a small `mapWithConcurrency(items, limit, fn)` worker-pool helper and process ALL candidates at concurrency 5 (matches prior effective in-flight cap, safe for Bitbucket rate limits). No silent drop.
3. **Bounded backfill `backfillDeploymentDetection()`.** Mirrors `backfillEnrichment`: re-scans completed (`SUCCESSFUL`/`FAILED`/`STOPPED`) `isDeployment=false` rows within the last N days (`createdAt >= cutoff`), batch limit 20, concurrency 5. Returns the count that flipped to flagged. Wired into `SyncResult.backfilledDeployments`, called at both `syncPipelines` return points, and added to the tick-route drain loop so it keeps running until 0.
4. **Retry = backfill as the safety net.** A transient steps-API failure leaves the run `isDeployment=false`, so the next backfill cycle re-queues it automatically (eventual retry, no per-run retry state). Plus a single in-cycle retry on network throw.
5. **Idempotency.** Detection short-circuits flagged rows (no API call, cheap); only writes `true`, never `false`; backfill WHERE excludes flagged rows. Re-runs are no-ops.
6. **Tests.** Unit tests for `classifyStepsForDeployment`; fetch-mocked integration tests for: >5 completed runs in one cycle all classified, backfill reclassifies a previously-missed deployment, backfill respects the N-day window, transient error retried (never written false), idempotent re-run does not re-fetch.
7. **VPL-45794 / env patterns.** Broaden the UAT patterns to tolerate `-`/`_` separators (`uat-2`) since step names may use them; this is the most likely cause of the historical miss. `ENV_PATTERNS` otherwise unchanged.

## Acceptance Criteria

- [x] Every completed pipeline run that is actually a deployment is flagged `isDeployment = true` with its `environment`/`environmentType`, regardless of how many completed runs arrive in a single sync cycle.
- [x] Remove or sufficiently raise the per-cycle `.slice(0, 5)` cap, OR queue the remainder so they are processed in subsequent cycles (no silent drop).
- [x] A backfill pass re-scans recent completed runs that are still `isDeployment = false` and classifies any that are deployments (covers historical misses like VPL-45794, and transient-error recoveries).
- [x] Transient steps-API failures are retried (or the run is re-queued) rather than permanently left unclassified.
- [x] Detection remains correct for already-classified runs (idempotent; no duplicate work, no flipping a true back to false).
- [~] After the fix, VPL-45794 shows its `staging/uat-2` deployment in the hover-card deploy badge. <!-- PREMISE CORRECTED: VPL-45794's staging/uat-2 runs (#29596/#29610, repo platform-microservices) have steps "build snapshot images" / "Release snapshot versions" with NO deploy step and NO env token, so they are genuinely NOT deployments. The original report assumed same-branch => same-deployment, but VPL-45152's flagged run is in a different repo (nx) with an actual "AWS Deployment" step. Detection is correct; flagging VPL-45794 would be a false positive. The genuine cap/backfill/retry defects were real and are fixed: the backfill recovered 116 previously-missed real deployments (45 -> 161 flagged). See docs/investigations/2026-06-02-vpl-45794-not-a-deployment.md. -->
- [x] Tests cover: >5 completed runs in one cycle all get classified; a backfill reclassifies a previously-missed deployment; a transient error is retried; classification is idempotent.

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
