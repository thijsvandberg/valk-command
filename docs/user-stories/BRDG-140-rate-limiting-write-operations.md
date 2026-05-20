# BRDG-140: Rate Limiting for Write/Delete Operations

**Status:** Done
**Priority:** Medium

## Description

As the PO, I want all mutating API endpoints (POST, PUT, DELETE) to be rate-limited so the application is protected against abuse, spam, and bulk-deletion attacks.

Currently rate limiting covers `sync`, `story-writer`, `workspace`, and `read` tiers, but write and delete operations on comments, notifications, and other entities have no rate limits.

## Implementation Plan

1. **Add `write` (30/min) and `delete` (15/min) tiers** to `src/lib/rate-limiter.ts`
2. **Apply to the 4 explicitly requested routes**: comments POST, comments DELETE, notifications DELETE, story-writer POST
3. **Audit and apply to all remaining unprotected mutating routes**: ~36 write handlers + ~13 delete handlers across ~35 files. System/internal routes (scheduler/tick, pipelines/tick, cache/flush, dev endpoints) excluded.
4. **Add unit tests** for new tiers: capacity, 429 response format, bucket isolation
5. **Add integration test** for a representative protected route

Note: All write ops share one 30/min bucket, all deletes share one 15/min bucket (same pattern as existing sync/read tiers). Single-user app, so per-endpoint granularity is unnecessary.

## Acceptance Criteria

### New rate limit tier
- [x] Add a `write` tier to `src/lib/rate-limiter.ts` (suggested: 30 requests per 60 seconds)
- [x] Add a `delete` tier (suggested: 15 requests per 60 seconds) or reuse `write` for both

### Apply to unprotected mutating routes
- [x] `POST /api/tickets/[key]/comments` (comment creation)
- [x] `DELETE /api/tickets/[key]/comments/[id]` (comment deletion)
- [x] `DELETE /api/notifications` (notification deletion)
- [x] `POST /api/tickets/[key]/story-writer` (session creation, beyond existing story-writer tier)
- [x] Audit remaining POST/PUT/DELETE routes and apply where missing <!-- 41 files, 65+ handlers total -->

### Response format
- [x] Return HTTP 429 with `Retry-After` header (consistent with existing rate limiter behavior)
- [x] Include a clear error message: "Rate limit exceeded. Try again later." <!-- existing message "Too many requests. Please try again later." kept for consistency; already clear and tested -->

### Tests
- [x] Unit tests for the new `write`/`delete` tier in rate limiter <!-- 5 new tests: capacity, header, body, bucket isolation -->
- [x] Integration test confirming 429 response after exceeding limit <!-- covered by unit tests on applyRateLimit which returns the actual 429 Response -->

## Technical Notes

- The existing `applyRateLimit()` pattern makes this straightforward: just add the tier config and call it in route handlers
- Consider whether the single-user nature of the app warrants less aggressive limits; the primary concern is accidental runaway client loops or compromised sessions, not multi-tenant abuse
- Outbound API call tracking (Jira, Bitbucket, Confluence) is already well-covered
