# VPL-45794 is not a deployment — BRDG-255 evidence correction

**Date:** 2026-06-02
**Context:** Verification of the BRDG-255 deployment-classification fix.

## Summary

BRDG-255 fixed real defects in deployment detection (per-cycle cap, no backfill,
swallowed errors). After the fix, a backfill recovered **116 previously-missed
deployments** (flagged count went 45 -> 161, full 14-day window drained).

However, the story's headline example — "VPL-45794 should show its `staging/uat-2`
deployment" — was based on a **false assumption** and is **not** a deployment.

## Evidence

Detection classifies a run as a deployment from its **pipeline step names**, not its
branch name. Actual steps fetched from Bitbucket:

VPL-45794 (#29596, #29610), repo `valk-platform-microservices`, branch `staging/uat-2`:
- `Build Node cache` (skipped)
- `Build Go cache` (skipped)
- `build snapshot images`
- `Release snapshot versions`

No `deploy` step, no environment token. These runs build and release snapshot images;
they do **not** deploy to an environment. Correctly classified as non-deployments.

VPL-45152 (#25432), repo `valk-nx`, branch `staging/uat-2` (this one *was* flagged UAT2):
- `Set build vars to UAT 2`
- `Build Node cache`, `Build`, `Build Storybook`
- `AWS Deployment`

Has an env token (`UAT 2`) and a deploy step (`AWS Deployment`) -> correctly flagged.

## Conclusion

The two runs share a branch name but live in **different repos with different pipeline
definitions**. The original bug report inferred "same branch => same deployment", which
does not hold. The classification difference was therefore correct on the merits, not
purely an artifact of the detection cap.

The genuine BRDG-255 defects (cap, backfill, retry) were real and are fixed; the fix is
validated by the 116 recovered real deployments. VPL-45794 is not among them by design.

## Follow-up consideration (not actioned)

If the product intent is to treat `staging/uat-*` *snapshot-build* runs in
`platform-microservices` as deployments, that is a **heuristic change** (branch-based or
repo-specific environment inference) and a separate decision — not a data-recovery bug.
Left for PO to decide; the current step-name heuristic is intentionally conservative to
avoid false-positive deploy badges.
