# BRDG-379: Unify HTTP client infrastructure (timeouts, retry, error mapping)

**Status:** Not Started
**Priority:** Medium
**Type:** Structure / Stability — integration clients

## Description

The codebase audit ([2026-06-22-codebase-audit.md](../investigations/2026-06-22-codebase-audit.md))
found four independent fetch stacks across the integration clients, each with a different policy
for timeout, retry/backoff, and error shape — and two of them have **no timeout at all**, so a hung
upstream can wedge a background sync tick. There are also two divergent copies of the Bitbucket
client. This story consolidates them into one shared HTTP helper so resilience is consistent and
bug fixes land in one place. The most urgent piece (the missing timeouts) is a stability fix; the
consolidation is the structural payoff.

## Current Behaviour

- **No timeout on Bitbucket/Confluence.** [bitbucket-client.ts:159-175](../../src/lib/bitbucket-client.ts)
  (`bbFetch`), [pipeline-sync.ts:133-171](../../src/lib/pipeline-sync.ts) (`bbFetch`/`bbFetchUrl`/
  `bbFetchStatus`), and [confluence-client.ts:66-81](../../src/lib/confluence-client.ts) pass no
  `AbortSignal`/timeout. `jira-client` (10s `makeTimeoutSignal`) and `agent-fetch`
  (`AbortSignal.timeout`) both have one. In `pipeline-sync` the timeoutless fetch runs inside a
  background lazy-cron tick that fans out many calls (`mapWithConcurrency`, range-walk pagination),
  so one hung socket can wedge the whole tick.
- **Two divergent Bitbucket clients.** [bitbucket-client.ts:159](../../src/lib/bitbucket-client.ts)
  and [pipeline-sync.ts:133](../../src/lib/pipeline-sync.ts) each define their own
  `getBitbucketConfig`, auth header, `bbFetch`, `detectEnvironment`, and pipeline-step state
  mapping. They have already diverged (pipeline-sync logs non-OK, has `silent404` + `bbFetchStatus`;
  bitbucket-client does not). The deploy-detection heuristic existing in two slightly different
  forms is a correctness hazard.
- **Four resilience policies.** `agent-fetch` (retry + backoff + timeout + typed result union,
  never throws), `jira-client.ts:264-476` (`withRetry` + `makeTimeoutSignal` + throws
  `JiraApiError`, retries 429/503), bitbucket/confluence (no retry, no timeout, return `null` or
  throw generic `Error`). Retryable-status sets and error shapes all differ; there is no shared
  notion of "retry with backoff honoring `Retry-After`".

## Proposed Approach

1. **Quick stability fix first (can ship independently):** add `signal: AbortSignal.timeout(10_000)`
   to every Bitbucket/Confluence fetch and wrap the call sites in try/catch where they assume a
   resolved promise. This closes the wedge risk without waiting for the full refactor.
2. **Shared `httpClient` helper** (`src/lib/http-client.ts`) taking
   `{ baseUrl, auth, timeout, retryStatuses, maxRetries }` and centralizing: timeout, exponential
   backoff with jitter, `Retry-After` honoring, and a consistent error classification. Decide one
   error contract (recommend a typed result union like `agent-fetch`, or a shared error class).
3. **Consolidate the Bitbucket client** — one `bitbucket-fetch.ts` (config + auth + fetch variants)
   and one `bitbucket-deploy-heuristics.ts` (environment + step-state mapping); both
   `bitbucket-client.ts` and `pipeline-sync.ts` import them.
4. **Migrate Jira/agent/Confluence onto the shared helper** incrementally, preserving each client's
   current public surface and observed behaviour.

This is a refactor with **no intended behaviour change** for callers; the win is consistent
timeouts/retries and a single place to fix resilience bugs.

## Implementation Plan

**Scope decision:** Migrate Bitbucket + Confluence onto the new shared helper (they are the timeout-less clients and where the wedge bug lives). Leave Jira and agent-fetch in place — both already have robust, well-tested timeout+retry+`Retry-After`; rewriting Jira's currently-untested `withRetry` risks an AC4 behaviour change for no gain. The story's Open Questions explicitly permit deferring the full four-client migration. The new helper is shaped to mirror `agent-fetch`'s contract so a later Jira/agent migration is mechanical. AC1 is still fully met (Jira/agent already have timeouts; Bitbucket/Confluence gain them).

**Error contract:** typed result union `HttpResult<T>` (never throws for expected failures), `agent-fetch` style. Each client adapts it back to its current public surface (Bitbucket returns `null`/throws on network; Jira throws; Confluence throws) so callers see no change.

