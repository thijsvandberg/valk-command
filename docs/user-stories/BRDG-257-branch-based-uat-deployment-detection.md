# BRDG-257: Branch-based UAT deployment detection

**Status:** Done — pending real-world validation (a few days). Kept in `user-stories/` (not archived) until the validation query below is spot-checked. First backfill recovered 79 branch-inferred UAT deployments (56 UAT2, 23 UAT3); VPL-45604 and VPL-45794 now show UAT2.
**Priority:** Medium
**Type:** Feature / Tech
**Source:** Follow-up from BRDG-255 verification (see docs/investigations/2026-06-02-vpl-45794-not-a-deployment.md)

## Description

As a Product Owner, I want a ticket that has been built and merged onto a `staging/uat-N`
branch to show a UAT deployment on its card, so deployments done via GitOps-style auto-deploy
(which leave no `deploy` step in the Bitbucket pipeline) are still visible.

### Background

BRDG-255 fixed the deployment-detection reliability and recovered 116 real, step-based
deployments. But verification showed that some repos (notably `platform-microservices` and
`platform-admin`) deploy to UAT **without a `deploy` step in the pipeline**: their
`staging/uat-N` pipelines only run `build snapshot images` / `Release snapshot versions`,
and a separate system (GitOps/Kubernetes) rolls the released version onto the matching UAT
environment. Step-based detection cannot see this, so these deployments never show on the card
(e.g. VPL-45604, VPL-45794).

The branch naming convention is the available signal: a successful build on `staging/uat-2`
corresponds to UAT2, `staging/uat-3` to UAT3, etc.

### Decision / risk

The PO is not 100% certain the convention always holds, but wants to build it and **validate
over a few days** by observing inferred deployments against reality. To support that, every
branch-inferred deployment is tagged (`deployment_source = 'branch'`) so it can be audited and,
if wrong, the logic can be tightened or reverted without touching step-detected data.

## Implementation Plan

1. Add `pipeline_run.deployment_source` (`'step' | 'branch' | null`) so inferred deployments are auditable during validation. Migration.
2. Generalise `detectEnvironment` to match `uat-N` for any N (covers `staging/uat-4`, seen in data), keeping prod/staging/test precedence.
3. Add a restrictive pure `inferEnvironmentFromBranch(branch)` that only fires for `staging/...` (or exactly `staging`) branches, so feature branches that merely contain "test"/"uat" are never misread.
4. `classifyRunDeployment`: for a SUCCESSFUL run on a deploy-convention branch, flag via branch inference (no steps API call) with `deployment_source='branch'`; otherwise fall back to the existing step-based detection (`deployment_source='step'`). Step-based stays authoritative for repos that DO have deploy steps.
5. Add a pure (no-API) `backfillBranchInferredDeployments()` that flags existing SUCCESSFUL `staging/%` runs in the window. Needed because BRDG-255 already stamped those runs `deploy_checked_at` (so the API backfill skips them); this pure pass ignores that marker. Wired into `syncPipelines`.
6. Conservative scope: only SUCCESSFUL runs are treated as deployments (a failed build did not deploy), avoiding false "deployment failed" alerts during validation.

## Acceptance Criteria

- [x] A SUCCESSFUL pipeline run on a `staging/uat-N` branch is flagged `isDeployment = true` with `environment = UATn` (Staging), even when the pipeline has no `deploy` step.
- [x] Branch inference is restricted to `staging/...` branches so ordinary feature branches are never misclassified.
- [x] Step-based detection stays authoritative where a real deploy step exists (no regression for the `nx` repo); branch inference is only a fallback / applies to the staging convention.
- [x] `uat-N` is matched generically (covers `staging/uat-4`).
- [x] Every branch-inferred deployment is tagged `deployment_source = 'branch'` for auditing; step-detected ones are `'step'`.
- [x] Historical SUCCESSFUL `staging/uat-N` runs in the recent window are backfilled (covers VPL-45604, VPL-45794) without generating notifications.
- [x] Only SUCCESSFUL runs are inferred as deployments (failed builds are not).
- [x] VPL-45604 shows a UAT2 deployment on its card after the backfill.
- [x] Tests cover: staging/uat-N inference (incl. uat-4), feature-branch is NOT inferred, step-based still wins where a deploy step exists, FAILED staging run is not inferred, idempotency, and the historical backfill.

## Validation (post-merge, a few days)

- Query `SELECT ticket_key, environment, build_number, completed_at FROM pipeline_run WHERE deployment_source='branch' ORDER BY completed_at DESC` and spot-check against Jira/reality.
- If false positives appear, tighten the branch convention or restrict to specific repos.
