# BRDG-487: Link / re-parent existing stories as epic children from the Epic Writer

**Status:** In progress
**Priority:** High

## Description

As the PO, from the Epic Writer I want to pull **existing** stories into the epic as
children (re-parent them to the epic in Jira), not only create brand-new ones. Today
this silently fails: I asked the AI in chat to "link these 2 stories as child stories
of the epic" (VPL-47191, VPL-47192); the AI replied *"Updated cards … with their Jira
keys. The calling system can now re-parent these two existing stories"* — but nothing
was re-parented in Jira and no child stories appeared.

Follow-up to the Epic Writer work in [BRDG-479](completed/BRDG-479-epic-writer-advance-to-breakdown.md)
/ [BRDG-484](completed/BRDG-484-epic-writer-layout-navigation.md) /
[BRDG-485](completed/BRDG-485-epic-writer-inline-child-story.md). Related epic:
[BRDG-291](BRDG-291-epic-writer.md).

## Root cause (investigated)

The whole breakdown flow assumes cards are **new** stories to create:

- `create-in-jira` (`/api/epics/[key]/writer/create-in-jira`) **always** creates a new
  Jira issue (`jiraClient.createIssue` with `parentKey = epic`). There is no
  re-parent-existing path.
- The breakdown parser + `apply-output` persist only `title/bullets/body/sprint/links`
  per card. A card only ever gets a `jiraKey` when **Bridge** created it; there is no
  "existing story, re-parent" marker.
- So the AI's "re-parent" claim is aspirational — Bridge has no handler for it.

The re-parent primitive already exists and is reused elsewhere: setting a ticket's
`epicKey` (`updateTicketFields` → `jiraClient.updateIssue(key, { parent: { key } })`,
`ticket-detail-builder.ts`) re-parents in Jira.

## Plan (chosen with the PO: both)

### Part A — Manual "Link existing story" (Bridge-only, reliable)

- [ ] A "Link existing story" action in the Epic Writer breakdown that lets the PO pick
      one or more existing stories and re-parent them to the epic.
- [ ] New route `POST /api/epics/[key]/writer/link-existing` that, per chosen key:
      re-parents in Jira + sets the local `epicKey` (reusing `updateTicketFields`), and
      inserts an `epic_child_draft` card (status `created`, `jiraKey` set) so the story
      shows on the breakdown board alongside the generated cards.
- [ ] Tests + live verification on `VPL-47279` (link VPL-47191 / VPL-47192, confirm they
      become children under the epic and appear on the board).

### Part B — Make the AI-chat re-parent path actually work (Bridge + VRW)

- [ ] Extend the `<epic-breakdown>` card schema + `epic-breakdown-parser` to carry an
      existing-story reference (`key` + a `reparent`/`existing` flag).
- [ ] `apply-output`: attach the existing key + a re-parent-pending state to the card
      (keep "nothing reaches Jira until confirmed"); `create-in-jira` (or a branch)
      re-parents the existing story instead of creating a new issue.
- [ ] **VRW dependency:** the `break-down-epic` skill must emit the existing-story
      marker in `<epic-breakdown>` when the PO asks to link existing stories. This is a
      change in the VRW repo (`valk-remote-workspace`), separate build + restart, so
      Part B is not end-to-end verifiable from Bridge alone until that lands.

## Out of Scope

- Removing a child from an epic (un-parenting) — separate concern.
- Any change to the BRDG-485 in-place child editing or the BRDG-484 layout.

## Acceptance Criteria

- [ ] Part A: from the Epic Writer the PO can link existing stories to the epic; they
      re-parent in Jira and appear as children on the breakdown board.
- [ ] Part B (Bridge side): a re-parent marker in `<epic-breakdown>` is parsed and
      re-parents the existing story on confirm; the VRW skill change is documented.
- [ ] New/changed behaviour is covered by tests; `npm run lint`, `npm run typecheck`,
      `npm run test` and `npm run build` pass.
