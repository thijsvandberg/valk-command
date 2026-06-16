# BRDG-346: Configurable Backlog Drop Target

**Status:** Done
**Priority:** Medium
**Type:** Feature

## Description

As a Product Owner, I want to choose which team backlog the sprint board's "Backlog" drop tile sends tickets to, so that drag-and-drop to the backlog works for my team (and not just a hard-coded one).

The sprint board shows a leading "Backlog" drop tile in the drag-overlay bar. Dropping a ticket there should move it into a real **team backlog sprint** (e.g. `BT: Backlog`, `GXP: Backlog`), which in Jira is an ordinary sprint with a numeric id, not the generic sprint-less project backlog. Today the target team is hard-coded to `BT: Backlog` (see Context). For a multi-team board (BT, GXP, HT, BO, Design, Signage) every other team's PO drops into the wrong place. This story replaces the hard-coded constant with a user setting.

## Background

This story follows the bugfix where the backlog drop tile was wired to the generic `__backlog__` (sprint-less) target — dropping there stripped the ticket's sprint and dumped it in the project-wide backlog instead of the team backlog sprint. That fix pointed the tile at the real `BT: Backlog` sprint via a hard-coded constant:

- `src/components/sprint-board/SprintBoardDragDrop.tsx` — `BACKLOG_DROP_SPRINT_NAME = "BT: Backlog"`, resolved against the `sprints` list inside `SprintDropZoneBar`. This constant is the single point this story turns into a setting.

## Context

- **Where the target is chosen:** `SprintDropZoneBar` in `src/components/sprint-board/SprintBoardDragDrop.tsx` resolves `backlogSprint` by matching `BACKLOG_DROP_SPRINT_NAME` against the passed `sprints`, falling back to `__backlog__`.
- **The drop handler is already target-agnostic:** `src/components/sprint-board/useSprintBoardDragDrop.ts` (`handleBoardDragEnd`, the `sprint-slot:` branch) just reads whatever sprint id the tile carries and calls `jira.moveSprint`. No change needed there.
- **Backlog sprints are recognised by name:** `isBacklogSprintName` in `src/lib/sprint-utils.ts` matches names ending in "Backlog" (`BT: Backlog`, `GXP: Backlog`, plain `Backlog`). The team prefix can be extracted with `extractTeamPrefix` (same file).
- **Settings storage (use the account-scoped foundation):** persist this preference in the per-account `userSetting` store introduced by [BRDG-343](BRDG-343-account-scoped-saved-views.md), so the chosen backlog target lives in the **user table** and follows the PO's Clerk account across browsers/ports/devices — not in the global `appSetting` table. Add a route via `createUserJsonSettingRoute` (e.g. key `sprint_board_backlog_drop_target`) and read it client-side with `useAccountSetting`. Mirror BRDG-187's settings **UI** placement, but not its global-`appSetting` storage.
- **Available backlog sprints come from** the live sprints list (`useJiraSprints`), already passed into the board.

## Decision (resolved)

**Approach 1 — explicit setting.** This is a **default backlog** setting: a single configured team backlog (a dropdown of all `*: Backlog` sprints) that the drop tile always uses. The PO sets it once via settings; the tile always targets that backlog. Simple and predictable, matching the current fixed behaviour but configurable per account.

Rejected: team-aware (automatic) and the hybrid. The PO wants one explicit, adjustable default rather than context-derived behaviour.

## Implementation Plan

Decisions baked in: the setting stores a **sprint name** (string), not a numeric id, so it survives Jira re-creating the backlog sprint with a new id and resolves by name exactly like today. Default value `"BT: Backlog"` preserves current BT behaviour. `SprintDropZoneBar` gains one `backlogTargetName` prop (resolution stays in the component, target is injected) so it stays testable without hook mocking. The drop handler (`useSprintBoardDragDrop.ts`) and move route are untouched.

