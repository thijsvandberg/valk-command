# BRDG-414: Generate per-ticket test scripts for sprint handoff (placeholder)

**Status:** Placeholder — needs scoping
**Priority:** TBD
**Type:** TBD

## Description

Placeholder for upcoming work. This file exists so the idea isn't lost and a
ticket number is reserved. **Do not implement before scoping and approval.**

The idea, in short:

- From the **Sprint Board**, on a ticket that is in **Done / Test** status, the
  PO can trigger generation of a **very short test script** using **VRW**
  (Valk Remote Workspace).
- The generated test script is **stored in the database, scoped to that sprint**
  (one script per ticket).
- When the sprint is finished, the PO can **copy-paste all the test
  documentation at once** — the collected scripts for the sprint — as a
  handoff to stakeholders.

## Open questions (to figure out later)

- [ ] What exactly is a "very short test script"? Format/length (a few manual
      test steps? Gherkin? a checklist?) and what inputs VRW gets (ticket
      title/description/AC, linked subtasks, PR/diff?).
- [ ] Trigger placement: row context menu, hover card, side panel, or a bulk
      action? Which statuses count as "Done / Test" (status name vs. category)?
- [ ] Storage model: where does it live in the DB and how is it keyed
      (per ticket + per sprint via the ticket-sprint bridge table)? Re-generate
      vs. edit-and-keep? Versioning?
- [ ] Aggregation/export: where does the "copy all test documentation for the
      sprint" action live (Sprint Board, sprint close flow, Stakeholder view,
      or the existing stakeholder export)? Output format (markdown, plain text)?
- [ ] VRW integration: new skill or reuse an existing one? Sync vs. streamed
      response? How is a failure/empty result surfaced to the PO?
- [ ] Does the script need manual editing/approval before it counts as final?
- [ ] Stakeholder audience: how non-technical should the wording be?

## Acceptance Criteria

_To be defined once scoped._

## Technical Notes

_None yet. Likely touches the Sprint Board row actions, the workspace/VRW
integration, a DB table keyed to the ticket-sprint bridge, and a sprint-level
export. Confirm before implementing._
