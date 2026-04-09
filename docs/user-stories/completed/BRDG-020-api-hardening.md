# BRDG-020: API Route Hardening

**Status:** Done
**Priority:** High
**Estimate:** Small
**Depends on:** BRDG-018

## Description

Several API routes have input validation gaps, verbose error messages that leak internal details, and missing bounds on query parameters. This story tightens up all API routes without changing their external contracts.

## Context

The app has ~30 API routes under `src/app/api/`. Most have decent validation (field types, enum checks, length limits) but some gaps remain. The Jira client throws errors containing full API paths and response bodies. The agent proxy uses a hardcoded fallback key. These are not publicly exposed (single-user app on localhost) but should be fixed for correctness and to prevent issues if the app is ever exposed.

## Acceptance Criteria

### Phase 1: Input validation fixes
- [x] `src/app/api/sync-log/route.ts:16` - Add bounds check on `limit` parameter: `Math.max(1, Math.min(parsedLimit, 500))`
- [x] `src/app/api/workspace-tasks/route.ts:4-16` - Add basic validation for POST body before proxying to agent (at minimum: check `body` is an object, has a `skillName` string field)
- [x] `src/app/api/workspace-tasks/[id]/route.ts` - Same: validate body shape on PATCH (N/A: route only has GET/DELETE, no PATCH handler)

### Phase 2: Error message sanitization
- [x] `src/lib/jira-client.ts:156` - The `jiraFetch` function throws errors containing `path` and full response `body`. Change to: log the detailed error with `console.error(...)`, throw a generic `new Error("Jira API request failed")`
- [x] `src/lib/jira-client.ts:179` - Same pattern in `jiraPost`
- [x] Review all `catch` blocks in API routes that return `error.message` to clients - ensure none leak stack traces or internal paths. Key files:
  - `src/app/api/jira/sync-tickets/route.ts:238`
  - `src/app/api/jira/sync-sprints/route.ts:91`
  - `src/app/api/jira/sync-comments/route.ts:93`

### Phase 3: Agent proxy safety
- [x] `src/lib/agent-proxy.ts:6-7` - Remove the `"dev-key"` fallback for `AGENT_KEY`. If the env var is missing, throw a clear error at call time (not at import time, since other routes don't need it)
- [x] `src/lib/agent-proxy.ts` - The `AGENT_URL` fallback to localhost:3001 is fine for dev

### Phase 4: Consistent error responses
- [x] Audit all routes for `.catch(() => null)` patterns that silently swallow JSON parse errors (e.g., `src/app/api/tickets/[key]/local-edits/route.ts:28`). Replace with explicit `try { await request.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }`
- [x] Ensure all routes return `{ error: string }` shape on errors (some return plain strings, some return objects)

## Key Files

- `src/lib/jira-client.ts` - Jira API wrapper (error handling)
- `src/lib/agent-proxy.ts` - agent proxy helper
- `src/app/api/sync-log/route.ts` - unbounded limit
- `src/app/api/workspace-tasks/route.ts` - unvalidated proxy
- All `src/app/api/**/route.ts` files for error response audit

## Verification

```bash
npx vitest run          # all existing tests still pass
npm run typecheck       # no type errors
npm run build           # clean build
# Manual: POST to /api/sync-log?limit=999999 - should cap at 500
# Manual: POST invalid JSON to /api/workspace-tasks - should return 400
# Manual: trigger a Jira sync with bad credentials - error response should not contain API paths
```
