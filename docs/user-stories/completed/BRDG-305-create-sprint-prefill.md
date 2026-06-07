# BRDG-305: Prefill sprint name and start date on create

**Status:** Done
**Priority:** Medium

## Description

As a PO, when I open the Create Sprint modal I want the sprint name and start date already
filled in with sensible defaults, so I can create the next sprint in one click instead of
typing the name and picking dates by hand every time.

Today the modal opens empty. The end-date suggestion already exists (`sprintEndFromStart`:
start + 1 week, snapped to the first Thursday at 17:00), but the name and start date are not
prefilled.

## Behaviour

### Suggested sprint name

- Propose the next number in the regular sprint series: take existing sprint names that match
  the `PREFIX: <number>` shape (e.g. `BT: 138`, `BT: 139`), find the highest number, and
  suggest `PREFIX: <highest + 1>` (e.g. `BT: 140`).
- Only regular numeric sprints count. Ignore non-numeric / placeholder sprints such as
  `BT: TODO`, `BT: Backlog`, etc. when determining the next number.
- Use the prefix from the existing regular sprints (currently `BT`). Reuse the existing parsers
  rather than re-implementing: `extractTeamPrefix` (`src/lib/sprint-utils.ts`) and the
  sprint-number regex from `src/app/api/velocity/route.ts`.
- The suggested name is just a default in the editable field; the PO can still overwrite it.

### Suggested start date

- A sprint runs Friday through Thursday. The new sprint's start is the day after the previous
  sprint's end: take the latest regular sprint's end date (a Thursday) and add one day to get
  the Friday.
- "Latest regular sprint" = the regular numeric sprint with the highest number (the same one
  used to derive the next name), using its `endDate`.
- Prefill the start-date picker with that Friday. The existing end-date suggestion button then
  derives the matching end date from it (start + 1 week, snapped to Thursday 17:00), so the PO
  can accept end with one click.
- If no regular sprint with an end date exists, leave the start date empty (current behaviour).

## Implementation Plan

Shared series logic must be a single source of truth, since **BRDG-306** reuses the
regular-series number derivation. Number/name parsing lives in `sprint-utils.ts` (next to
`extractTeamPrefix`); date derivation lives in `sprint-dates.ts` (next to `sprintEndFromStart`).

1. **`src/lib/sprint-utils.ts`** — add pure, reusable series helpers:
   - `sprintNumber(name)`: `name.match(/[: ]\s*(\d+)/)` -> int or `Infinity` (moved verbatim from the velocity route, single source of truth).
   - `isRegularSprint(name)`: finite `sprintNumber` AND non-null `extractTeamPrefix` (excludes `BT: TODO`, `Backlog`, etc).
   - `latestRegularSprint(sprints)`: returns `{ prefix, number, sprint }` for the highest-numbered regular sprint (so callers can read its `endDate`), or `null`. Serves both BRDG-305 (next name + latest end) and BRDG-306 (highest number + prefix). Ties resolve to last-seen.
   - `nextSprintName(sprints)`: `"" ` when none, else `` `${prefix}: ${number + 1}` ``.
2. **`src/lib/sprint-dates.ts`** — add `startDateFromPreviousEnd(endIso)`: previous end (a Thursday ISO) + 1 day -> Friday in picker format `"YYYY-MM-DD"` (local-midnight, round-trips through `toIsoDateTime`/`toInputDateTime`); `""` when falsy/unparseable. Does not touch `sprintEndFromStart`.
3. **Refactor `src/app/api/velocity/route.ts`** to import `sprintNumber` from `sprint-utils` and delete its private copy (single source of truth, required by BRDG-306). `route.test.ts` guards against regression.
4. **`CreateSprintModal.tsx`** — add optional props `suggestedName?`, `suggestedStartDate?`; initialise `name`/`startDate` state from them. Existing `sprintEndFromStart(startDate)` then drives the end-date suggestion off the prefill. Fields stay editable.
5. **`SprintBoard.tsx`** — `useMemo` over `sprints` to compute `suggestedName = nextSprintName(sprints)` and `suggestedStartDate = startDateFromPreviousEnd(latestRegularSprint(sprints)?.sprint.endDate)`; pass as props. The synthetic `__backlog__`/`Backlog` entry is excluded automatically (no prefix).
6. **Tests** — extend `sprint-utils.test.ts` (number parse, regular predicate, latest/next derivation, placeholder exclusion, prefix-from-data, fallbacks), `sprint-dates.test.ts` (Thursday end -> Friday, round-trip, fallbacks), `CreateSprintModal.test.tsx` (prefilled fields, editable, empty-prop fallback, end-suggestion off prefill).

## Acceptance Criteria

- [x] Opening Create Sprint prefills the name field with the next number in the regular series
      (e.g. existing `BT: 138`, `BT: 139` -> suggests `BT: 140`)
- [x] Placeholder / non-numeric sprints (`BT: TODO`, etc.) are excluded from the next-number calculation
- [x] The prefix is taken from existing regular sprints, not hardcoded
- [x] Start date is prefilled with the day after the latest regular sprint's end date (Friday)
- [x] Existing end-date suggestion still works off the prefilled start date
- [x] Both prefilled fields remain fully editable; PO can overwrite before creating
- [x] Graceful fallback when no regular sprints exist (empty name suggestion is acceptable) and
      when the latest regular sprint has no end date (empty start date)
- [x] Tests for: next-number derivation (including placeholder exclusion and prefix detection),
      start-date = latest-end + 1 day, and fallbacks

## Technical Notes

- Pass the sprints list (already available in `SprintBoard.tsx`) into
  `CreateSprintModal` as suggested defaults, or compute `suggestedName` / `suggestedStartDate`
  in the parent and pass them as props. Initialise the modal's `name` / `startDate` state from
  those props.
- Put the pure derivation logic in `src/lib/sprint-dates.ts` (or `sprint-utils.ts`) so it is
  unit-testable in isolation, alongside the existing `sprintEndFromStart`.
- Reuse existing name parsers; do not add new sprint storage or infrastructure.
- Date handling: keep using the picker format and `toIsoDateTime` for storage; anchor the
  start Friday to local midnight (consistent with the time-less date handling in
  `sprint-dates.ts`).

## Out of Scope

- Changing how the end date is computed (already implemented).
- Auto-creating the sprint without PO confirmation.
