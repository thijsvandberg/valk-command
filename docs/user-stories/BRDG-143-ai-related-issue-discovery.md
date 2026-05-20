# BRDG-143: AI-Powered Related Issue Discovery

**Status:** Draft
**Priority:** Medium
**Depends on:** BRDG-142 (interface shell)

## Description

As the PO, I want AI to analyze the current ticket and automatically suggest semantically related issues from the backlog, so I can discover dependencies and duplicates I might have missed.

BRDG-142 delivers the frontend interface (suggestion list, link actions, dismiss). This story implements the backend: sending ticket context to the workspace AI agent, receiving ranked suggestions, and wiring them into the existing UI shell.

## Acceptance Criteria

### Phase 1: Workspace AI integration
- [ ] API route `POST /api/tickets/[key]/related-suggestions` that sends ticket context to workspace
- [ ] Workspace prompt includes: ticket title, description, acceptance criteria, epic name, sprint context
- [ ] Workspace searches across all synced tickets using semantic understanding
- [ ] Response includes: list of related ticket keys with relevance score (0-1) and suggested relation type

### Phase 2: Search refinement
- [ ] Results are deduplicated against already-linked issues
- [ ] Results are ranked by relevance score
- [ ] Maximum 10 suggestions per request
- [ ] Suggestions include a short rationale (one sentence explaining why it is related)

### Phase 3: Caching and performance
- [ ] Suggestions are cached per ticket (invalidated on ticket update or new link added)
- [ ] Loading state streams partial results if workspace supports SSE
- [ ] Timeout handling if workspace is unresponsive (30s max)

## Technical Notes

- Workspace integration pattern: use the existing workspace proxy (`/api/workspace/...`) to send a skill request
- Consider creating a dedicated workspace skill for related issue search
- The prompt should instruct the AI to consider: semantic similarity, shared epics, overlapping components, dependency patterns
- Relation type suggestions should map to Jira link types (Relates to, Blocks, Duplicates, etc.)
