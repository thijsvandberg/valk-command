# BRDG-448: Debounce the sprint-board fetch-error banner and keep auto-retry

**Status:** To Do
**Priority:** Low
**Type:** Bugfix

## Description
The sprint board occasionally flashes a red "Failed to fetch" banner with a Retry button. This is a browser-native fetch error (the request got no HTTP response at all), almost always caused by a transient blip: the prod server (`:3101`) restarting, a momentary network drop, or a poll landing mid-deploy. The data itself is fine and the board still shows the last-loaded tickets underneath.

The banner is too eager: it appears on the very first failed attempt, so a one-second hiccup looks like an outage. We want it to:

1. **Only appear after 2 consecutive failed ticket fetches** — a single transient failure stays silent (the board keeps showing the last-loaded list, which it already does).
2. **Self-heal via automatic retry with exponential backoff** — once a retry succeeds, the banner clears on its own without the PO clicking Retry.

Scope is the sprint-board ticket list fetch (`useTickets`) only. The manual Retry button stays as an escape hatch.

## Current Behaviour
- The board ticket list is fetched by `useTickets(sprintId)` (`src/hooks/useSprintBoard.ts:51-84`) via `useSWR<Ticket[]>(key, swrFetcher, { revalidateOnFocus: true, dedupingInterval: 15000, refreshInterval })` where `refreshInterval` is 60s for a scoped sprint and 0 for the `__all__` feed. The hook returns the raw SWR object.
- `SprintBoard` reads it at `src/components/sprint-board/SprintBoard.tsx:274` (`error: ticketsError, isLoading: ticketsLoading, mutate: mutateTickets`). The banner is rendered at `SprintBoard.tsx:1170-1175`, gated on `ticketsError && !ticketsLoading`, as `<DataErrorState error={ticketsError} onRetry={() => mutateTickets()} />`. SprintBoard is the only consumer of `useTickets`' `error`.
- `DataErrorState` (`src/components/shared/DataErrorState.tsx:35-90`) renders the red `InlineAlert` (`variant="error"`) with the message and the Retry button. The message comes from `dataErrorMessage()` (`DataErrorState.tsx:19-23`), which reads `error.message`. For a transient network failure that message is the browser's literal `"Failed to fetch"` (native `TypeError`); for an HTTP error it is the `ApiError` message from `src/lib/api-client.ts`.
- **Auto-retry already exists but is implicit.** The global SWR config (`src/components/SWRProvider.tsx:42-58`) does **not** set `shouldRetryOnError`, so SWR's default applies (`true`) with its built-in exponential-backoff-with-jitter retry. `errorRetryInterval` / `errorRetryCount` are likewise unset (SWR defaults). So today the board does keep retrying and **does** eventually clear the banner on the next successful fetch — the only real defect is that the banner shows on attempt #1, before any retry has had a chance.
- `keepPreviousData: true` is set globally (`SWRProvider.tsx:57`), so during a failed revalidation the previously loaded tickets stay on screen. The banner is therefore an overlay on top of still-valid data, not a blank error state.
- Fetch failures are forwarded server-side for observability by the global `onError` → `handleSwrError(error, key)` (`SWRProvider.tsx:36-53`, BRDG-398), which calls `reportClientError` (throttled, so retries do not flood the log).

**Gap:** the banner has no failure-count threshold, so a single transient failure (e.g. a prod restart) surfaces it immediately even though the data on screen is fine and a retry is already queued.

## Proposed Approach
Keep the existing SWR retry/backoff; add a small consecutive-failure gate inside `useTickets` so the surfaced `error` is suppressed until the failure is no longer plausibly a one-off. SprintBoard needs no change — it keeps reading `error` from the hook.

1. **Count consecutive failures in `useTickets`.** Track a failure counter with `useState`, updated in SWR lifecycle callbacks passed to this hook's `useSWR` options:
   - `onError`: increment the counter.
   - `onSuccess`: reset the counter to 0.
   Both are SWR callbacks invoked outside render, so this stays clear of the React Compiler `setState-in-effect` / `ref-access-in-render` rules ([[project_react_compiler_lint]]).
2. **Gate the surfaced error.** Return `error: failureCount >= FAILURE_THRESHOLD ? swr.error : undefined` (threshold = 2) while passing the rest of the SWR object through unchanged. Failure #1 stays silent (board shows last-loaded list via `keepPreviousData`); failure #2 surfaces the banner; the next successful retry resets the counter and clears it automatically.
3. **Preserve BRDG-398 logging.** A per-hook `onError` overrides the global one (SWR merges config; callbacks are not chained), so the hook's `onError` must also call the exported `handleSwrError(error, key)` from `SWRProvider` to keep the server-side fetch-failure log intact. `onSuccess` has no global counterpart to preserve.
4. **Make the retry/backoff explicit (so it is intentional, not an undocumented default).** On this hook set `shouldRetryOnError: true` and an explicit `errorRetryInterval` (SWR applies exponential backoff with jitter on top, capped at ~256x the base). This documents the self-heal behaviour at the call site rather than relying on SWR defaults. Leave `errorRetryCount` unbounded so a longer prod restart still recovers without manual action; `reportClientError` throttling already bounds the log noise.
5. **Manual Retry unchanged.** `mutateTickets()` from the banner still forces an immediate revalidation; a success there resets the counter via `onSuccess`.

