# BRDG-488: Simplify Epic Writer phases (drop Refine, rename Detail -> Refine)

**Status:** Done
**Priority:** Medium

## Status

Shipped 2026-07-06. The rail is now five steps (Feed/Discovery/Breakdown/Refine/Sprints). The old bullets-only `refine` step was dropped and the full-detail `detail` step was renamed to `refine` (key == label). Migration `0093` maps old `refine` -> `breakdown` and old `detail` -> `refine` (ordered so renamed rows are not re-caught); it applied cleanly on boot (the one `detail` session moved to `refine`). The `<story-detail>` skill gate and the per-card Deepen action now fire on `refine`; `epicPhaseUsesBreakdownSkill` still covers the whole breakdown family, so BRDG-479's fresh-session breakdown dispatch is untouched. Verified E2E on epic VPL-47279 (rail shows exactly the five steps, no console errors). Lint, typecheck, full test suite, and build all green.

## Description

As the PO, I want fewer, clearer Epic Writer phases. The separate "Refine" (add bullets) step is redundant because a breakdown turn already produces titles **and** bullets. So drop the current Refine phase and rename the current "Detail" step to "Refine" (it sounds better for that step).

Result — the phase rail goes from 6 to **5**:

`Feed · Discovery · Breakdown · Refine · Sprints`

The two work-out steps are:
- **Breakdown** = story titles + bullets (unchanged; already emits both).
- **Refine** (renamed from "Detail") = work out the detail: full description + acceptance criteria.

So the old separate "Refine" (add bullets) step is dropped - bullets live in Breakdown - and today's "Detail" step is what gets renamed to "Refine".

Related: [BRDG-291], [BRDG-484](completed/BRDG-484-epic-writer-layout-navigation.md), the phase-level behaviour in [BRDG-479](completed/BRDG-479-epic-writer-advance-to-breakdown.md).

## Current behaviour (for reference)

- Phases: `feed, discovery, breakdown, refine, detail, sprints` (`src/types/epic-writer.ts`).
- The skill works out full body + AC only when `phase === "detail"` (the `STORY_DETAIL_INSTRUCTION` gate in `src/lib/story-writer-messages.ts`, lines ~397 and ~553). `epicPhaseUsesBreakdownSkill` (line ~336) lists `detail`.
- `EpicWriterLayout.tsx` `handleSelectPhase` maps phases to the right-hand view.

## In Scope

- Remove `refine` from `EPIC_WRITER_PHASES`; rename the full-detail step so the PO sees **"Refine"**.
  - Recommended: rename the phase KEY `detail` -> `refine` (so key == label, no confusing "detail key labelled Refine"), and drop the old `refine`. Update `EPIC_WRITER_PHASE_LABELS`, `isEpicWriterPhase`, `epicPhaseUsesBreakdownSkill`, and the two `phase === "detail"` gates to `"refine"`.
  - Update `handleSelectPhase` phase->view mapping in `EpicWriterLayout.tsx`.
  - The per-card "Deepen" action (which forces the full-detail phase) must target the new `refine` phase.
- Data migration for existing sessions so no active session is left on a removed phase value (which would fail `isEpicWriterPhase` and silently fall back to `feed`):
  - old `detail` -> new `refine` (same step, new name)
  - old `refine` -> `breakdown` (the bullets step folds back into breakdown)

## Out of Scope

- Any other phase behaviour change (Discovery/Feed/Sprints unchanged).
- The other Epic Writer polish (BRDG-487) and the sprint tab (BRDG-486).

## Acceptance Criteria

- [x] The phase rail shows 5 steps: Feed, Discovery, Breakdown, Refine, Sprints.
- [x] The new "Refine" step drives the full body + AC behaviour that "Detail" used to (skill still emits `<story-detail>`), and the "Deepen" card action lands there.
- [x] Existing active sessions on old `detail`/`refine` are migrated and open on a valid phase (no fallback-to-Feed surprise).
- [x] No lingering references to a `detail` phase key or the old `refine` step in code, labels, or docs.
- [x] New/changed behaviour is covered by tests; `npm run test` and `npm run build` pass.
