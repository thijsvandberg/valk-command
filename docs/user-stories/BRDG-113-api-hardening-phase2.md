# BRDG-113: API Route Hardening Phase 2

**Status:** Open
**Priority:** High
**Follows:** BRDG-020 (API Route Hardening, done)

## Description

Follow-up to BRDG-020. Several issues remain in the API layer that need to be addressed to ensure consistency, safety, and reliability across all routes.

## Issues

### 1. Inconsistent error response shapes

Mix of formats across routes:

- `{ error: "message" }`
- `{ error: "message", code: "CODE" }`
- `{ error: "message", errorDetail: "..." }`
- `{ ok: true }` vs `{ success: true }` for success responses

### 2. Missing Zod validation on 40% of POST/PUT routes

- `src/app/api/settings/column-config/route.ts` - basic type checks only
- `src/app/api/settings/column-widths/route.ts` - basic type checks only
- Several ticket routes use manual checks instead of schemas

### 3. Race conditions

- `src/app/api/followed-tickets/route.ts` - check-then-insert without atomicity
- `src/app/api/followed-sprints/route.ts` - same pattern
- `src/app/api/tickets/[key]/story-writer/route.ts` - session creation can race

### 4. Unbounded array inputs

- `src/app/api/jira/sync-tickets/route.ts` accepts unlimited ticketKeys array

### 5. Blocking route handler

- `src/app/api/tickets/[key]/reviews/generate/route.ts` polls synchronously for up to 3 minutes

### 6. Cleanup in GET handlers

- `src/app/api/activity-log/route.ts` runs retention cleanup on every GET
- `src/app/api/notifications/route.ts` runs cleanup on every GET

## Acceptance Criteria

- [ ] Standardize all error responses to `{ error: string, code?: string }`
- [ ] Standardize success responses to return data directly (no ok/success wrappers)
- [ ] Add Zod schemas to all remaining POST/PUT/PATCH routes
- [ ] Add max length validators on array inputs (e.g., ticketKeys max 100)
- [ ] Fix race conditions with atomic upsert patterns
- [ ] Move review generation to async pattern (return task ID, poll via SSE)
- [ ] Move cleanup tasks from GET handlers to scheduler
- [ ] Tests for all changed routes
