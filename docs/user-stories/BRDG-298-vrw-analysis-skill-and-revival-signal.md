# BRDG-298 — VRW analyze-deprecation skill + revival signal

**Status:** Done
**Epic:** [Backlog Deprecation Review](../plans/2026-06-04-backlog-deprecation-review-epic.md)
**Type:** Story (two repos: VRW + Bridge)

## Problem

The epic's Tier-2 deep dive runs one workspace agent call per topic (replaced-area, superseded,
already-built, relevance-decay) using GENERIC skills (ask/investigate/find-related) with ad-hoc
prompts — up to four round-trips per ticket. Two gaps:

1. **No dedicated skill.** The deprecation analysis is spread across generic skills, so the prompts
   are duplicated and the gathering of signals (recent/active/planned sprints, codebase, product
   docs) is repeated per topic instead of done once.
2. **Only one direction.** The scan only ever concludes "this can probably go". It never spots the
   OPPOSITE: a ticket sitting low in the backlog that is still **high value** and a great fit for
   recent or planned/active sprint work — i.e. **worth pulling up** ("revival").

## Solution

### Part A — VRW skill (`analyze-deprecation`)

A new VRW skill, `.claude/skills/analyze-deprecation.md`, that takes a target ticket
(key + summary + description), gathers signals ONCE (Jira recent/open/future sprints, related
tickets, codebase, product docs), then scores every deprecation topic plus a revival assessment in a
single focused pass. It emits a parseable `<deprecation-analysis>` block (JSON body), mirroring
find-related's `<related-stories>` convention. Deprecated/Closed related tickets are capped like
find-related does.

### Part B — Bridge wiring + revival signal

- **Parser** (`src/lib/parse-deprecation-analysis.ts`): extracts the `<deprecation-analysis>` block,
  defaults missing fields, clamps scores to 0..1, never throws (null on absent/malformed block).
- **Consolidated analyzer** (`src/lib/deprecation-analyzer.ts`): submits the `analyze-deprecation`
  skill via `runAgentTaskToCompletion`, parses, and maps to the per-topic `scanScores` shape + a
  revival verdict. Skips fast when the agent is unconfigured.
- **runDeepScan** now PREFERS the consolidated analyzer (wired in `src/lib/topics/index.ts`). The
  existing per-topic scorers remain registered as the FALLBACK used when the analyzer is unavailable
  or returns nothing parseable. Nothing is deleted.
- **Revival data model**: `ticket_metadata.revival_score` (real, nullable) and
  `revival_rationale` (text, nullable); related keys stored in `scanScores.revival.evidence.relatedKeys`.
  Local-only, never synced to Jira. Migration `drizzle/0068_cheerful_mojo.sql`.
- **Revival notification**: when `revivalScore >= 0.6`, the deep-scan runner fires a distinct
  `revival-candidate` notification ("Backlog ticket worth pulling up: …"), separate from
  `deprecation-candidate`.
- **Direction reconciliation**: a winning revival (>= 0.6 and >= the deprecation score) suppresses
  the deprecation candidate promotion, so a ticket is a revival candidate INSTEAD OF a deprecation
  candidate (the two never double-fire). The skill is also instructed to keep the weaker direction's
  scores low, so this DB-side guard is a safety net.
- **/cleanup API**: each row now exposes `revivalScore` and `revivalRationale` (UI built separately).

## Implementation Plan

1. VRW: read find-related for conventions; write `analyze-deprecation.md`; commit in the VRW repo.
2. Bridge: add the parser + tests.
3. Bridge: add the consolidated analyzer + tests; wire it as primary in `topics/index.ts`.
4. Bridge: add `revival_score`/`revival_rationale` columns; generate migration.
5. Bridge: set revival fields in `runDeepScan`, reconcile direction, return new result fields.
6. Bridge: fire the `revival-candidate` notification in the deep-scan runner.
7. Bridge: extend `/cleanup` response + `cleanup-types.ts`.
8. Tests, lint, typecheck. Docs.

## Checklist

- [x] VRW `analyze-deprecation` skill with parseable `<deprecation-analysis>` block, committed in VRW
- [x] Parser `parse-deprecation-analysis.ts` (well-formed, missing fields, malformed -> safe)
- [x] Consolidated analyzer `deprecation-analyzer.ts` mapping incl. revival
- [x] `runDeepScan` prefers analyzer; per-topic scorers kept as fallback
- [x] `revival_score` + `revival_rationale` columns + migration `0068`
- [x] `runDeepScan` sets revival fields; reconciles deprecation-vs-revival direction
- [x] `revival-candidate` notification fires on threshold (0.6), distinct from deprecation
- [x] `/cleanup` exposes `revivalScore` + `revivalRationale`; `CleanupRow` extended
- [x] Tests: parser, analyzer mapping, runDeepScan revival + reconcile, runner notification, /cleanup
- [x] Existing topic tests stay green
- [x] `npm run lint` + `npm run typecheck` clean
- [x] Docs updated (workspace-integration, database-schema, this story, epic reference)

## Notes

- The consolidated analyzer is the primary path; per-topic scorers are intentionally kept as a
  graceful fallback (not removed) so the deep scan still works if the new skill is unavailable.
- Revival has no fallback path: it is an analyzer-only idea.
