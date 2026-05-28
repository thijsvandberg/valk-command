# BRDG-219: Extract Service Layer from Large API Routes

**Status:** Done
**Priority:** Medium
**Type:** Refactoring

## Description

Several API route files contain 400-600+ lines of business logic that should live in dedicated service/utility files. Route files should only handle HTTP concerns (parse request, call service, return response). This reduces risk when AI makes changes and makes logic independently testable.

### Routes to Extract

| Route | Lines | Extract To |
|-------|-------|-----------|
| `story-writer/messages/route.ts` | 616 | `lib/story-writer-messages.ts` |
| `jira/sync-tickets/route.ts` | 521 | `lib/sync-tickets-service.ts` |
| `tickets/[key]/route.ts` | 530 | `lib/ticket-detail-builder.ts` |
| `tickets/[key]/dev-info/route.ts` | 467 | `lib/bitbucket-client.ts` |
| `search/local/route.ts` | 400 | `lib/local-search-engine.ts` |

## Approach

Per route:
1. Move business logic to a service file in `src/lib/`
2. Keep the route file as a thin wrapper: parse request, call service, return response
3. Write tests for the extracted service (logic is now testable without HTTP)

## Implementation Plan

1. **Extract `tickets/[key]/dev-info`** to `src/lib/bitbucket-client.ts` -- cleanest extraction, self-contained
2. **Extract `search/local`** to `src/lib/local-search-engine.ts` -- self-contained, update frontend type imports
3. **Extract `tickets/[key]`** to `src/lib/ticket-detail-builder.ts` -- complex parallel query, also extract PATCH to meet 100-line target
4. **Extract `jira/sync-tickets`** to `src/lib/sync-tickets-service.ts` -- refactor sync functions to return data instead of NextResponse
5. **Extract `story-writer/messages`** to `src/lib/story-writer-messages.ts` -- most complex, session recovery, dedup, multiple code paths
6. **Write tests** for pure functions and key logic in each extracted service
7. **Verify** all route files under 100 lines, full test suite passes, build succeeds

## Checklist

- [x] Extract `story-writer/messages` logic to `lib/story-writer-messages.ts`
- [x] Extract `jira/sync-tickets` logic to `lib/sync-tickets-service.ts`
- [x] Extract `tickets/[key]` GET logic to `lib/ticket-detail-builder.ts`
- [x] Extract `tickets/[key]/dev-info` Bitbucket logic to `lib/bitbucket-client.ts`
- [x] Extract `search/local` logic to `lib/local-search-engine.ts`
- [x] Write tests for each extracted service
- [x] Route files are under 100 lines each
- [x] All existing tests pass
