# BRDG-269: Attribute UAT deploys to every ticket in the deployed range

**Status:** Open
**Priority:** Medium
**Type:** Bug / Tech
**Source:** Follow-up to BRDG-257 (branch-based UAT deployment detection) and BRDG-258 (validation)

## Description

As a Product Owner, I want the UAT deploy badge to appear on **every** ticket whose code is live on
a UAT environment, so I can trust the absence of a badge to mean "not deployed" rather than "deployed
but not detected".

Today the deploy badge is missing for tickets that are genuinely on UAT. Deployment attribution is
**per triggering commit**: a successful `staging/uat-N` build produces exactly one `pipeline_run`
row, and the ticket key is read from the single commit that triggered that build. When several
feature branches are merged into `staging/uat-N` in quick succession, Bitbucket only builds the
newest head, so every ticket merged in between is deployed but never gets a row, and therefore no
badge.

### Worked example (the bug that surfaced this)

VPL-45823 ("Hide extra from previously booked extras in upsell app") is live on UAT2 but shows no
deploy badge. Timeline on `staging/uat-2` (repo `platform-microservices`, 2026-06-02):

| Time | Commit | What it is | Build |
|------|--------|------------|-------|
| 14:05:43 | `306a56c91` | `[VPL-45729] Fixed facility-service-client test` | #29698 |
| 14:08:25 | `2fd4d6e8d` | `Merge 'feature/VPL45823-...' into staging/uat-2` | **none** |
| 14:09:34 | `754c9c42c` | `Merge 'feature/VPL-46189-...' into staging/uat-2` | #29702 -> tagged UAT2 / **VPL-46189** |

The VPL-45823 merge commit `2fd4d6e8d` never got its own pipeline build; the next merge (VPL-46189,
~70s later) became the branch head and its build #29702 was the only deploy recorded. That build is
attributed solely to VPL-46189, so VPL-45823 (swept into the same deploy) gets no `pipeline_run`
row and no badge. PR #2548 (feature -> master) is still open; the change reached UAT by a direct
merge of the feature branch into `staging/uat-2`.

### Secondary contributor: hyphenless branch names

Even if `2fd4d6e8d` *had* triggered its own build, the branch is named `feature/VPL45823-...`
(no hyphen). The current key extractor `/([A-Z][A-Z0-9]+-\d+)/` requires the hyphenated `VPL-45823`,
so it would not have matched `VPL45823` and the deploy would still be unattributed. Verified.

### Relationship to BRDG-258

BRDG-258 validates **false positives** (badge shown when not really deployed). This is the
**false-negative twin**: deployed but no badge. Fixing one does not address the other.

## Proposed approach

1. **Range-based attribution.** When a `staging/uat-N` build is flagged as a deployment, attribute
   it to **all ticket keys in the commit range newly reachable on the branch since the previous
   successful deploy build on that branch** (not only the triggering commit). Populate
   `ticket_keys` for the run and make `last-deployed` consult `ticket_keys`, not only the single
   `ticket_key`. This catches tickets whose intermediate merge commits never got their own build.
2. **Hyphen-tolerant key extraction.** Match `VPL45823` (and similar concatenated forms) and
   normalise to the canonical `VPL-45823`. Acts as a safety net for non-conforming branch names.

Decide whether to emit deploy **notifications** for the newly attributed tickets or only show the
badge. Recommendation: badge only for range-attributed tickets to avoid notification noise; keep
notifications tied to the triggering commit's ticket as today.

## Implementation Plan

Resolved design decisions (ambiguities from planning closed out):

1. **Schema (one migration).** Add two nullable columns to `pipeline_run` in `src/db/schema.ts`:
   `commit_hash` (anchors the commit-range walk) and `range_attributed_at` (idempotency/forward-
   progress marker, mirrors the `deploy_checked_at` pattern). Generate via `npm run db:generate`.
   Populate `commitHash` from `pipeline.target.commit.hash` on insert in `syncPipelines` and in
   `backfillEnrichment`.
