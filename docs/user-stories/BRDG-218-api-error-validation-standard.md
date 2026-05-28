# BRDG-218: Standardize API Error Responses and Request Validation

**Status:** In Progress
**Priority:** Medium
**Type:** Refactoring

## Description

API routes use inconsistent error response formats and each route reimplements request body parsing. This makes error handling unpredictable for the frontend and increases the chance of bugs when adding new routes.

### Current Issues

**Error responses vary:**
- Some routes: `{ ok: false, error: "..." }`
- Other routes: `{ error: "..." }`
- Story writer routes: custom `agentErrorResponse()` helper

**Request parsing duplicated:**
Every route that reads a JSON body has its own try/catch:
```typescript
let body;
try { body = await request.json(); }
catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
```

### Approach

1. Create `lib/api-response.ts` with helpers: `errorResponse(message, status)`, `validationError(errors)`, `successResponse(data)`
2. Create `lib/request-parser.ts` with `parseJsonBody<T>(request, zodSchema?)` that handles parsing + validation in one call
3. Migrate routes to use the shared helpers

## Implementation Plan

1. **Create `src/lib/api-response.ts`** with helpers: `errorResponse(message, status, code?)`, `validationError(message | ZodError)`, `successResponse(data, status?, headers?)`, `agentErrorResponse(error, status)`. All produce `{ error: string; code?: string }` shape matching the frontend `ApiError` contract.
2. **Create `src/lib/request-parser.ts`** with `parseJsonBody<T>(request, schema?)` returning `{ data: T } | { error: NextResponse }`. Replaces the 40+ duplicated try/catch JSON parsing blocks. Optional Zod schema validates in one call.
3. **Write tests** for both utilities (`api-response.test.ts`, `request-parser.test.ts`).
4. **Migrate highest-traffic routes** (story-writer messages, workspace-tasks, ticket CRUD, conversations, search agent routes).
5. **Migrate remaining routes** (jira, settings, refinement, jobs, pipelines, followed-tickets, notifications, etc.). Convert `{ ok: false, error }` patterns to standard `{ error }` format.
6. **Frontend `api-client.ts`**: No changes needed. Already expects `{ error: string; code?: string }`.
7. **Exclusions**: Health-check routes (`ok` is domain data), draft-status (`status` is lifecycle state), SSE stream routes, cancel routes returning domain `{ ok, reason }`.

## Checklist

- [x] Create `lib/api-response.ts` with standardized error/success helpers
- [x] Create `lib/request-parser.ts` with typed JSON body parser
- [x] Write tests for both utilities
- [ ] Migrate highest-traffic routes first (tickets, story-writer, search)
- [ ] Migrate remaining routes
- [ ] Update frontend `api-client.ts` if error format changes
- [ ] All tests pass
