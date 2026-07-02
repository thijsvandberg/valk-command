# BRDG-461: Sprint test documentation delivery (bundle, export, missing overview)

**Status:** Placeholder — needs scoping
**Priority:** TBD
**Type:** Feature

## Description

Follow-up to [[BRDG-426-generate-test-doc]]. Once per-story test docs are generated,
validated, and stored (Bridge `ticket_metadata.test_doc` + Jira expand block), the PO
needs the **sprint-level deliverable**: one document per team/sprint in the style of the
manual "BT: 139" deliverables, plus visibility on what is still missing before the sprint
can be delivered.

Scope to figure out when picking this up:

- **Bundle view** per team + sprint: all stored test-doc blocks concatenated, ordered like
  the manual documents (big features first, one-liners/Misc last). Open question: merge
  related stories under a theme header ("Group reservations", "Upsell") — manual docs do
  this; automatic grouping may need epic info or PO ordering.
- **Copy-paste export**: one click to copy the whole document (markdown and/or rich text
  suitable for Confluence/mail).
- **Missing overview**: which DONE/Test stories in the sprint have no validated test doc
  yet (and which are flagged `needs_input` / `not_stakeholder_relevant`), so gaps are
  visible before delivery. The BT: 139 calibration showed the manual process missed five
  guest-visible stories — this overview is the safeguard.
- Where this lives: sprint board (group header action?), a dedicated page, or the
  Stakeholder view.

## Acceptance Criteria

_To be defined once scoped._

## Related

- [[BRDG-426-generate-test-doc]] — prerequisite; produces and stores the per-story docs.
