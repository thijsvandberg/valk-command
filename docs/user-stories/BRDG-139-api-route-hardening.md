# BRDG-139: API Route Hardening (Error Handling + Input Validation)

**Status:** Open
**Priority:** High

## Description

As the PO, I want all API routes to follow consistent security practices for error handling and input validation, so internal implementation details are never leaked to clients and malformed input cannot cause unexpected behavior.

The security audit found: error messages leaking internal details, missing input validation on path/query parameters, unguarded JSON.parse calls on stored data, and SQL wildcard characters not being escaped in LIKE queries.

## Implementation Plan

1. **Create `src/lib/api-validation.ts`** with `validatePathParam()`, `escapeLikePattern()`, `safeJsonParse()` + test file
2. **Standardize error responses** across 22+ route files (27 locations) that return raw `err.message`. Replace with generic messages, ensure `logger.error()` is used. Add missing `logger` imports to 7 files.
3. **Safe JSON.parse** via `safeJsonParse()` in 8 files (~10 call sites): `pipelines/route.ts`, `burnup/route.ts`, `burnup/seed/route.ts`, `jira/sprints/route.ts`, `jira/sync-incremental/route.ts`, `settings/column-config/route.ts`, `tickets/[key]/reviews/route.ts`
4. **SQL wildcard escaping** via `escapeLikePattern()` in `pipelines/route.ts` and `notifications/route.ts`
5. **Date format validation** in `search/local/route.ts` for `custom:from..to` ranges
6. **CQL query length limit** in `confluence/search/route.ts` (max 1000 chars)
7. **Path parameter validation** via `validatePathParam()` across ~30 route files with dynamic segments

## Acceptance Criteria

### Standardize error responses
- [x] Audit all API routes for `err.message` or `error.message` being returned in JSON responses
- [x] Replace with generic user-facing messages (e.g., "Failed to save prompts", "Internal server error")
- [x] Ensure the original error is still logged server-side via `logger.error()`
- [x] Affected routes include: `settings/quick-prompts`, `settings/saved-searches`, and any other route returning raw Error.message

### Path parameter validation
- [ ] Add a shared utility (e.g., `validatePathParam(value: string, maxLength?: number)`) that rejects params longer than 255 characters
- [ ] Apply to all dynamic route segments: `[id]`, `[key]`, `[pageId]`, etc.
- [ ] Return 400 with a generic "Invalid parameter" message for violations

### Date format validation in search
- [ ] In `src/app/api/search/local/route.ts`, validate the `custom:from..to` date range format
- [ ] Reject non-ISO date strings with a 400 response
- [ ] Ensure NaN date comparisons cannot silently bypass filtering

### CQL query length limit
- [ ] In `src/app/api/confluence/search/route.ts`, enforce a maximum CQL query length (e.g., 1000 chars) when `mode=cql`
- [ ] Return 400 for oversized queries

### Safe JSON.parse for stored data
- [ ] Wrap all `JSON.parse()` calls on database-stored strings in try-catch
- [ ] Affected: `src/app/api/pipelines/route.ts` (ticketKeys, lastResult), and any other route parsing stored JSON
- [ ] Log a warning on parse failure, return a safe fallback (null or empty array)

### SQL wildcard escaping
- [ ] In `src/app/api/pipelines/route.ts`, escape `%` and `_` in user-provided values used in `like()` queries
- [ ] Create a shared `escapeLikePattern(value: string)` utility if needed

## Technical Notes

- Error response standardization is the highest-impact item; start there
- The path param validator can be middleware or a per-route utility; per-route is simpler for this codebase
- All changes should have corresponding test coverage
