# BRDG-090: Stakeholder View - AI Insights via Valk Agent

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want the stakeholder view to optionally surface AI-generated insights about the current sprint so I can share a richer, narrative-style update with stakeholders without having to write it myself.

## Implementation Plan

1. **`buildBriefingPayload` helper** (`src/lib/stakeholder-data.ts`): Export a function that serializes sprint data into `Record<string, string>` for the agent skill. Groups ticket titles by epic (done/in-progress/todo), includes days remaining and points progress. Does not include assignee, jiraKey, or per-ticket storyPoints.

2. **`AiInsightsPanel` component** (new: `src/components/stakeholder/AiInsightsPanel.tsx`): Presentational component that renders the insights panel. Props include `status`, `progressText`, `narrative`, `risks`, `error`, `onDismiss`, `onRetry`. Handles idle (hidden), loading, completed (narrative + risks), and error states.

3. **`parseBriefingOutput` helper** (in `AiInsightsPanel.tsx`): Parses agent output string. If it contains `<json-output>`, extracts risks array from JSON; everything before is narrative. Otherwise, full output is narrative.

4. **Page integration** (`src/app/(app)/stakeholder/page.tsx`): Add `useWorkspaceTask` hook instance for briefing. Add "Generate insights" button in ViewHeader next to "Copy as Markdown". Render `AiInsightsPanel` above ticket sections in single-sprint view. Reset on sprint change.

5. **Copy integration** (`src/lib/stakeholder-data.ts` + `CopyMarkdownButton.tsx`): Extend `buildMarkdownSummary` with optional `aiNarrative` and `aiRisks` params. Prepend AI section with clear labelling. Pass narrative/risks from page state to `CopyMarkdownButton`.

**Dependencies:** Step 1 before 3-5; Step 2 before 4; Steps 1-4 before 5.

## Acceptance Criteria

### Phase 1: Sprint narrative

- [x] "Generate insights" button in the stakeholder page header (next to "Copy as Markdown")
- [x] Triggers a workspace skill invocation (`stakeholder-briefing`) via the valk agent
- [x] The skill receives: sprint name, done/in-progress/todo ticket titles grouped by epic, days remaining, and points progress
- [x] Agent produces a short (3-5 sentence) natural-language sprint update suitable for stakeholders
- [x] Output rendered in a dedicated "AI Insights" panel on the page, above the ticket sections
- [x] Panel shows a loading state while the agent is running
- [x] Panel can be dismissed (hidden) after reading

### Phase 2: Risk flags

- [x] As part of the same skill call, agent identifies up to 3 risk signals: e.g. low velocity, in-progress tickets without assignee, sprint more than 50% done but fewer than 25% of points completed
- [x] Risks rendered as a compact list of flags below the narrative (e.g. "5 tickets still in To Do with 2 days remaining")
- [x] Risks section only shown if the agent finds at least one signal

### Phase 3: Copy integration

- [x] "Copy as Markdown" includes the AI narrative and risks (when present) at the top of the copied text
- [x] Narrative and risks are clearly marked as AI-generated in the copy output

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
