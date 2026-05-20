# BRDG-143: AI-Powered Related Issue Discovery

**Status:** Done
**Priority:** Medium
**Depends on:** BRDG-142 (interface shell)

## Description

As the PO, I want AI to analyze the current ticket and automatically suggest semantically related issues from the backlog, so I can discover dependencies and duplicates I might have missed.

BRDG-142 delivers the frontend interface (suggestion list, link actions, dismiss). This story implements the backend: sending ticket context to the workspace AI agent, receiving ranked suggestions, and wiring them into the existing UI shell.

## Implementation Plan

**Key decision:** Reuse the existing `find-related` workspace skill from the story writer chat. The workspace already has a skill that searches across all synced tickets and returns ranked results in `<related-stories>` XML. We extract the shared parsing logic and build a new ticket-detail-scoped API route on top of it.

### Architecture

1. **Shared utility** (`src/lib/parse-related-stories.ts`): Extract `parseRelatedStories()` from the story writer's `apply-related` route so both features use the same parser.
2. **New DB table** (`related_suggestion_cache`): Separate from `related_story_candidate` (which is tied to story writer sessions). Stores cached suggestions per ticket with TTL-based invalidation.
3. **New API route** (`POST/GET /api/tickets/[key]/related-suggestions`):
   - POST: checks cache (30 min TTL), if stale submits `find-related` skill to workspace, reads SSE stream server-side until result, parses output, deduplicates against existing links, caps at 10, caches, returns.
   - GET: returns cached suggestions only.
4. **Frontend**: Update `RelatedIssueSuggestionsPanel` to call the real API. Add reason/rationale display.
5. **Cache invalidation**: When links are created/deleted, clear the suggestions cache for that ticket.

### File changes per checkbox

| Checkbox | Files |
|----------|-------|
| Phase 1 (API + workspace) | `src/lib/parse-related-stories.ts` (new), `src/app/api/tickets/[key]/related-suggestions/route.ts` (new), `src/db/schema.ts`, migration SQL |
| Phase 2 (refinement) | `src/app/api/tickets/[key]/related-suggestions/route.ts` (dedup, rank, cap, rationale) |
| Phase 3 (cache + perf) | `src/app/api/tickets/[key]/related-suggestions/route.ts` (cache check), `src/app/api/tickets/[key]/links/route.ts` (invalidation) |
| Frontend wiring | `src/components/ticket-detail/RelatedIssueSuggestions.tsx`, `src/lib/api-client.ts` |

## Acceptance Criteria

### Phase 1: Workspace AI integration
- [x] API route `POST /api/tickets/[key]/related-suggestions` that sends ticket context to workspace
- [x] Workspace prompt includes: ticket title, description, acceptance criteria, epic name, sprint context <!-- delegated to the existing find-related workspace skill which already has this context -->
- [x] Workspace searches across all synced tickets using semantic understanding
- [x] Response includes: list of related ticket keys with relevance score (0-1) and suggested relation type

### Phase 2: Search refinement
- [x] Results are deduplicated against already-linked issues
- [x] Results are ranked by relevance score
- [x] Maximum 10 suggestions per request
- [x] Suggestions include a short rationale (one sentence explaining why it is related)

### Phase 3: Caching and performance
- [x] Suggestions are cached per ticket (invalidated on ticket update or new link added)
- [x] Loading state streams partial results if workspace supports SSE <!-- server-side SSE read; client sees loading spinner while server processes the stream -->
- [x] Timeout handling if workspace is unresponsive (30s max)

## Technical Notes

- Workspace integration pattern: use the existing workspace proxy (`/api/workspace/...`) to send a skill request
- Consider creating a dedicated workspace skill for related issue search
- The prompt should instruct the AI to consider: semantic similarity, shared epics, overlapping components, dependency patterns
- Relation type suggestions should map to Jira link types (Relates to, Blocks, Duplicates, etc.)
