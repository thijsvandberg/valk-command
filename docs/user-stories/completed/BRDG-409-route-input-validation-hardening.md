# BRDG-409: Route input-validation hardening (dynamic path params + ad-hoc bodies)

**Status:** Completed
**Priority:** Medium
**Type:** Security / Stability — API routes

## Status

Shipped 2026-06-26. Added two shared helpers in `api-validation.ts` (`validateNumericId`
for the Confluence `pageId`, `validateAgentTaskId` for agent task/session ids) and
`assertValidJiraKeys` in `jql.ts`. Wired them in:

- Confluence `pageId` now `^\d+$` at the route AND `encodeURIComponent` inside
  `confluence-client` (both `getPage`/`getPageMetadata`).
- Agent task `id` guarded with `^[A-Za-z0-9_-]+$` in the stream + bulk-suggest routes;
  the agent path is also `encodeURIComponent`-wrapped.
- `confluence-links` (POST/DELETE) and `deploy-settings` (PUT) switched to
  `parseJsonBody(request, zodSchema)` → clean 400 on malformed/invalid bodies, validate
  before persisting.
- `assertValidJiraKeys` runs before every `key NOT IN (...)` clause in the four rank
  methods (ahead of the `isConfigured` guard so a malformed key always throws; all real
  callers already wrap rank calls in try/catch, so no behaviour change for valid input).
- `hiddenIds` validated with `z.array(z.number())`; `draftKey` constrained to
  `^DRAFT-[A-Za-z0-9]{4,16}$`.

Verified: full suite green (6866 tests), lint/typecheck/build clean, and exercised
against the running dev server (injected pageId/agent-id → 400; malformed bodies → 400
not 500; valid pageId reaches upstream; valid settings persist). One existing rank-test
fixture used the non-Jira-shaped placeholder `VPL-NEW`; corrected to a numeric key
(`VPL-100`) — ranking-behaviour intent unchanged.

## Description

The 2026-06-25 re-audit ([2026-06-25-refactor-reaudit.md](../investigations/2026-06-25-refactor-reaudit.md))
found a small cluster of routes where a dynamic path param flows unencoded/unvalidated into an
external API path, plus the last two write routes that still parse `request.json()` without a guard.
The app is single-user behind Clerk auth, so the security blast radius is bounded, but these bypass
the strict-validation pattern used everywhere else and are cheap to close in one pass. This is the
same class BRDG-375 centralized for Jira (`issuePath` + `encodeURIComponent`); a few boundaries were
left out.

## Current Behaviour

- **Confluence `pageId` injected unencoded into the upstream path (High, security).**
  [confluence/pages/[pageId]/route.ts:98](../../src/app/api/confluence/pages/[pageId]/route.ts)
  validates `pageId` only with `validatePathParam` (length + null byte; allows `? # ..`), then
  [confluence-client.ts:168,186](../../src/lib/confluence-client.ts) interpolates it raw into
  `` `/wiki/api/v2/pages/${pageId}?...` ``. Next.js URL-decodes route params, so
  `123%3Fbody-format=storage` decodes to `pageId="123?body-format=storage"` and injects/overrides
  upstream query params (e.g. fetch raw storage format that bypasses the route's DOMPurify
  view-format assumption). Legitimate pageIds are numeric (`confluence-url-detector.ts:21`).
- **Agent task `id` injected unencoded into the agent path (Medium, security).**
  [workspace-tasks/[id]/stream/route.ts:14](../../src/app/api/workspace-tasks/[id]/stream/route.ts)
  and [refinement-sessions/[id]/bulk-suggest-subtasks/route.ts:46](../../src/app/api/refinement-sessions/[id]/bulk-suggest-subtasks/route.ts)
  interpolate `id` after only `validatePathParam`. The agent base is trusted, so lower impact, but the
  same `/ ? ..` gap exists.
