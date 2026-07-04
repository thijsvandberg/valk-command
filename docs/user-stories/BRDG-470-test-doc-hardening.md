# BRDG-470: Test-doc hardening: surface silent background failures, stricter API validation

**Status:** To Do
**Priority:** Low
**Type:** Tech

## Description

Follow-up hardening from the 2026-07-04 feature audit. Two real gaps remain after the 2026-07-03 refactor:

1. When a background test-doc generation (the fire-and-forget path from the status line) fails or times out, the result silently vanishes: the server logs a warning after ~6 minutes of polling and nothing reaches the user. The PO assumes a doc was generated when it was not.
2. `PUT /api/tickets/[key]/test-doc` accepts `markdown` and `notNeeded` in the same body and silently ignores the markdown (the `notNeeded` branch wins). Ambiguous requests should be rejected.

Additionally, verify one suspected edge case in the review popup's saved-state tracking (`hasSavedRef` in `useTestDocReview.ts`) around bulk save → mark-not-needed → revisit sequences.

## Current Behaviour

- `src/lib/test-doc-background.ts`: `POLL_INTERVAL_MS = 3000`, `MAX_ATTEMPTS = 120`, hardcoded. On persistent poll errors or timeout, the loop exits with only a server-side log; no draft lands, no user-visible signal. The client-side capture in `useTestDocBoard.ts` shows a toast when a draft lands within its window, but nothing when it never lands.
- `src/app/api/tickets/[key]/test-doc/route.ts:123-196`: the PUT branches sequentially on `notNeeded` before validating `markdown`; a body carrying both silently drops the markdown. (Note: the idempotent no-op on unsetting an absent marker is deliberate, per BRDG-467 — keep it.)
- `useTestDocReview.ts:156,172,305,370,412`: `hasSavedRef` is added to on cache lookup (`data.saved`) and on save, deleted on mark-not-needed. Whether a bulk sequence can leave it stale (suppressing the draft pending-edit for a key that no longer has a saved doc) is unverified.

## Proposed Approach

1. **Background failure visibility.**
   - Make the poll tunables env-configurable (`TEST_DOC_POLL_INTERVAL_MS`, `TEST_DOC_POLL_MAX_ATTEMPTS`), defaults unchanged.
   - On terminal failure/timeout, log at error level including ticket key and task id.
   - Client side: when the board capture window closes without a draft having landed for a key it was watching, show a warning toast naming the ticket ("generation did not complete; try again from the ticket") instead of staying silent. No retry mechanism, no persistent failure state in the DB.
2. **PUT body validation.** Reject bodies that combine `markdown` with `notNeeded` (400, clear message) via the route's zod schema. Bodies with neither keep the existing "markdown is required" error.
3. **hasSavedRef verification.** Reproduce the suspected sequence in a test (bulk queue: save doc → mark not needed → same key re-queued/revisited). Fix the lifecycle if the marker/pending-edit state is wrong; if it is not reproducible, document that in the story and close the checkbox.

**Non-goals:**
- No retry/backoff mechanism for failed generations.
- No persisted failure state or notification-center integration.
- No behaviour change to the deliberate idempotent unset no-op or the generate route's validation scope (documented decisions).

## Implementation Plan

