# BRDG-107: Investigation Result UI

**Status:** Done
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

## Implementation Plan

1. **Parser** (`src/lib/investigation-parser.ts` + test) - Parse investigation markdown into structured data (question, finding, howItWorks, whatsMissing, whatWouldBeNeeded, relatedStories, keyFiles, stakeholderSummary, isLong)
2. **Extract shared markdown components** (`src/components/chat/markdown-components.tsx`) - Shared ReactMarkdown overrides used by MessageList, MessageDisplay, and investigation components
3. **Extract CopyActions** (`src/components/chat/CopyActions.tsx`) - Move from MessageList.tsx to standalone file for reuse
4. **useTicketExists hook** (`src/hooks/useTicketExists.ts` + test) - Check if a ticket key exists in local DB
5. **CollapsibleSection** (`src/components/chat/investigation/CollapsibleSection.tsx`) - Reusable collapsible section with icon and chevron
6. **InvestigationResult container** (`src/components/chat/investigation/InvestigationResult.tsx`) - Top-level component rendering all sub-sections
7. **RelatedStoriesSection** (`src/components/chat/investigation/RelatedStoriesSection.tsx`) - Linked stories with local/Jira detection
8. **KeyFilesSection** (`src/components/chat/investigation/KeyFilesSection.tsx`) - Compact file list with truncation and repo badges
9. **StakeholderSummaryCard** (`src/components/chat/investigation/StakeholderSummaryCard.tsx`) - Distinct card for non-technical summary with own copy buttons
10. **Wire into MessageList** - Add detection in MessageContent, wider container for investigation results
11. **Integration test** (`src/components/chat/investigation/InvestigationResult.test.tsx`)

## Acceptance Criteria

### Phase 1: Structured Result Rendering

- [x] Detect investigation results in assistant messages (by content pattern: starts with `## Question` or has the investigation output structure)
- [x] Render investigation results using a dedicated `InvestigationResult` component instead of generic markdown
- [x] Each section (Finding, How it works, What's missing, Related stories, Key files, Summary) is a distinct visual block
- [x] Sections are collapsible: "How it works" and "Key files" start collapsed when the result is long, "Finding" and "Summary" start expanded
- [x] Section headers have subtle icons for quick scanning

### Phase 2: Related Stories as Links

- [x] Related stories table entries link to the ticket detail page in Bridge (`/tickets/VPL-XXXX`)
- [x] If a story key exists in Bridge's local database, show its current status badge next to the link
- [x] If a story key is not in the local database, link to Jira directly (`https://new-story.atlassian.net/browse/VPL-XXXX`)

### Phase 3: Separate Tech and Explain Responses

- [x] When explain mode is used, split the result into two visual sections: a "Technical Analysis" card and a "Summary for Stakeholders" card
- [x] The non-technical summary card has a distinct visual style (lighter background, no code formatting) to make it clear this is the shareable part
- [x] Each card has its own copy buttons (Markdown / RTF)
- [x] The non-technical summary card can be copied independently for sharing in Slack/email

### Phase 4: Key Files as Navigable List

- [x] Key files are rendered as a compact list with file path and purpose
- [x] Long file paths are truncated with the filename visible and full path on hover
- [x] If the file path contains a repo name (e.g. `valk-nx/...`), show a subtle repo badge

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
