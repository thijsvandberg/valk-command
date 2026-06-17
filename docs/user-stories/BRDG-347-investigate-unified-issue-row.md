# BRDG-347: Investigate Unifying the Board Row and Child Issue Row

**Status:** Done
**Priority:** Medium
**Type:** Investigation

## Description

As a developer, I want to know whether the sprint board's `BoardRow` and the ticket detail page's `ChildIssueRow` can be merged into a single shared row component, so that visual and behavioral parity between the two views stops relying on manually copying treatments across two files.

This is a **research/investigation** story. The deliverable is a written recommendation (feasibility, approach, risk, effort), not the refactor itself. If the conclusion is "yes, merge", the output includes a concrete implementation plan that can be promoted into its own story.

## Background

Two separate components render an issue row today:

- **Sprint board** -> `src/components/sprint-board/BoardRow.tsx` (~814 lines)
- **Epic page / subtasks** -> `src/components/ticket-detail/ChildIssueRow.tsx` (~286 lines)

They are meant to look and behave the same (BRDG-239 aligned row height/layout, and recent work mirrored the flagged tint, the inline flag icon, and the active/selected highlight). But every alignment is **hand-copied** into both files. Recent examples where the two drifted and had to be re-synced:

- Flagged rows: background tint + red left accent + inline flag icon existed on `BoardRow` but were missing on `ChildIssueRow`.
- Open-in-sidebar highlight: `BoardRow` had a selected-row treatment; `ChildIssueRow` was never told which row was active.

They already share the smaller building blocks (`TicketStatusPill`, `Checkbox`, `EditStateDot`, `EstimatePicker`, `BusinessValuePicker`, `Avatar`), so the duplication is concentrated in the **row shell**: layout, gutters, background/accent state machine (selected / checked / flagged / hover / focus / deprecated / removed / inflight), drag affordance, and the hover-revealed actions overlay.

### Prior unification work (read first)

- **BRDG-208** (done) - extracted `ChildIssueRow` to unify subtasks and epic children. The "single composite `ChildIssueList`" was deliberately skipped because the two sections differed too much; the three primitives are used directly instead. Same tension likely applies here.
- **BRDG-129** unified-ticket-row, **BRDG-130** unified-header-rows - earlier row unification efforts; capture what worked and what was abandoned.
- Memory note: the dense `TicketRow.tsx` (~686 lines, incl. `/compare`) is legacy and being phased out; the live board row is `BoardRow.tsx`. Confirm `TicketRow` is out of scope (or note if it should fold into the same shared core).

## Why the row shells differ today

`BoardRow` carries board-only machinery that `ChildIssueRow` does not need:

- Per-row estimate-hygiene warning labels (BRDG-313)
- Split-target title (BRDG-325), "Jira changed" badge
- Inline epic picker chip + sprint badge, quality score badge
- Hover-revealed planning placeholders (add epic / SP / BV)
- Container-query-driven responsive behavior (`@container/boardrow`)
- A real `border-l-[3px]` accent vs `ChildIssueRow`'s `inset` box-shadow accent

The investigation must decide whether these are "slots the host fills" (mergeable) or "fundamentally board-specific" (keep separate).

## Questions to answer

1. **What is genuinely shared vs view-specific?** Produce a feature/state matrix across both rows (gutters, background/accent state precedence, drag handle, checkbox gutter, focus ring, deprecated/removed/inflight fades, last-row rounding, actions overlay, inline title edit).
2. **Can the shared part be a single `IssueRow` core** that accepts slots (leading pill, title, inline-tags cluster, metadata, actions, drag handle) and a unified state model, with each view composing on top? Or does the divergence (per BRDG-208's lesson) make a thin shared core not worth it?
3. **State model:** can selected/checked/flagged/hover/focus/deprecated/removed/inflight precedence be expressed once and reused, including the accent mechanism difference (border vs inset shadow)?
4. **Data shape:** `BoardRow` takes a `Ticket`; `ChildIssueRow` takes `Subtask | EpicChild`. What is the minimal common interface, and what is the adapter cost?
5. **Risk:** the board row is performance-sensitive (long lists, live-pulse, DnD). Would a shared abstraction add re-render or prop-drilling cost? Any React Compiler lint constraints (no setState-in-effect, no ref-in-render)?
6. **Effort & payoff:** rough sizing of the merge vs the ongoing cost of keeping two rows in sync. Recommend one of: (a) full merge, (b) partial - extract only the shared shell/state helper, (c) keep separate but add a shared visual-contract test that fails when they drift.

## Deliverable

A written investigation at `docs/investigations/2026-XX-XX-unified-issue-row.md` containing:

- The feature/state comparison matrix
- A clear recommendation (a / b / c above) with rationale
- If merge is recommended: a proposed component API (props + slots), a migration approach, and a list of risks/edge cases
- A rough effort estimate and a suggested follow-up implementation story (with a draft checklist)

## Acceptance Criteria

- [x] Both row components and their state/styling are catalogued in a comparison matrix
- [x] Prior unification stories (BRDG-208, BRDG-129, BRDG-130) reviewed and their lessons reflected
- [x] `TicketRow.tsx` scope confirmed (legacy/excluded or folded in) <!-- legacy, excluded: only consumed by Compare via DroppableSprintColumn, being phased out -->
- [x] A reasoned recommendation is documented (full merge / partial extract / keep-separate-with-drift-guard) <!-- recommendation: (b) partial extract -->
- [x] If merge is viable, a concrete component API and migration plan are included <!-- rowSurfaceClasses helper + accent variant + draft follow-up story -->
- [x] Investigation doc saved under `docs/investigations/` and linked from `docs/index.md`
- [x] No production code changes in this story (investigation only)

## Out of scope

- Implementing the merge (becomes a follow-up story if recommended)
- Changing the data model, API routes, or any shared primitive (`TicketStatusPill`, pickers, etc.)
- Visual redesign of either row beyond what is needed to describe the shared contract
