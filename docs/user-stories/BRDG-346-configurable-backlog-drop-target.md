# BRDG-346: Configurable Backlog Drop Target

**Status:** Not Started
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
- **Existing settings precedent:** `BRDG-187-default-sprint-setting` introduced a per-user "default sprint" preference — reuse that storage/UI pattern rather than inventing a new one. Confirm where it persists (local setting vs DB) and follow it.
- **Available backlog sprints come from** the live sprints list (`useJiraSprints`), already passed into the board.

## Open decision (needs PO input)

How should the target be selected?

1. **Explicit setting:** a single configured team backlog (e.g. a dropdown of all `*: Backlog` sprints) that the drop tile always uses. Simple, predictable; matches the current fixed behaviour but configurable.
2. **Team-aware (automatic):** the tile follows the team of the sprint currently being viewed (viewing `GXP: 141` → tile targets `GXP: Backlog`), with no setting at all. Zero config, but assumes one backlog per team prefix and no target when viewing the All view / a team with no backlog.
3. **Both:** team-aware by default, with an optional override setting for POs who always want one specific backlog.

To be confirmed before implementation.

## Acceptance Criteria

### Core
- [ ] The backlog drop tile's target team is no longer hard-coded; it is resolved from the chosen mechanism (setting and/or current-team context per the Open decision).
- [ ] Dropping a ticket on the backlog tile assigns the selected team backlog **sprint** (numeric id via `jira.moveSprint`), never the generic `__backlog__` / sprint-less backlog.
- [ ] The tile's label reflects the resolved target (e.g. shows `GXP: Backlog` when that is the target).
- [ ] If the configured/derived backlog sprint does not exist in the current sprint list, the tile degrades gracefully (hidden, or a clearly-labelled fallback) rather than silently targeting the wrong place.

### Settings UX (if approach 1 or 3)
- [ ] The PO can pick the target team backlog from a list of available `*: Backlog` sprints, following the existing default-sprint setting pattern (BRDG-187).
- [ ] The choice persists across sessions and reloads.

### Consistency
- [ ] Behaviour is unchanged for the single-team (BT) PO who keeps the default.
- [ ] The generic project backlog remains reachable through its existing path (Backlogs dropdown); this story only governs the drag-overlay drop tile.

### Tests
- [ ] Tests cover: the tile rendering and targeting the configured/derived backlog sprint id (not `__backlog__`), the label reflecting the target, the persistence of the setting (if applicable), and the graceful fallback when the target sprint is absent.

## Technical Notes
- Keep the change localised to `SprintBoardDragDrop.tsx` (target resolution + label) and the settings surface; do not touch `useSprintBoardDragDrop.ts` (already target-agnostic) or the move route.
- Reuse `isBacklogSprintName` / `extractTeamPrefix` from `sprint-utils.ts` for discovering and labelling backlog sprints; do not re-implement name parsing.
- Follow BRDG-187's storage and settings-UI approach for the new preference so settings stay consistent.
