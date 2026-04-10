# BRDG-062: Input Sanitization

**Status:** Open
**Priority:** Critical

## Description

As the app owner, I want all user input sanitized before rendering and storage so the app is protected against XSS, injection, and other input-based attacks.

## Acceptance Criteria

### Phase 1: HTML/XSS sanitization
- [ ] Sanitize all markdown/HTML content before rendering (use DOMPurify or similar)
- [ ] Sanitize story content, comments, and notes before database storage
- [ ] Strip dangerous HTML tags and attributes (script, onclick, onerror, etc.)
- [ ] Allow safe markdown features (bold, italic, links, code, tables, lists)

### Phase 2: API input validation
- [ ] Zod schemas for all API route request bodies
- [ ] Validate and sanitize query parameters
- [ ] Reject requests with invalid input (400 Bad Request with clear error messages)
- [ ] Maximum input length constraints (title: 500 chars, description: 50000 chars, comment: 10000 chars)

### Phase 3: SQL injection prevention
- [ ] Audit all database queries for string concatenation (should be zero; Drizzle ORM parameterizes)
- [ ] Ensure no raw SQL queries bypass Drizzle's parameterization
- [ ] Add tests verifying SQL injection attempts are handled safely

### Phase 4: Content Security
- [ ] Sanitize file names for attachment uploads
- [ ] Validate MIME types for uploaded files
- [ ] Limit upload sizes (max 10MB per file)
- [ ] Strip EXIF data from uploaded images (privacy)

## Technical Notes

- DOMPurify for HTML sanitization (server-side via jsdom, client-side natively)
- Zod already available in project dependencies
- Drizzle ORM parameterizes queries by default; audit is a verification step
- React's JSX already escapes strings by default; risk is in `dangerouslySetInnerHTML` and markdown rendering

## Out of Scope (for now)
- WAF (Web Application Firewall)
- CAPTCHA
- Content moderation
- Abuse detection
