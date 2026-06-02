# Pipeline deployment classification gap (2026-06-02)

## Trigger

While verifying BRDG-251 (pipeline/deploy badges on the sprint-board hover card), the PO noticed ticket **VPL-45794** shows a pipeline-health badge but **no deploy badge**, even though its Pipeline History contains successful runs on `staging/uat-2`. Another ticket, **VPL-45152**, does show a deploy badge (`UAT2`).

## How the deploy badge is fed

`/api/pipelines/last-deployed/route.ts` returns the latest `pipelineRun` per ticket WHERE:

```
isDeployment = true AND ticketKey IS NOT NULL AND completedAt IS NOT NULL
```

So a ticket only gets a deploy badge if at least one of its pipeline runs is flagged `isDeployment = true`.

## Evidence from the local DB (`sqlite.db`)

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

VPL-45152 — one `staging/uat-2` run **was** classified:

| build | branch | state | is_deployment | env |
|-------|--------|-------|---------------|-----|
| 25432 | staging/uat-2 | SUCCESSFUL | **1** | **UAT2** |
| (others) | master / uat-3 / … | mixed | 0 | |

Both tickets have successful `staging/uat-2` runs, so **the branch/environment is not the differentiator** — VPL-45152's uat-2 run got deployment detection applied; VPL-45794's two uat-2 runs did not.

## How `isDeployment` gets set (`src/lib/pipeline-sync.ts`)

- On insert, every run is created with `isDeployment: false, environment: null` (lines ~474-484).
- Deployment detection runs in two places, both of which fetch `/pipelines/{buildNumber}/steps` and set `isDeployment = true` only when a step matches:
  `step.name.toLowerCase().includes("deploy") && !step.name.includes("set build") && detectEnvironment(step.name)` (lines ~506 and ~559).
- `detectEnvironment` matches step names against `ENV_PATTERNS` (`prod`, `uat 1/2/3`, `staging`, `test`) (lines ~12-26).

## Root causes (systemic, not data)

1. **Per-cycle cap with no backfill.** Both detection paths process only `.slice(0, 5)` candidates per sync run:
   - new completed pipelines: `pendingDeployDetection.slice(0, 5)` (line ~498)
   - state changes IN_PROGRESS→done: `candidates.slice(0, 5)` (line ~553)
   Any completed run beyond the first 5 in a cycle is **never** queued again — it permanently stays `isDeployment = false`. A sync that ingests a burst of >5 completed runs silently drops the remainder's classification. This is the most likely reason VPL-45794's uat-2 runs were missed while VPL-45152's single run (in a quieter cycle) was caught.

2. **Errors are swallowed with no retry.** The steps-API fetch is wrapped in `catch { /* best-effort */ }`. A transient Bitbucket error means that run never gets re-checked.

3. **Detection only fires at ingest/transition time.** There is no periodic backfill that re-scans completed, non-deployment runs, so anything missed by (1) or (2) is never recovered.

4. **`IN_PROGRESS` insert path.** Runs inserted while IN_PROGRESS are only queued via the state-change path; if that path's 5-cap misses them, they are never detected.

## Conclusion

VPL-45794's missing deploy badge is **correct given the data** (no run is flagged `isDeployment`), but the data is **wrong**: its `staging/uat-2` deployments were never classified because deployment detection is best-effort, capped at 5 per cycle, and never backfilled. The hover-card rendering (BRDG-251) is not at fault.

Follow-up: **BRDG-255** — make deployment classification reliable (backfill + remove/raise the cap + retry on transient failures).
