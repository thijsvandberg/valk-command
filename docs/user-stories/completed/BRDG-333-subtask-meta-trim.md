# BRDG-333: Trim subtask detail view to what is relevant

**Status:** Done
**Priority:** Medium

## Description

A subtask is a unit of work under a story; it is not estimated, scored, reviewed, or developed on its own. Its detail view (full-page single view **and** the sidebar) showed several controls that don't apply, adding noise. This story trims them.

As a PO, when I open a subtask I want to see only what's relevant: its content, parent, status, and the standard meta - not story-level workflow controls.

## Acceptance Criteria

- [x] The **Content** tab is labelled **"Subtask"** for subtasks (tab id unchanged).
- [x] The **Review** and **Development** tabs are hidden for subtasks (both surfaces).
- [x] The sidebar "..." more-menu omits the **Review** item for subtasks.
- [x] The **Story Points / Business Value** row is hidden for subtasks.
- [x] The **Quality/Review** panel (under "More details") is hidden for subtasks.
- [x] The **Development** (branch/PR) panel is hidden for subtasks.
- [x] For subtasks the **Parent** card is shown **above** Status (it is the subtask's primary context); other types keep the Parent in its usual place below Status.
- [x] Stories, tasks, bugs, spikes, and epics are unchanged.
- [x] Tests cover the subtask variant in `TicketTabContent`, `TicketMetaContent`, and `SidePanel`.

## Implementation

All changes key off `ticket.type === "subtask"` and reuse the existing shared components, so the single view and the sidebar inherit the behavior from one place each.

- `TicketTabContent.tsx`: relabel Content -> "Subtask", drop Review/Development tabs, and guard the tab bodies defensively for subtasks.
- `SidePanel.tsx`: hide the Review item in the more-menu for subtasks.
- `TicketMetaContent.tsx`: hide the SP/BV row, the Quality/review panel, and the Development panel for subtasks; render the shared Parent card above Status for subtasks (below Status for other types).

Tests added to `TicketTabContent.test.tsx`, `TicketMetaContent.test.tsx`, and `SidePanel.test.tsx`. Verified in the browser on a real subtask (single view): only **Subtask** + **History** tabs, no SP/BV, no Quality or Development panel, parent link intact.

## Out of Scope

- Subtasks created via Jira retain their own fields in Jira; this only changes what Bridge surfaces.
- No change to the Subtasks section that lists subtasks on a parent story.
