# BRDG-065: Content Security Policy and Security Headers

**Status:** Open
**Priority:** Critical

## Description

As the app owner, I want proper security headers configured so the app is hardened against common web attacks like clickjacking, MIME sniffing, and XSS.

## Acceptance Criteria

### Phase 1: Security headers in middleware
- [ ] Next.js middleware or `next.config.ts` headers configuration
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `X-Frame-Options: DENY` (prevent clickjacking)
- [ ] `X-XSS-Protection: 0` (disabled in favor of CSP)
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] `Permissions-Policy: camera=(), microphone=(), geolocation=()`

### Phase 2: Content Security Policy
- [ ] CSP header restricting script sources to self (no inline scripts or eval)
- [ ] Allow specific external domains: Jira, Bitbucket (for API calls and images)
- [ ] `style-src 'self' 'unsafe-inline'` (Tailwind generates inline styles)
- [ ] `img-src 'self' data: https://avatar-management--avatars.*.atlassian.com` (Jira avatars)
- [ ] Report-only mode initially for testing, then enforce

### Phase 3: HTTPS enforcement
- [ ] `Strict-Transport-Security: max-age=31536000; includeSubDomains` (when deployed with HTTPS)
- [ ] Redirect HTTP to HTTPS in production
- [ ] Secure cookie flags (already in BRDG-060)

### Phase 4: Verification
- [ ] Test with securityheaders.com or similar scanner
- [ ] Verify app functions correctly with all headers enabled
- [ ] Document any CSP exceptions and their justification
- [ ] Add header verification to CI (curl-based check)

## Technical Notes

- Next.js supports headers in `next.config.ts` via the `headers()` function
- CSP nonce for inline scripts: use Next.js built-in CSP nonce support
- Start with CSP report-only to catch violations without breaking the app
- Jira avatar URLs need to be whitelisted in img-src
- TipTap editor may need specific CSP allowances for style-src

## Out of Scope (for now)
- Subresource Integrity (SRI) for external scripts
- Certificate pinning
- CORS configuration (single-origin app)
- Web Application Firewall rules
