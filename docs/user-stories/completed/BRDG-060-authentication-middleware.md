# BRDG-060: Authentication Middleware

**Status:** Open
**Priority:** Critical

## Description

As the app owner, I want session-based authentication with middleware that protects all routes and API endpoints so the app is not accessible to anyone on the network.

## Core Concepts

- **Simple auth**: single-user password-based login (no user management needed)
- **Login page**: clean login form with password field
- **Session**: HTTP-only secure cookie with configurable expiry (default 7 days)
- **Middleware**: Next.js middleware that checks session on every request
- **Protected routes**: all `/app/*` pages and `/api/*` endpoints require valid session
- **Excluded routes**: login page, health check endpoint, stakeholder view (has own token auth)
- **Password hashing**: bcrypt or argon2 for stored password hash
- **Environment config**: password hash stored in env var (not in DB)

## Acceptance Criteria

### Phase 1: Login page
- [ ] Login page at `src/app/login/page.tsx` (outside the `(app)` group)
- [ ] Clean login form with password field and submit button
- [ ] Client-side form validation (non-empty password)
- [ ] Error message display for incorrect password
- [ ] Redirect to dashboard on successful login
- [ ] Loading state on submit button while authenticating

### Phase 2: Session management
- [ ] API route `src/app/api/auth/login/route.ts` that verifies password against stored hash
- [ ] Create signed session cookie (HTTP-only, secure, SameSite=Strict) on successful login
- [ ] Session token: signed JWT or random token validated against server-side hash
- [ ] Configurable session expiry via environment variable (default 7 days)
- [ ] Session validation utility at `src/lib/auth.ts`

### Phase 3: Next.js middleware
- [ ] `middleware.ts` at project root that intercepts all requests
- [ ] Check for valid session cookie on every request
- [ ] Redirect unauthenticated requests to `/login` for page routes
- [ ] Exclude `/login`, `/api/health`, and stakeholder routes from protection
- [ ] Preserve original URL as redirect target after login (return to intended page)

### Phase 4: API route protection
- [ ] All `/api/*` endpoints return 401 for unauthenticated requests (not redirect)
- [ ] JSON error response body with clear message for 401 responses
- [ ] Utility function `requireAuth()` for API route handlers as a secondary check
- [ ] Exclude health check endpoint from authentication requirement

### Phase 5: Logout functionality
- [ ] API route `src/app/api/auth/logout/route.ts` that clears session cookie
- [ ] Logout button in the app sidebar or settings page
- [ ] Redirect to login page after logout
- [ ] Invalidate session server-side (not just client cookie removal)

### Phase 6: Login rate limiting
- [ ] Track failed login attempts per time window (in-memory)
- [ ] Limit to 5 failed attempts per minute
- [ ] Return 429 with Retry-After header when limit exceeded
- [ ] Clear rate limit counter on successful login

## Technical Notes

- Next.js `middleware.ts` at project root handles route protection
- Session token: signed JWT or random token stored in cookie + validated against hash
- No external auth library needed for single-user (keep it simple)
- Login page at `src/app/login/page.tsx` (outside the `(app)` group)
- API routes return 401 instead of redirecting
- Rate limiting on login endpoint: 5 attempts per minute
- Password set via environment variable `BRIDGE_PASSWORD_HASH`
- Consider using `crypto.subtle` for token signing to avoid heavy dependencies

## Out of Scope (for now)

- Multi-user support
- SSO/OAuth integration
- Two-factor authentication (2FA)
- Password reset flow
- User management UI
- "Remember me" toggle (session expiry is configurable globally)