**Non-goals / out of scope:**
- The ticket-detail fetch (`useTicketDetail`, `useSprintBoard.ts:89+`) and the right-hand content panel — same pattern could apply later, but this story is the board list only.
- Changing `DataErrorState` / `InlineAlert` visuals or the Retry affordance.
- Any change to the 60s `refreshInterval`, `dedupingInterval`, or `keepPreviousData`.
- Adding a "refreshing…" / "last updated" indicator during the silent first-failure window (kept fully silent by design — that is the point).

## Implementation Plan

All behaviour change is confined to `useTickets`; `SprintBoard` keeps reading `.error` unchanged.

1. **Extract `handleSwrError` to a client-safe lib.** Move `handleSwrError` from `src/components/SWRProvider.tsx` into a new `src/lib/swr-error.ts` (imports only `reportClientError` from `@/lib/client-error` and `ApiError` from `@/lib/api-client`). `SWRProvider` imports it from there and **re-exports** it (`export { handleSwrError }`) so `SWRProvider.test.tsx` and the global `onError` keep working. This avoids importing a React component module (and its module-level `createLruProvider()` + `TicketSyncBridge`) into a data hook. `describeKey` stays in `SWRProvider`.
2. **Failure counter in `useTickets`** (`src/hooks/useSprintBoard.ts`). Add `useState` to the react import and `handleSwrError` from `@/lib/swr-error`. Module-level `const FETCH_FAILURE_THRESHOLD = 2;` and `const ERROR_RETRY_INTERVAL_MS = 3000;`. Inside the hook: `const [failureCount, setFailureCount] = useState(0);`.
3. **Wire SWR lifecycle callbacks** on the `useTickets` `useSWR` options:
   - `onError: (err, key) => { setFailureCount((n) => n + 1); handleSwrError(err, key); }` (re-call to preserve BRDG-398, since a per-hook `onError` overrides the global one).
   - `onSuccess: () => setFailureCount((n) => (n === 0 ? n : 0))` (identity-return when already 0 so the 60s poll path stays render-free).
   - `shouldRetryOnError: true`, `errorRetryInterval: ERROR_RETRY_INTERVAL_MS` (explicit; SWR still applies exponential backoff + jitter on top). Leave `errorRetryCount` unset (unbounded self-heal).
   - Keep `revalidateOnFocus`, `dedupingInterval: 15000`, `refreshInterval`.
4. **Gate the surfaced error.** Return `{ ...swr, error: failureCount >= FETCH_FAILURE_THRESHOLD ? swr.error : undefined }` (mirrors the existing `useJiraSprints` spread pattern; counter uses functional updaters so no React Compiler `setState-in-effect` / `ref-in-render` violation — callbacks run in SWR's fetch lifecycle, not render).
5. **Tests** (`src/hooks/useSprintBoard.test.ts`): repurpose the existing single-failure test to assert silence on one failure; add a debounce describe block for the 2-failure surface, success-resets-streak, and `handleSwrError` still called. Mock `@/lib/swr-error` `handleSwrError` for the logging assertion.

## Acceptance Criteria
- [x] A single transient ticket-fetch failure does **not** show the "Failed to fetch" banner; the last-loaded ticket list stays visible. <!-- useTickets failure gate: failureCount < 2 returns error: undefined -->
- [x] After 2 consecutive failed ticket fetches, the banner appears. <!-- useTickets: error surfaced when failureCount >= 2 -->
- [x] When a retry succeeds, the banner clears automatically without the PO clicking Retry. <!-- onSuccess resets failureCount; SWR error retry with backoff -->
- [x] Failed ticket fetches are still retried automatically with exponential backoff. <!-- explicit shouldRetryOnError + errorRetryInterval on useTickets -->
- [x] Fetch failures are still forwarded to the server-side client-error log (BRDG-398 unaffected). <!-- per-hook onError calls handleSwrError -->
- [x] The manual Retry button still forces an immediate refetch and clears the banner on success. <!-- mutateTickets() onRetry; onSuccess reset -->

## Tests
- [x] `useTickets` does not surface an error on the first failure and surfaces it on the second consecutive failure. <!-- src/hooks/useSprintBoard.test.ts -->
- [x] A successful fetch after failures resets the counter so a later single failure is again silent. <!-- src/hooks/useSprintBoard.test.ts -->
- [x] The hook's `onError` still calls `handleSwrError` so BRDG-398 logging fires. <!-- src/hooks/useSprintBoard.test.ts (vi.mock @/lib/swr-error) -->

## Related
- [[project_sync_freshness_and_status_writes]] — board freshness model this fetch participates in.
- BRDG-398 — central SWR fetch-failure forwarder (`handleSwrError` in `src/components/SWRProvider.tsx`); must keep firing.
- BRDG-411 — `useTickets` poll/feed scoping (`refreshInterval` per sprint vs `__all__`); same hook touched here.
- `src/components/shared/DataErrorState.tsx` — the banner UI; unchanged, consumes the gated `error`.