1. **API route (new):** `src/app/api/settings/backlog-drop-target/route.ts` — mirror `saved-views/route.ts`: `createUserJsonSettingRoute("sprint_board_backlog_drop_target", z.string().max(200), "BT: Backlog")`. (Verified: `createUserJsonSettingRoute` returns the string default on an unset GET.)
2. **Client hook (new):** `src/hooks/useBacklogDropTarget.ts` — thin wrapper over `useAccountSetting<string>("/api/settings/backlog-drop-target", "BT: Backlog")`, returning `{ backlogTargetName, setBacklogTargetName, isLoading }`.
3. **`SprintBoardDragDrop.tsx`:** delete the hard-coded `BACKLOG_DROP_SPRINT_NAME`; add `backlogTargetName: string` prop to `SprintDropZoneBar`; resolve `backlogSprint = sprints.find(s => s.name === backlogTargetName)` with **no `__backlog__` fallback** (the existing `{backlogSprint && ...}` guard then hides the tile when the configured name is absent → graceful degradation). Label/numeric-id targeting already correct via `SprintDropTile`.
4. **`SprintBoard.tsx`:** read `const { backlogTargetName } = useBacklogDropTarget();` and pass it to `SprintDropZoneBar` (line ~928). `sprints` already includes the `*: Backlog` entries.
5. **Settings card:** `src/app/(app)/settings/general/page.tsx` — second card under "Story Writer Defaults", reusing the "Default sprint" card markup; reads/writes via `useBacklogDropTarget`, options = `useJiraSprints().sprints` filtered by `isBacklogSprintName`, value/label = sprint name.
6. **Tests:** route test (`backlog-drop-target/route.test.ts`, mirror saved-views: default/round-trip/isolation/validation); extend `SprintBoardDragDrop.test.tsx` (existing calls add the prop; new cases for GXP target label+id, and absent target → no tile, no `__backlog__`).

Order: 1 → 2 → (3 ∥ 5) → 4 → 6.

## Acceptance Criteria

### Core
- [x] The backlog drop tile's target team is no longer hard-coded; it is resolved from the configured default-backlog setting.
- [x] Dropping a ticket on the backlog tile assigns the selected team backlog **sprint** (numeric id via `jira.moveSprint`), never the generic `__backlog__` / sprint-less backlog.
- [x] The tile's label reflects the resolved target (e.g. shows `GXP: Backlog` when that is the target).
- [x] If the configured/derived backlog sprint does not exist in the current sprint list, the tile degrades gracefully (hidden, or a clearly-labelled fallback) rather than silently targeting the wrong place.

### Settings UX
- [x] The PO can pick the default target team backlog from a list of available `*: Backlog` sprints, on the **General settings page** (`src/app/(app)/settings/general/page.tsx`) as a second card alongside the existing "Default sprint" card, matching its layout (label + description + right-aligned `<select>` + save/confirm row).
- [x] The choice persists per account in the `userSetting` store (BRDG-343) and reloads consistently across sessions, browsers, ports, and devices.

### Consistency
- [x] Behaviour is unchanged for the single-team (BT) PO who keeps the default.
- [x] The generic project backlog remains reachable through its existing path (Backlogs dropdown); this story only governs the drag-overlay drop tile.

### Tests
- [x] Tests cover: the tile rendering and targeting the configured/derived backlog sprint id (not `__backlog__`), the label reflecting the target, the persistence of the setting (if applicable), and the graceful fallback when the target sprint is absent.

## Technical Notes
- Keep the change localised to `SprintBoardDragDrop.tsx` (target resolution + label) and the settings surface; do not touch `useSprintBoardDragDrop.ts` (already target-agnostic) or the move route.
- Reuse `isBacklogSprintName` / `extractTeamPrefix` from `sprint-utils.ts` for discovering and labelling backlog sprints; do not re-implement name parsing.
- Store the new preference in the per-account `userSetting` foundation (BRDG-343, `createUserJsonSettingRoute` + `useAccountSetting`); follow BRDG-187 only for the settings-UI placement, not its global storage.
- **Settings placement:** add the new card to `src/app/(app)/settings/general/page.tsx` under the existing "Story Writer Defaults" section, directly below the "Default sprint" card. Reuse that card's markup (the `rounded-xl border ... bg-overlay-subtle` container, the label/description block, the styled `<select>` + `ChevronDown`, and the saving/confirm rows). Difference from the "Default sprint" card: this one reads/writes the per-account `userSetting` via `useAccountSetting` (key `sprint_board_backlog_drop_target`), not the global `settings.defaultSprintUrl()` appSetting. The dropdown options are the `*: Backlog` sprints from `useJiraSprints` (filtered with `isBacklogSprintName`), not the sprint slots.
