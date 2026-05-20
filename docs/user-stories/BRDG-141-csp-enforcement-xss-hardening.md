# BRDG-141: CSP Enforcement + XSS Defense-in-Depth

**Status:** Open
**Priority:** High

## Description

As the PO, I want the Content Security Policy enforced (not just report-only) and client-side XSS protections strengthened with defense-in-depth sanitization, so even if one layer fails, content injection attacks are still blocked.

The audit found: CSP is in report-only mode (violations are logged but not blocked), `script-src` allows `unsafe-inline`, and two `dangerouslySetInnerHTML` usages lack client-side re-sanitization.

## Implementation Plan

1. **Move theme init to external script** (`public/theme-init.js`) and remove `dangerouslySetInnerHTML` from layout.tsx. This eliminates the only inline script, enabling `unsafe-inline` removal.
2. **Enforce CSP** in next.config.ts: change `Report-Only` to enforced, remove `unsafe-inline` from `script-src`, add Clerk domains to `connect-src` and `script-src`.
3. **Create shared sanitize config** (`src/lib/sanitize-html-config.ts`) and client-safe sanitizer (`src/lib/sanitize-client.ts`). Refactor `sanitize.ts` to use shared config.
4. **Add client-side re-sanitization**: ConfluencePagesSection.tsx (bodyHtml) and renderMarkdown.tsx (Prism output).
5. **Validate redirect targets** in DeployNotifier.tsx with Jira key regex.
6. **Add Cache-Control headers** to ~20 GET routes returning user-specific data.
7. **Verify**: build, dev server, Clerk auth flows, theme switching, confluence preview, code highlighting.

Key risks: Clerk CSP compatibility (may need additional domains), `style-src 'unsafe-inline'` stays (required for dev mode HMR and runtime style attributes).

## Acceptance Criteria

### Enforce Content Security Policy
- [ ] In `next.config.ts`, change `Content-Security-Policy-Report-Only` to `Content-Security-Policy`
- [ ] Verify the app still functions correctly under enforced CSP (no console violations)
- [ ] Fix any legitimate inline scripts that break under enforcement

### Remove unsafe-inline from script-src
- [ ] Refactor the theme initialization script in `src/app/layout.tsx` (lines 50-56) to use a nonce-based approach or move to an external script
- [ ] Update CSP `script-src` to remove `'unsafe-inline'` and add `'nonce-{value}'` if needed
- [ ] Verify theme flash prevention still works (the script prevents FOUC on load)

### Client-side re-sanitization for Confluence HTML
- [ ] In `src/components/ticket-detail/ConfluencePagesSection.tsx`, add DOMPurify sanitization before rendering `data.bodyHtml` via `dangerouslySetInnerHTML`
- [ ] This is defense-in-depth: the server already sanitizes, but if that fails, the client catches it
- [ ] Use the same DOMPurify config as `src/lib/sanitize.ts` for consistency

### Prism code highlight sanitization
- [ ] In `src/components/ticket-detail/renderMarkdown.tsx` (line 294), sanitize Prism output through DOMPurify before injecting via `dangerouslySetInnerHTML`
- [ ] Prism is generally safe, but defense-in-depth protects against edge cases in grammar parsing

### Validate redirect targets
- [ ] In `src/components/DeployNotifier.tsx`, validate `n.jiraKey` matches the expected Jira key format (`/^[A-Z]+-\d+$/`) before using it in `window.location.href`
- [ ] Prevents potential open redirect if notification data is compromised

### Cache-Control headers on sensitive routes
- [ ] Audit all API routes returning user-specific data
- [ ] Ensure they include `Cache-Control: private, no-store` to prevent intermediate proxy caching
- [ ] Routes that already set proper cache headers can be skipped

## Technical Notes

- CSP enforcement is the most impactful change; test thoroughly in dev before deploying
- The nonce approach for script-src requires generating a per-request nonce in middleware and passing it to the layout; Next.js App Router supports this via `headers()`
- DOMPurify is already a dependency (`isomorphic-dompurify`), so client-side usage just needs the browser import
- Prioritize: CSP enforcement -> unsafe-inline removal -> client-side sanitization -> redirect validation -> cache headers