- **`request.json()` without try/catch (Medium, stability).**
  [tickets/[key]/confluence-links/route.ts:42,89](../../src/app/api/tickets/[key]/confluence-links/route.ts)
  (POST + DELETE) and [pipelines/deploy-settings/route.ts:48](../../src/app/api/pipelines/deploy-settings/route.ts)
  (PUT) parse the body raw → a malformed body throws an unhandled 500 instead of a clean 400.
  `deploy-settings` additionally `JSON.stringify`s and persists the body with no schema, so an
  arbitrary blob can be stored under the settings key. These are the only two write routes missing the
  shared `parseJsonBody` guard (all others were verified to handle it).
- **JQL `key NOT IN (...)` keys unvalidated (Low, security).**
  [jira-client.ts:1077,1089,1103,1133](../../src/lib/jira-client.ts) interpolate issue keys as bare
  (unquoted) JQL identifiers with no `isValidJiraKey` check (keys are internal today, so not currently
  reachable from raw user text — defense in depth).
- **Unvalidated stored values (Low).** [jira/sprints/route.ts:128](../../src/app/api/jira/sprints/route.ts)
  casts `hiddenIds` instead of validating it is a `number[]`; [story-writer/create-draft/route.ts:31-33](../../src/app/api/story-writer/create-draft/route.ts)
  checks only the `DRAFT-` prefix of the client-supplied `draftKey`, leaving the suffix unconstrained
  (parameterized insert, so no SQLi, but the key shape is unbounded).

## Proposed Approach

1. **Restrict `pageId` to `^\d+$`** in the Confluence route AND `encodeURIComponent(pageId)` inside
   `confluence-client` (mirror Jira's `issuePath`).
2. **Add a format guard** (UUID / `^[A-Za-z0-9_-]+$`) or `encodeURIComponent` for the agent task `id`
   in the stream + bulk-suggest routes.
3. **Switch the two raw-`request.json()` routes to `parseJsonBody(request, zodSchema)`** with schemas
   matching `{pageId,pageTitle,pageUrl}` and `DeployNotificationSettings` respectively.
4. **Assert `issueKeys.every(isValidJiraKey)`** before building the `key NOT IN` clause.
5. **Validate `hiddenIds` with `z.array(z.number())`** and constrain `draftKey` to
   `^DRAFT-[A-Za-z0-9]{4,16}$`.

No behaviour change for legitimate input; only malformed/hostile input is rejected with a clean 400.

## Acceptance Criteria

- [x] A non-numeric / query-bearing `pageId` is rejected (or encoded) and cannot alter the upstream
      Confluence request shape.
- [x] A `/ ? ..`-bearing agent task `id` cannot alter the upstream agent path.
- [x] `confluence-links` (POST/DELETE) and `deploy-settings` (PUT) return a clean 400 on malformed
      bodies and validate before persisting.
- [x] `key NOT IN (...)` rejects non-Jira-key inputs.
- [x] `hiddenIds` and `draftKey` are validated before persistence.
- [x] No regression for valid pageIds, task ids, bodies, keys, or settings.

## Tests

- [x] Confluence route: a `pageId` like `1?x=y` is rejected/encoded; a numeric pageId still works.
- [x] Agent stream route: a malformed `id` is rejected; a valid id streams.
- [x] `confluence-links` / `deploy-settings`: malformed body → 400 (not 500); valid body persists.
- [x] `jira-client`: `key NOT IN` throws/early-returns on an invalid key.

## Open Questions

- **Centralize vs. per-route.** A shared `assertNumericId` / `assertAgentTaskId` helper (consistent,
  matches `issuePath`) vs. inline guards. Recommend small shared helpers in `api-validation.ts`.

## Related

- [[2026-06-25-refactor-reaudit]] — source audit (Route input validation hardening).
- [[BRDG-375-close-xss-and-injection-vectors]] — the prior boundary-hardening story this extends.
- Touch points: `confluence/pages/[pageId]` route + `confluence-client.ts`, `workspace-tasks/[id]/stream`
  + `bulk-suggest-subtasks` routes, `confluence-links` route, `pipelines/deploy-settings` route,
  `jira-client.ts`, `jira/sprints` route, `story-writer/create-draft` route.