2. **Hyphen-tolerant extraction (`pipeline-sync.ts`).** Keep the existing general hyphenated regex
   `/([A-Z][A-Z0-9]+-\d+)/g` unchanged (so any project key and `VPL-46189` still match — AC4/AC5).
   Add a conservative hyphenless net restricted to known active prefixes
   (`VPL|SDESK|VDVF|FPL|PL`), word-boundary anchored, normalising `VPL45823` -> `VPL-45823`. The
   allowlist avoids misreading arbitrary tokens (`UTF8`, `S3`). Export `extractTicketKey` /
   `extractAllTicketKeys` for unit tests.
3. **Range attribution (`pipeline-sync.ts`).** New `attributeDeployRange(repoSlug, runId)`: only for
   `staging/uat-*` deploy rows. Resolve the deploy head commit (`run.commitHash`, fetched via
   `/pipelines/{n}` if missing), find the previous successful deploy on the same repo+branch as the
   stop anchor (`prevRun.commitHash`), walk `/commits/{head}` (bounded by a page/commit cap), collect
   ticket keys from each commit message (+ merge source branch), union with the run's existing
   `ticketKey`/`ticketKeys`, write back `ticketKeys`, and stamp `rangeAttributedAt`. Idempotent: skip
   when already stamped. If no previous anchor (first deploy on the branch), attribute only the head
   commit's keys. `ticketKey` (primary) is never changed.
4. **Backfill pass.** New `backfillDeployRangeAttribution()`: bounded selection of recent
   `staging/uat-%` deploys with `range_attributed_at IS NULL`, calls `attributeDeployRange` per row.
   Wired into `syncPipelines` next to `backfillBranchInferredDeployments` (both the empty and main
   branches). This is what range-attributes VPL-45823 on resync (AC3).
5. **`last-deployed` route.** Also select and parse `ticketKeys`; emit one map entry per key
   (primary + range-attributed), preserving the first-wins latest-per-ticket dedupe. No
   hook/component/type change (`useLastDeployed` shape is unchanged; consumers key by `ticket.key`).
6. **Notifications.** No change — `processStateChanges` notifies only on the single `ticketKey`, so
   range-attributed keys in `ticketKeys` are inherently badge-only (AC7).

Implementation order: (2) extraction -> (1) schema+migration+commitHash wiring -> (3) range
attribution -> (4) backfill+wiring -> (5) route -> tests throughout.

## Acceptance Criteria

- [x] A `staging/uat-N` deploy build attributes its environment to every ticket key found in the
      newly-reachable commit range since the previous successful deploy build on that branch.
- [x] `last-deployed` returns a deployment for a ticket whose key appears in `ticket_keys` (not only
      the primary `ticket_key`).
- [x] VPL-45823 shows a UAT2 deploy badge after a resync (verify against the example above).
      <!-- Mechanism verified by the backfillDeployRangeAttribution test (VPL45823 swept into a
      bundled staging/uat-2 deploy is range-attributed); badge then surfaces via last-deployed
      reading ticket_keys. The live resync runs on the next pipeline sync tick. -->
- [x] VPL-46189 (the triggering ticket) still shows its UAT2 badge — no regression.
- [x] Hyphenless branch keys (`VPL45823`) are extracted and normalised to `VPL-45823`.
- [x] No new false positives: a feature-branch CI build (not on `staging/uat-N`) still produces no
      deploy badge.
- [x] Range attribution does not flood notifications (badge-only for range-attributed tickets,
      unless a different decision is recorded here).
- [x] Tests cover: multi-merge range attribution, hyphenless key extraction, `last-deployed`
      reading `ticket_keys`, and the no-false-positive case.

## Notes / implementation pointers

- Detection + attribution: `src/lib/pipeline-sync.ts`
  (`classifyRunDeployment`, `inferEnvironmentFromBranch`, `extractTicketKey`,
  `backfillBranchInferredDeployments`).
- Badge read path: `src/app/api/pipelines/last-deployed/route.ts` (currently dedupes on
  `ticket_key` only) and `useLastDeployed` in `src/hooks/usePipelines.ts`.
- Badge render: `src/components/shared/TicketStatusPill.tsx` (`data.lastDeploy`).
- The commit range can be derived from the Bitbucket commits API on the staging branch between the
  current and previous deploy build target commits.

## Dependencies

- BRDG-257 (branch-based UAT deployment detection) — the behaviour being extended.
- BRDG-258 (validation) — the false-positive counterpart; keep both in mind when tuning.
