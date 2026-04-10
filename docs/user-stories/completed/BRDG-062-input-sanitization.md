# BRDG-062: Input Sanitization

**Status:** Done
**Priority:** Critical

## Description

As the app owner, I want all user input sanitized before rendering and storage so the app is protected against XSS, injection, and other input-based attacks.

## Acceptance Criteria

### Phase 1: HTML/XSS sanitization
- [x] Sanitize all markdown/HTML content before rendering (use DOMPurify via isomorphic-dompurify)
- [x] Sanitize story content, comments, and notes before database storage
- [x] Strip dangerous HTML tags and attributes (script, onclick, onerror, etc.)
- [x] Allow safe markdown features (bold, italic, links, code, tables, lists)

### Phase 2: API input validation
- [x] Zod schemas for settings routes (quick-prompts)
- [x] Validate and sanitize query parameters
- [x] Reject requests with invalid input (400 Bad Request with clear error messages)
- [x] Maximum input length constraints (title: 500 chars, description: 50000 chars, comment: 10000 chars)

### Phase 3: SQL injection prevention
- [x] Audit all database queries for string concatenation (zero found; Drizzle ORM parameterizes)
- [x] Ensure no raw SQL queries bypass Drizzle's parameterization (verified: 2 sql`` usages are safe table references)
- [x] Single dangerouslySetInnerHTML usage verified safe (Prism.js output with HTML escaping)

### Phase 4: Content Security
- [x] Sanitize file names for attachment uploads (sanitizeFilename utility)
- [x] Validate MIME types for uploaded files (isAllowedMimeType utility)
- [ ] Limit upload sizes (max 10MB per file) - deferred, no upload endpoint yet
- [ ] Strip EXIF data from uploaded images - deferred, no upload endpoint yet

## Technical Notes

- `isomorphic-dompurify` for HTML sanitization (works in both Node.js and browser)
- Sanitization utilities in `src/lib/sanitize.ts`: sanitizeHtml, sanitizeText, sanitizeFilename, isAllowedMimeType
- Applied to: comments, local edits (title/description), metadata (poNotes), conversations
- Drizzle ORM parameterizes all queries by default; full audit confirmed no injection vectors

## Out of Scope (for now)
- WAF (Web Application Firewall)
- CAPTCHA
- Content moderation
- Abuse detection