1. **Server tunables + logs (`src/lib/test-doc-background.ts`).** Add a call-time `readEnvInt` helper (parse rules of `query-timer.ts`'s `resolveThreshold`: finite && > 0); destructure defaults become `readEnvInt("TEST_DOC_POLL_INTERVAL_MS", POLL_INTERVAL_MS)` / `readEnvInt("TEST_DOC_POLL_MAX_ATTEMPTS", MAX_ATTEMPTS)`; precedence opts > env > default so existing test overrides keep working. Logging: `failed` status and timeout and catch become `logger.error` with key + task id; `cancelled` stays silent (deliberate modal-close flow). Tests: env respected, opts beat env, invalid env falls back, error logs carry key + task id, cancelled logs nothing.
2. **PUT mutual exclusion (`src/app/api/tickets/[key]/test-doc/route.ts`).** The route has NO zod schema (story phrasing was wrong); use a minimal explicit guard after the body destructure: both `markdown !== undefined` and `notNeeded !== undefined` → 400 "Provide either markdown or notNeeded, not both". Keeps all existing error bodies stable; all `api-client.ts` callers already send disjoint bodies. Tests: both combinations → 400, DB untouched.
3. **Client warning toast (`src/components/sprint-board/useTestDocBoard.ts`).** No SprintBoard.tsx change needed: `showToast` is already a hook prop. In `startBackgroundGeneration`, track `landed`; after the poll loop exhausts without a draft (and not unmounted), toast "Test doc generation for KEY did not complete — try again from the ticket". Client window stays hardcoded (env vars are server-only, not `NEXT_PUBLIC_`); the possible desync when an operator raises server attempts is documented, not fixed. Tests with fake timers: exhaustion → one warning toast; success → ready toast only; POST rejection → existing failed toast only.
4. **hasSavedRef verification (analysis says NOT reachable).** Only server path clearing `testDoc` is `notNeeded: true`, only issued by `handleNotNeeded`, which deletes the ref entry and invalidates the prefetch cache; navigation is forward-only and the ref's lifetime is one modal mount (modal conditionally rendered, queue nulled on close). Write the proving test in `TestDocReviewModal.test.tsx` (bulk saved-doc suppression, per-key isolation, fresh session after unset). Adjacent late-result-after-not-needed race in `handleTaskResult` flagged for follow-up in Related; out of scope here.
5. **Docs + env.** Declare both vars in `src/lib/env.ts` following the `QUERY_SLOW_MS` "documented knob, read at call time" pattern; add to `.env.example`; update `docs/architecture/workspace-integration.md` (background generation bullet: error logs, warning toast, tunables, window-desync caveat) and `docs/architecture/api-routes.md` (PUT row: 400 on combined body).
6. **Order:** 1 → 2 → 3 → 4 → 5, then targeted vitest on the four touched test files + lint/typecheck. No file from the parallel session's dirty set is touched.

## Acceptance Criteria

- [x] A background generation that fails or times out produces a user-visible warning toast on the board (when the capture window was active) and an error-level server log with ticket key and task id; nothing disappears silently. <!-- test-doc-background.ts error logs + useTestDocBoard landed-flag toast -->
- [x] Poll interval and max attempts are env-tunable with unchanged defaults. <!-- readEnvInt in test-doc-background.ts, opts > env > default -->
- [x] `PUT /api/tickets/[key]/test-doc` returns 400 when `markdown` and `notNeeded` are both provided; existing valid bodies behave unchanged. <!-- explicit guard, no zod schema existed (story phrasing corrected in plan) -->
- [x] The `hasSavedRef` bulk edge case is covered by a test: either proven correct or fixed. <!-- PROVEN CORRECT: suppression is per key; the only path clearing a saved doc inside the modal (handleNotNeeded) deletes the ref entry after the await; the ref's lifetime is one modal mount and the queue is never swapped non-null→non-null while mounted, so later sessions re-derive from the fresh GET. Two proving tests in TestDocReviewModal.test.tsx ("hasSavedRef lifecycle"). -->
- [x] Relevant docs updated (workspace-integration test-doc section; env tunables listed where other env vars are documented). <!-- workspace-integration.md background-generation bullet, api-routes.md PUT row, env.ts + .env.example -->

## Tests

- [x] test-doc-background: env overrides respected; terminal failure logs error with key + task id.
- [x] useTestDocBoard: capture window closing without a landed draft fires the warning toast; landing normally does not.
- [x] Route: ambiguous PUT body rejected with 400; existing bodies unchanged.
- [x] useTestDocReview: bulk save → not-needed → revisit sequence asserts correct marker/pending-edit state.

## Related

- [[BRDG-467-test-doc-popup-not-needed-visibility]] — defined the deliberate idempotent unset semantics this story must not break.
- `docs/investigations/2026-07-03-test-doc-refactor.md` — prior refactor; items already handled there are out of scope.
- **Follow-up found during verification (not fixed here, added to docs/todo.md):** `handleNotNeeded` cancels an in-flight generation fire-and-forget; a result that slips through the cancel still reaches `handleTaskResult`, which writes a draft over the fresh not-needed marker (`useTestDocReview.ts` result handler vs. lines ~407-409). Rare (needs a result landing in the cancel window) and self-healing on the next explicit review, but worth a decision.
