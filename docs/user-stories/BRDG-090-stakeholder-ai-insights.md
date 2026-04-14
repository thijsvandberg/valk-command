# BRDG-090: Stakeholder View - AI Insights via Valk Agent

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want the stakeholder view to optionally surface AI-generated insights about the current sprint so I can share a richer, narrative-style update with stakeholders without having to write it myself.

## Acceptance Criteria

### Phase 1: Sprint narrative

- [ ] "Generate insights" button in the stakeholder page header (next to "Copy as Markdown")
- [ ] Triggers a workspace skill invocation (`stakeholder-briefing`) via the valk agent
- [ ] The skill receives: sprint name, done/in-progress/todo ticket titles grouped by epic, days remaining, and points progress
- [ ] Agent produces a short (3-5 sentence) natural-language sprint update suitable for stakeholders
- [ ] Output rendered in a dedicated "AI Insights" panel on the page, above the ticket sections
- [ ] Panel shows a loading state while the agent is running
- [ ] Panel can be dismissed (hidden) after reading

### Phase 2: Risk flags

- [ ] As part of the same skill call, agent identifies up to 3 risk signals: e.g. low velocity, in-progress tickets without assignee, sprint more than 50% done but fewer than 25% of points completed
- [ ] Risks rendered as a compact list of flags below the narrative (e.g. "5 tickets still in To Do with 2 days remaining")
- [ ] Risks section only shown if the agent finds at least one signal

### Phase 3: Copy integration

- [ ] "Copy as Markdown" includes the AI narrative and risks (when present) at the top of the copied text
- [ ] Narrative and risks are clearly marked as AI-generated in the copy output

## Technical Notes

- Skill name: `stakeholder-briefing` (to be created in the valk-agent workspace)
- Invoke via `POST /api/workspace-tasks` with skill name and structured sprint data as input
- Poll or stream the result via `GET /api/workspace-tasks/[id]/stream`
- Store the generated narrative in local component state only (not persisted to DB)
- Risk signals are computed by the agent based on the sprint data passed in; no separate DB queries needed
- Filter out all PO-internal fields before sending data to the agent (same as the stakeholder transformation layer)

## Out of Scope

- Velocity comparison across multiple sprints (requires historical data)
- Auto-generated email body (follow-up story)
- Persisting AI insights across sessions
- Scheduled/automatic insight generation
