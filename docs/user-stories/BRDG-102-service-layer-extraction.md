# BRDG-102: Service Layer Extraction

**Status:** Open
**Priority:** Low

## Description

API route handlers currently mix HTTP concerns (request parsing, response formatting, status codes) with business logic (database queries, Jira operations, validation rules). This makes routes hard to test in isolation, leads to logic duplication across routes, and makes the codebase harder to navigate.

This story introduces a `src/services/` layer that encapsulates business logic, leaving route handlers as thin adapters.

### Example transformation

**Before** (route handler does everything):
```typescript
export async function POST(request: Request) {
  const body = await request.json();
  // 20 lines of validation
  // 30 lines of DB queries
  // 10 lines of Jira API calls
  // 5 lines of error handling
  return NextResponse.json({ ... });
}
```

**After** (route handler delegates):
```typescript
export async function POST(request: Request) {
  const body = await request.json();
  const result = await ticketService.applyDraft(body);
  return NextResponse.json(result);
}
```

### Target areas (ordered by value)

1. **Ticket operations** - `tickets/[key]/push-to-jira`, `pull-from-jira`, `local-edits`, `metadata`
2. **Story writer** - `messages`, `apply-draft`, `apply-related`, `split`
3. **Jira sync** - `sync-tickets`, `sync-incremental`, `sync-comments`
4. **Workspace tasks** - `workspace-tasks` CRUD and streaming

## Implementation Plan

### Step 1: Create `src/services/errors.ts`
- `ServiceError` base class with `code`, `message`, `statusCode`
- Subclasses: `NotFoundError`, `ValidationError`, `ConflictError`, `JiraUnavailableError`, `JiraOperationError`
- `ConflictError` carries `details: { contentChanged: boolean }` for push-to-jira conflict shape

### Step 2: Create `src/services/ticket-service.ts`
Extract all business logic from 4 route handlers (plain objects in, plain objects out, no HTTP types):
- `pushToJira(key, { force })` - conflict detection, Jira push, mirror refresh, activity log
- `pullFromJira(key)` - fetch + ADF conversion
- `getLocalEdits(key)`, `upsertLocalEdit(key, input)`, `deleteLocalEdits(key, opts)`, `rebaseLocalEdits(key)`, `promoteDrafts(key)`
- `updateTicketMetadata(key, input)` - validation, upsert, cache invalidation

### Step 3: Create `src/services/handle-service-error.ts`
- Small utility: if `ServiceError`, return `NextResponse.json({ error, code }, { status: statusCode })`
- Otherwise log and return 500

### Step 4: Write tests `src/services/ticket-service.test.ts` and `src/services/errors.test.ts`
- Test service functions with plain args and testDb (same `createTestDb()` pattern)
- No Request/Response construction needed
- Target: ~30 test cases covering happy paths and error branches

### Step 5: Rewrite the 4 route handlers as thin wrappers (target <30 lines each)
- Order: `pull-from-jira` → `metadata` → `local-edits` → `push-to-jira`
- `push-to-jira` catches `ConflictError` specially and returns `{ conflict: true, ... }` at 200 to preserve API contract

### Implementation order: errors → service → handle-service-error → tests → routes

### Key decisions
- `ConflictError` maps to HTTP 409 by default but push-to-jira route catches it specially for backwards compatibility
- Services throw typed errors; routes catch and map to HTTP status codes via `handleServiceError`
- No changes to `@/db`, `@/lib/*`, or `@/types/*` - purely additive

## Acceptance Criteria

- [ ] New `src/services/` directory with service modules per domain
- [ ] At least ticket operations (area 1) fully extracted to `src/services/ticket-service.ts`
- [ ] Route handlers for extracted services are under 30 lines each
- [ ] Service functions are independently testable (no NextRequest/NextResponse in signatures)
- [ ] Existing route tests still pass
- [ ] New unit tests for service functions (separate from route integration tests)
- [ ] No behavioral changes

## Notes

- This is a large refactor; tackle one domain area per PR
- Start with ticket operations as they have the most duplication
- Services should accept plain objects and return plain objects (no HTTP types)
- Error handling: services throw typed errors, routes catch and map to HTTP status codes
