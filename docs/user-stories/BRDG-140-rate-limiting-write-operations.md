# BRDG-140: Rate Limiting for Write/Delete Operations

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want all mutating API endpoints (POST, PUT, DELETE) to be rate-limited so the application is protected against abuse, spam, and bulk-deletion attacks.

Currently rate limiting covers `sync`, `story-writer`, `workspace`, and `read` tiers, but write and delete operations on comments, notifications, and other entities have no rate limits.

## Acceptance Criteria

### New rate limit tier
- [ ] Add a `write` tier to `src/lib/rate-limiter.ts` (suggested: 30 requests per 60 seconds)
- [ ] Add a `delete` tier (suggested: 15 requests per 60 seconds) or reuse `write` for both

### Apply to unprotected mutating routes
- [ ] `POST /api/tickets/[key]/comments` (comment creation)
- [ ] `DELETE /api/tickets/[key]/comments/[id]` (comment deletion)
- [ ] `DELETE /api/notifications` (notification deletion)
- [ ] `POST /api/tickets/[key]/story-writer` (session creation, beyond existing story-writer tier)
- [ ] Audit remaining POST/PUT/DELETE routes and apply where missing

### Response format
- [ ] Return HTTP 429 with `Retry-After` header (consistent with existing rate limiter behavior)
- [ ] Include a clear error message: "Rate limit exceeded. Try again later."

### Tests
- [ ] Unit tests for the new `write`/`delete` tier in rate limiter
- [ ] Integration test confirming 429 response after exceeding limit

## Technical Notes

- The existing `applyRateLimit()` pattern makes this straightforward: just add the tier config and call it in route handlers
- Consider whether the single-user nature of the app warrants less aggressive limits; the primary concern is accidental runaway client loops or compromised sessions, not multi-tenant abuse
- Outbound API call tracking (Jira, Bitbucket, Confluence) is already well-covered
