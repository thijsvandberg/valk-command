# BRDG-250: Epic Color Management

**Status:** Draft
**Priority:** Medium
**Type:** Feature
**Related:** [[BRDG-044]] (Epic Progress View), [[BRDG-254]] (Epic Team Assignment — shares the per-epic metadata store), BRDG-131 (Epic Detail Interaction)

## Description

As the PO, I want to assign and manage a distinct color per epic, so that epics are visually recognizable and consistent everywhere they appear in Bridge: the epic overview (BRDG-044), the sprint board epic pills, the epic picker, and the stakeholder epic filter chips.

Today every epic is rendered with a single shared color token (`--color-icon-epic`), so epics are indistinguishable from one another at a glance. The goal of this story is a PO-managed color per epic that is reused across the app.

## Context

- Epics are not a first-class entity in the database: tickets carry `epic` (name) and `epicKey` (e.g. `VPL-21150`) as plain text columns (`src/db/schema.ts`). There is no epic table and therefore nowhere to store a per-epic color today.
- All epic UI currently uses the single `--color-icon-epic` token (see `EpicPicker.tsx`, `EpicFilterChips.tsx`). There is no per-epic color anywhere.
- Jira epics have a native color attribute. We can optionally read it during the existing epic sync (`/api/jira/sync-epics`) as a sensible default, but the PO must be able to override it in Bridge.
- This is the PO metadata layer: the color is Bridge-owned and is **not** written back to Jira.

## Implementation Plan

**Placement decision:** the color control lives in the Epic Overview row (`EpicRow.tsx`) next to the existing `EpicTeamPicker`, mirroring BRDG-254.

### A. Architecture — how a stored color reaches every `getEpicColor` call site
`getEpicColor(epic)` in `src/types/ticket.ts` is a pure sync function called by-name in ~10 components. Stored colors are keyed by `epicKey` and loaded async via SWR. Chosen approach: a **module-level override registry backed by `useSyncExternalStore`** (`src/lib/epic-color-registry.ts`). `getEpicColor` consults the registry first (by key, then by upper-cased name), else falls back to the curated `EPIC_COLORS` map, else `generateEpicColor`. A provider loads the color map from `/api/epics/progress` and pushes it into the registry. The four named surfaces use a reactive `useEpicColor(keyOrName)` hook so they update when the PO changes a color; other call sites get the correct value on their next render. Return shape widens from `{bg,text}` to `{bg,text,border}` (additive).

### B. Curated palette
~9 accessible base hexes in `src/lib/epic-palette.ts`, avoiding status colors (done-green, in-progress/brand blue/teal, todo-grey). Variants derive via `color-mix`: `bg = color-mix(in srgb, base 14%, transparent)`, `border = ...35%...`, `text` pulled toward `--color-text-primary` for contrast in both themes.

### C. Phase 1 — store
1. Add nullable `color` column to `epicMetadata` (`src/db/schema.ts`). 2. `npm run db:generate` migration (auto-applies). 3. `getEpicColorMap(keys)` + `sanitizeColor` in `src/lib/epic-metadata.ts`. 4. Attach `color` to `EpicProgressItem` in `src/app/api/epics/progress/route.ts`.

### D. Phase 2 — manage
5. New `src/app/api/epics/[key]/color/route.ts` (GET+PUT, zod, `sanitizeColor`, upsert, invalidate progress cache). 6. `epics.setColor` in `api-client.ts`. 7. `useSetEpicColor()` in `useEpics.ts` (optimistic registry override + SWR patch). 8. New `EpicColorPicker.tsx` (palette swatches + reset, portal popover, guardrail states). 9. Wire into `EpicRow.tsx`.

### E. Phase 3 — apply
10. Mount `EpicColorProvider` in `(app)` layout + stakeholder tree. 11. `EpicRow` → `useEpicColor(epic.key)`. 12. `BoardRow` epic pill → `useEpicColor(ticket.epic)`. 13. `EpicPicker` swatch dots. 14. `EpicFilterChips` chip colors via `useEpicColor(name)`.

### F. Tests
Route test, lib (`getEpicColorMap`/`sanitizeColor`) test, resolver/registry test, `useSetEpicColor` hook test, `EpicColorPicker` component test, progress-route color test.

### G. Order
schema+migration → palette+lib → progress API → color route+client → registry+`getEpicColor` refactor → hooks+picker+wire → provider+surface swaps → validate-ui contrast pass.

## Acceptance Criteria

### Phase 1: Store a color per epic
- [x] A place to persist a Bridge-owned color keyed by `epicKey` (e.g. a small `epic_metadata` table, mirroring the existing PO-metadata pattern). No change to Jira.
- [x] A default color is derived when none is set (either from the Jira epic color if synced, or a deterministic color derived from the epic key so it is stable across reloads).

### Phase 2: Manage the color in the UI
- [x] A color control where the PO assigns/changes an epic's color (a small curated palette, not a free-form hex picker, to keep colors on-brand and accessible).
- [x] Reachable from a sensible place: the epic overview (BRDG-044) row and/or the epic picker. Confirm placement before building.
- [x] Clear/reset to default option.
- [x] Control follows the UI guardrails: hover / focus-visible / active states, `cursor: pointer`.

### Phase 3: Apply the color everywhere epics appear
- [x] Epic pills on the sprint board use the epic's color.
- [x] Epic picker rows / selected value reflect the color.
- [x] Stakeholder epic filter chips (`EpicFilterChips.tsx`) reflect the color.
- [x] Epic overview progress bars / labels (BRDG-044) use the color.
- [x] Colors meet contrast requirements in both light and dark themes (derive subtle/strong variants via `color-mix`, consistent with current token usage).

## Technical Notes
- Reuse the design-token approach: store a base color and derive subtle/border/text variants via `color-mix`, rather than hardcoding multiple shades per epic.
- Curated palette keeps things accessible and avoids clashing with status colors (done/in-progress/todo) used in BRDG-044 progress bars.
- Caching: epic color map can be fetched once and reused (SWR), refreshed on epic sync.

## Out of Scope
- Creating or editing epics from Bridge (epic creation stays in Jira).
- Writing the color back to Jira.
- Per-epic icons (color only for now).