1. **`src/lib/http-client.ts` (new).** `httpFetch<T>(url, opts)` returning `HttpResult<T>`. Centralizes: `AbortSignal.timeout` (default 10s), exponential backoff with jitter, `Retry-After` honoring (ported from Jira), error classification (`TIMEOUT|UNREACHABLE|AUTH|SERVER_ERROR|CLIENT_ERROR|INVALID_RESPONSE`). Options: `method, body, headers, init` (passthrough for `next:{revalidate:0}`), `timeout, maxRetries, retryStatuses, onRequest` (fires once per attempt → keeps `trackOutboundCall` firing), `parse, sleep, jitter` (last two injectable for deterministic tests). Network/timeout errors surface as `status: 0`. HTTP-error results carry the raw response `body` so adapters can reconstruct legacy messages.
2. **`src/lib/http-client.test.ts` (new)** — Tests checkbox 1. Timeout of a hung request (AbortError → `TIMEOUT`, status 0); retries configured statuses with backoff (inject `sleep`/`jitter`, assert `retryCount` + delay arg); honors `Retry-After` (assert `sleep` got `2000`); error contract (401→AUTH, 500→SERVER_ERROR, non-JSON→INVALID_RESPONSE, throw→UNREACHABLE); `onRequest` fires once per attempt.
3. **`src/lib/bitbucket-fetch.ts` (new)** — AC3 (config+fetch). `getBitbucketConfig`, `isBitbucketConfigured`, `bbAuthHeaders`, `bbFetch<T>(repo, path, silent404?)`, `bbFetchUrl<T>(url)`, `bbFetchStatus<T>(repo, path)`, `isTransientStatus`. All call `httpFetch` with `onRequest: trackOutboundCall("bitbucket")`, `maxRetries: 0` (preserve exact fetch-call counts in pipeline-sync tests). **Adapter rule (load-bearing for AC4):** `ok`→data; `!ok && status===0` (network/timeout)→**throw** (preserves `classifyRunDeployment`'s in-cycle retry); `!ok && status!==0` (HTTP error)→`null`. `bbFetchStatus` swallows everything into `{status,data}`. Adopt pipeline-sync's non-OK `logger.info` (logging-only change). Keeps pipeline-sync's logging superset.
4. **`src/lib/bitbucket-deploy-heuristics.ts` (new)** — AC3 (heuristic). Pure functions: `detectEnvironment` (**pipeline-sync's `uat[\s_-]*(\d+)` version wins** — strict superset of bitbucket-client's UAT1/2/3-only patterns, non-regressing), `inferEnvironmentFromBranch`, `classifyStepsForDeployment`, `normalisePipelineState` (PAUSED-aware), `normalisePipelineStepState`, `normaliseBuildState`, `normalisePrStatus`, `extractAuthor`, `shortRepoName`, `containsExactKey`. Leave `extractTicketKey`/`extractAllTicketKeys` in pipeline-sync (sync-specific, contains blast radius).
5. **`src/lib/bitbucket-client.ts` (modify)** — AC1/2/3. Delete local config/fetch/heuristic copies; import from the two new modules and **re-export** the names tests + app code import (`extractAuthor, normalisePrStatus, normaliseBuildState, shortRepoName, containsExactKey, detectEnvironment`). Keep `isConfigured` name (alias `isBitbucketConfigured`). `fetchDevInfo` body unchanged.
6. **`src/lib/pipeline-sync.ts` (modify)** — AC1/2/3. Delete local config/fetch/heuristic copies; import from new modules and **re-export** `detectEnvironment, classifyStepsForDeployment, inferEnvironmentFromBranch` so `pipeline-sync.test.ts` imports resolve unchanged. Keep `isPipelineConfigured` name. All call-site signatures unchanged.
7. **`src/lib/confluence-client.ts` (modify)** — AC1/2. Replace private `fetch<T>` body with `httpFetch` (`onRequest: trackOutboundCall("confluence")`, `timeout: 10s`, `maxRetries: 0`, `init: {next:{revalidate:0}}`). On `!ok`, reconstruct the exact legacy message `Confluence API <status>: <body.slice(0,200)>` and throw `Error` (preserves the asserted message).
8. **Augment Bitbucket/Confluence tests** — Tests checkbox 2. AbortError → clean result (`fetchDevInfo`→`EMPTY_DEV_INFO`, `bbFetch`→throws/handled, Confluence→throws), not a hang.
9. **Full suite green** — AC4 + Tests checkbox 3. `npx vitest run src/lib/`; existing jira/bitbucket/confluence/pipeline-sync/agent suites pass unmodified.

## Acceptance Criteria

- [ ] Every outbound integration request (Jira, agent, Bitbucket, Confluence, pipeline-sync) has a
      bounded timeout; a hung upstream cannot wedge a sync tick.
- [ ] One shared HTTP helper provides timeout, backoff, `Retry-After`, and a consistent error
      contract; the clients are built on it.
- [ ] The Bitbucket config/fetch/deploy-heuristic logic exists once, imported by both
      `bitbucket-client.ts` and `pipeline-sync.ts`.
- [ ] No behavioural change for existing callers (same data, same error surfacing) — verified by
      the existing client test suites passing.

## Tests

- [x] `http-client.test.ts`: times out a hung request; retries the configured statuses with backoff;
      honors `Retry-After`; surfaces the agreed error contract.
- [ ] Bitbucket/Confluence client tests: a timeout produces a clean error, not a hang.
- [ ] Existing `jira-client` / `bitbucket-client` / `confluence-client` / `pipeline-sync` tests
      stay green after migration.

## Open Questions

- **Error contract.** Typed result union (`agent-fetch` style, never throws) vs. a shared error
  class (`jira-client` style, throws). Recommend: pick one and migrate all clients to it; the
  union is friendlier to callers but is a larger change. Decide before starting.
- **Scope.** Ship the timeout fix + Bitbucket consolidation first (high value, low risk); treat the
  full four-client `httpClient` migration as a follow-up if it grows too large.

## Related

- [[2026-06-22-codebase-audit]] — source audit (Structure — HTTP infrastructure).
- Touch points: `bitbucket-client.ts`, `pipeline-sync.ts`, `confluence-client.ts`, `jira-client.ts`,
  `agent-fetch.ts`.
