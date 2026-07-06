# BRDG-258: Validate branch-based UAT deployment detection

**Status:** Open — validation window
**Priority:** Medium
**Type:** Validation / Tech
**Source:** Follow-up to BRDG-257 (branch-based UAT deployment detection)

## Description

As a Product Owner, I want to confirm that the branch-based UAT deployments introduced in
BRDG-257 actually reflect reality, so I can trust the UAT deploy badge on the card before we
treat the heuristic as permanent.

BRDG-257 infers a UAT deployment from a successful build on a `staging/uat-N` branch (because
those repos auto-deploy via GitOps with no `deploy` step in the pipeline). The assumption
"successful build on `staging/uat-N` => live on UATn" was **not fully confirmed** with the dev
team; it was shipped to be validated by observation. Every inferred deployment is tagged
`deployment_source = 'branch'` precisely so it can be audited here.

## How to validate

Run over the validation window (a few days after BRDG-257 shipped, 2026-06-02):

```sql
SELECT ticket_key, repo, branch_name, environment, build_number, completed_at
FROM pipeline_run
WHERE deployment_source = 'branch'
ORDER BY completed_at DESC;
```

Spot-check a sample (start with recent ones, and the original examples VPL-45604 / VPL-45794)
against reality:

- Was the code from that run actually live on the stated UAT environment around `completed_at`?
- Cross-check with the dev team and/or the GitOps/Kubernetes deploy history for the repo.
- Confirm the environment number is right (branch `uat-2` -> actually UAT2, not a different env).

## Acceptance Criteria

- [ ] Confirm with the dev team that a successful build on `staging/uat-N` does deploy to UATn for the affected repos (`platform-microservices`, `platform-admin`, `nx`).
- [ ] Spot-check at least ~10 `deployment_source = 'branch'` runs (incl. VPL-45604, VPL-45794) against actual UAT state; record how many were correct.
- [ ] Confirm no false positives: a `deployment_source = 'branch'` run that was NOT actually deployed (e.g. a `staging/*` branch that does not auto-deploy, or a repo that does not follow the convention).
- [ ] Decision recorded (one of):
  - **Keep as-is** — convention holds; close.
  - **Tighten** — restrict branch inference to specific repos or branch patterns (raise a fix story).
  - **Revert** — convention does not hold; remove branch inference (the `deployment_source` tag makes branch-inferred rows easy to unflag).
- [ ] If kept, decide whether to keep the `deployment_source` column long-term or drop the validation tooling.

## Notes / rollback aid

Because branch-inferred deployments are tagged, reverting is surgical and does not touch
step-detected data:

```sql
-- Inspect before any change
SELECT COUNT(*) FROM pipeline_run WHERE deployment_source = 'branch';
-- Rollback (only if the decision is "revert")
-- UPDATE pipeline_run SET is_deployment = 0, environment = NULL, environment_type = NULL, deployment_source = NULL
-- WHERE deployment_source = 'branch';
```

Baseline at ship time (2026-06-02): 79 branch-inferred runs (56 UAT2, 23 UAT3); VPL-45604 and
VPL-45794 both show UAT2.

## Dependencies

- BRDG-257 (branch-based UAT deployment detection) — implements the behaviour under test.
