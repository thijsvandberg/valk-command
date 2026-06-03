# BRDG-269: Horizontal roadmap views for an epic (and later, across epics)

**Status:** Draft (to be fleshed out)
**Priority:** Low
**Type:** Feature
**Related:** BRDG-267 (the "By sprint" list view — the chosen list framing), BRDG-268 (move children between sprints)

## Description

As a PO, alongside the sprint-grouped list (BRDG-267), I want a horizontal, time-oriented roadmap of an epic so I can see at a glance how effort is spread across sprints and how loaded each sprint is — and later, combine multiple epics into one shared timeline.

This is a placeholder for the roadmap (B) and multi-epic (C) directions from the exploration. The list framing (A1) is already decided and split into its own stories; this story captures the remaining sketched directions so they aren't lost, to be detailed later.

## Reference

A temporary, mock-data sketch of all directions lives at `src/app/(app)/dev/epic-roadmap` (delete once a direction ships):
- **B family — horizontal roadmap of one epic**
  - **B1 — effort blocks:** sprints as columns; each ticket a keyless block whose height grows with story points (tall column = heavy sprint). Status collapsed to done / in-progress / to-do via a quiet left accent + dot. Tickets without a Jira SP get a view-local `~N` estimate that feeds heights/totals but is never written back and clears when a real SP lands.
  - **B2 — Gantt bars:** one row per ticket, one column per sprint, a bar in the ticket's sprint. Best for reading "when" across many tickets.
  - **B3 — stacked capacity columns:** each sprint is a column = total capacity; epic tickets stack from the bottom (height = SP), the rest is "other work", a dashed line marks the epic's allocation %.
- **C — multi-epic capacity lane:** one row per epic across a shared sprint timeline; cell fill = % of that sprint's capacity the epic consumes. The foundation for combining epics later.

## Concepts to resolve when fleshing out

These have no backing store today and need design + data decisions:
- **Sprint capacity allocation (%)** per epic per sprint — is it a manual PO estimate, derived from SP vs. team velocity, or a hybrid? Where is it persisted?
- **Penciled-in items** not yet on the backlog, and the **view-local SP estimate** (`~N`) behaviour from B1 — local-only vs. promoted to real tickets; how/when they reset.
- **Sprint metadata on the epic detail** (state, dates, order) — same plumbing dependency as BRDG-267 Phase 2.
- Which B variant (or combination) to build, and whether the roadmap is a third view-mode next to List / By sprint, or its own surface.
- The multi-epic (C) view: how epics are selected/combined, and where this view lives.

## Out of scope (until detailed)

Everything here is a draft. No checklist/implementation commitment yet — to be expanded into concrete requirements (and likely split per variant) before any work starts.
