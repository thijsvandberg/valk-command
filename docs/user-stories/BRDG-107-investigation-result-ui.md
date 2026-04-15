# BRDG-107: Investigation Result UI

**Status:** Open
**Priority:** Medium

## Description

Investigation results are currently rendered as a single markdown blob in a chat bubble. This works but doesn't leverage the structured nature of the output. The result has distinct sections (Finding, How it works, Related stories, Key files, Non-technical summary) that deserve their own visual treatment.

Additionally, investigation is a distinct flow from regular chat. The results should feel more like a report than a chat message.

## Current State

- Investigation output is a single markdown string rendered via `react-markdown`
- Tables overflow on narrow screens (fixed with overflow-x-auto, but still not ideal)
- Related stories are plain text in a table, not linked to anything
- No way to navigate between sections
- Tech analysis and non-technical summary are mixed in one message
- No visual distinction between an investigation result and a regular assistant message

## Acceptance Criteria

### Phase 1: Structured Result Rendering

- [ ] Detect investigation results in assistant messages (by content pattern: starts with `## Question` or has the investigation output structure)
- [ ] Render investigation results using a dedicated `InvestigationResult` component instead of generic markdown
- [ ] Each section (Finding, How it works, What's missing, Related stories, Key files, Summary) is a distinct visual block
- [ ] Sections are collapsible: "How it works" and "Key files" start collapsed when the result is long, "Finding" and "Summary" start expanded
- [ ] Section headers have subtle icons for quick scanning

### Phase 2: Related Stories as Links

- [ ] Related stories table entries link to the ticket detail page in Bridge (`/tickets/VPL-XXXX`)
- [ ] If a story key exists in Bridge's local database, show its current status badge next to the link
- [ ] If a story key is not in the local database, link to Jira directly (`https://new-story.atlassian.net/browse/VPL-XXXX`)

### Phase 3: Separate Tech and Explain Responses

- [ ] When explain mode is used, split the result into two visual sections: a "Technical Analysis" card and a "Summary for Stakeholders" card
- [ ] The non-technical summary card has a distinct visual style (lighter background, no code formatting) to make it clear this is the shareable part
- [ ] Each card has its own copy buttons (Markdown / RTF)
- [ ] The non-technical summary card can be copied independently for sharing in Slack/email

### Phase 4: Key Files as Navigable List

- [ ] Key files are rendered as a compact list with file path and purpose
- [ ] Long file paths are truncated with the filename visible and full path on hover
- [ ] If the file path contains a repo name (e.g. `valk-nx/...`), show a subtle repo badge

## Technical Notes

### Detection

Investigation results follow a predictable markdown structure. Detection can be done by checking if the content contains `## Question` followed by `## Finding`. This avoids needing metadata on the message.

Alternatively, messages with a `workspaceTaskId` whose skill is `investigate` can be flagged. This would require storing the skill name on the message or looking it up via the workspace_task table.

### Component Structure

```
InvestigationResult
  - QuestionHeader (the rephrased question)
  - FindingCard (2-3 sentence answer, always visible)
  - TechnicalDetailSection (collapsible "How it works")
  - GapSection (collapsible "What's missing" / "What would be needed")
  - RelatedStoriesSection (linked table)
  - KeyFilesSection (collapsible compact list)
  - StakeholderSummaryCard (only in explain mode, distinct style)
  - CopyActions (per-card and for the full result)
```

### Parsing

The investigation markdown output has a consistent structure with `## ` headings. A simple parser can split on `## ` to extract sections and their content. No need for a full markdown AST.

## Related

- BRDG-104: Code Investigation Skill (created the investigation flow)
- BRDG-106: Task Stream Resilience (ensures results are always captured)
