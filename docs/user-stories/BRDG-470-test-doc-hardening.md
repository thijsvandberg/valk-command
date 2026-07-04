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

## Acceptance Criteria

- [ ] A background generation that fails or times out produces a user-visible warning toast on the board (when the capture window was active) and an error-level server log with ticket key and task id; nothing disappears silently.
- [ ] Poll interval and max attempts are env-tunable with unchanged defaults.
- [ ] `PUT /api/tickets/[key]/test-doc` returns 400 when `markdown` and `notNeeded` are both provided; existing valid bodies behave unchanged.
- [ ] The `hasSavedRef` bulk edge case is covered by a test: either proven correct or fixed.
- [ ] Relevant docs updated (workspace-integration test-doc section; env tunables listed where other env vars are documented).

## Tests

- [ ] test-doc-background: env overrides respected; terminal failure logs error with key + task id.
- [ ] useTestDocBoard: capture window closing without a landed draft fires the warning toast; landing normally does not.
- [ ] Route: ambiguous PUT body rejected with 400; existing bodies unchanged.
- [ ] useTestDocReview: bulk save → not-needed → revisit sequence asserts correct marker/pending-edit state.

## Related

- [[BRDG-467-test-doc-popup-not-needed-visibility]] — defined the deliberate idempotent unset semantics this story must not break.
- `docs/investigations/2026-07-03-test-doc-refactor.md` — prior refactor; items already handled there are out of scope.
