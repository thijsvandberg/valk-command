# BRDG-486: Epic Writer sprint-planning tab + breakdown sprint indicators

**Status:** Done
**Priority:** Medium

## Status

Shipped on `dev` and verified live on `VPL-47279`.

- **Sprints view:** a `"sprints"` `EpicRightView` (in the `EpicAppsMenu` switcher + mapped from the Sprints phase in `handleSelectPhase`). `EpicSprintPlanning` fetches the epic's real Jira children via `useTicketDetail` and renders the epic single view's `EpicChildrenSection` (which hosts `EpicChildrenBySprint`) locked to the by-sprint grouping via a new `forceSprintView` prop. Nothing is forked - moves persist to Jira through the reused sprint-move plumbing (verified: `VPL-47292` moved Unscheduled -> BT: 143 -> BT: Backlog, persisted across reload).
- **DRAFT constraint:** the view reads only created Jira children, so uncreated breakdown cards are structurally absent; an empty state points to the Breakdown board when nothing is created yet.
- **Free navigation:** Sprints <-> Breakdown (and any tab) both ways via the switcher / phase rail; each keeps its own state. Clicking a story in the Sprints view opens it in-place as the BRDG-485 child writer.
- **Breakdown sprint badge:** `ChildStoryCard` shows a created story's sprint as a clear badge - brand-tinted when scheduled, muted "To be planned" for the backlog; DRAFT cards carry a "not schedulable until created in Jira" hint. Because the board's cards and the Sprints view use separate data sources, a Sprints-view move refreshes the writer session so the breakdown badge updates without a reload.

`npm run lint`, `npm run typecheck`, `npx vitest run` (7949 pass) and `npm run build` all green.

## Description

As the PO, when I reach the **Sprints** phase in the Epic Writer I want to actually plan sprints there: put the epic's child stories into sprints without leaving the writer, then jump back to **Breakdown** to work out more stories. And in the Breakdown I want to see at a glance which stories are already scheduled in a sprint.

Today the Sprints tab (and Refine/Detail) just re-shows the breakdown board, so clicking it looks like nothing happens. This story gives the Sprints phase a real destination by **reusing the epic single view** rather than building a new planner.

Follow-up to the layout/navigation work in [BRDG-484](completed/BRDG-484-epic-writer-layout-navigation.md). Related epic: [BRDG-291].

## Problem / context

- The Epic Writer right region (`EpicWriterLayout.tsx`) has three views today (`EpicRightView = "breakdown" | "draft" | "child"`). Phase selection maps Feed/Discovery -> Draft and Breakdown/Refine/Detail/**Sprints** -> the same Breakdown board, so the Sprints tab has no distinct effect.
- The epic's single view (ticket detail, `TicketTabContent.tsx`) already renders **`EpicChildrenBySprint.tsx`**: children grouped by sprint with drag-to-assign (`onMoveChild`), reorder, and create-into-sprint. This is exactly the sprint-planning surface the PO wants.
- Sprint assignment requires the story to already live in Jira (per BRDG-291 / BRDG-296): DRAFT breakdown cards cannot be scheduled; only children created in Jira appear in the sprint view.
- `ChildStoryCard.tsx` already resolves the live sprint of a created card, but the breakdown board does not make "this story is planned in sprint X" obvious.

## In Scope

- Add a **Sprints** content view to the Epic Writer that reuses `EpicChildrenBySprint` (the epic single view), wired so the PO can move created child stories between sprints / backlog in-place.
  - Add `"sprints"` to `EpicRightView`, to the `EpicAppsMenu` switcher, and map the Sprints phase to it in `handleSelectPhase`.
  - Feed it the epic's children + sprints and the existing move/reorder handlers (reuse the sprint-board plumbing `EpicChildrenBySprint` already uses; do not fork it).
- **Free bidirectional navigation:** from Sprints the PO can go straight back to Breakdown (and any other tab) and back again; each tab keeps its own state.
- **Breakdown sprint indicator:** each breakdown card that is created and scheduled shows which sprint it is planned in (a clear badge on `ChildStoryCard`), and reads as "not scheduled / backlog" otherwise.

## Out of Scope

- Scheduling DRAFT cards (must be created in Jira first - keep that constraint; the Sprints view simply won't list uncreated cards).
- A bespoke new sprint planner UI (reuse `EpicChildrenBySprint`, don't rebuild).
- Bulk "create all breakdown cards in Jira" (separate concern; may be worth its own story if planning many at once is painful).

## Open questions

- Should the Sprints view offer a shortcut to create still-DRAFT breakdown cards in Jira (so they become schedulable) from within that view, or is per-card "Create in Jira" on the Breakdown board enough? Default: keep creation on the Breakdown board; Sprints view only plans already-created stories.

## Acceptance Criteria

- [x] The Sprints tab opens a sprint-planning view (reused `EpicChildrenBySprint`) showing the epic's created children grouped by sprint
- [x] The PO can move a created child story into a sprint / backlog from that view, and it persists to Jira
- [x] The PO can navigate Sprints <-> Breakdown (and other tabs) freely, both directions
- [x] Breakdown cards show whether/which sprint a created story is scheduled in
- [x] DRAFT (uncreated) cards are not schedulable and this is clear
- [x] New/changed behaviour is covered by tests; `npm run test` and `npm run build` pass
