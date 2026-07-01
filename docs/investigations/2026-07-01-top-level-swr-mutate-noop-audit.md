# Top-level `swr` `mutate` is a no-op against the custom cache provider — audit needed

**Date:** 2026-07-01 (audit completed same day under BRDG-458)
**Trigger:** BRDG-455 (guesstimate/BV/SP score edits blinked out ~30s after entry).

## Audit result (BRDG-458)

**Mounting analysis:** `SWRProvider` mounts only in `src/app/(app)/layout.tsx`, wrapping every app page, the command palette, global search, and launcher modals. The root `src/app/layout.tsx` has no provider. Every suspect file renders under `(app)`, so no usage is saved by "mounts outside the provider" — the top-level `mutate` is a no-op at every one of these call sites.

**BRDG-417 caveat — resolved.** The chat "optimistic mutate discards in-flight fetch" bug (memory `project_swr_mutate_discards_inflight`) lives in `src/hooks/useConversations.ts`, which uses the **hook's own bound `mutate`** from `useSWR<Conversation[]>` (line 30) — never the top-level global. So that observation does not contradict the no-op thesis; bound-mutator behaviour ("actually-works" classifications) is safe to trust.

**Grep drift:** three additional broken files beyond the original list, using the `import useSWR, { mutate } from "swr"` form the first grep missed: `src/hooks/useEpics.ts`, `src/hooks/useBulkSuggest.ts`, `src/hooks/useSavedSearches.ts`.

### Per-usage classification

**BROKEN** (top-level mutate targeting a key read through a provider-backed hook; the intended revalidation/patch never happened):

| File | Usage | Intended effect / reader |
|------|-------|--------------------------|
| `src/lib/ticket-cache.ts` | all exported patch/revalidate helpers | `/api/tickets*` + detail keys, read by `useTickets` / `useTicketDetail` / `useTicketsByKeys`; ~7 caller modules |
| `src/components/sprint-board/sprint-board-utils.ts` | `saveTicketMetadata` / `saveStoryPoints` detail+list patches and failure revalidation; `saveSprintSlots` `/api/sprint-slots` patch | detail cache re-seed for the sidebar; sprint slots read by `useSprintSlots` |
| `src/components/sprint-board/row-actions/adapter.ts` | `makeBoardDispatchAdapter.confirmMove` list surgery | `/api/tickets` + `/api/tickets?sprintId=` destination-cache injection (BRDG-271) |
| `src/lib/prefetch.ts` | `seedTicketDetailCache` `globalMutate(detailKey, ticket, {revalidate:true})` | pre-seed + background refresh of the detail cache |
| `src/hooks/useEpics.ts` | `useSetEpicTeams` / `useSetEpicColor` patch `/api/epics/progress` | read by `useEpicProgress` |
| `src/hooks/usePipelines.ts` | `useFollowTicket` revalidates followed-tickets list | read by `useFollowedTickets` |
| `src/hooks/usePencilCapacity.ts` | optimistic patch + rollback of `/api/sprints/pencil-capacity` | the hook's own key |
| `src/hooks/useSchedulerTick.ts` | predicate revalidation of `/api/tickets*`, `/api/activity-log` after sync/cleanup | board/activity refresh |
| `src/hooks/usePipelineTick.ts` | revalidation of `/api/pipelines*`, `/api/notifications?limit=50` | pipelines + notifications refresh |
| `src/hooks/useStoryWriterDrafts.ts` | post-`pushToJira` revalidation of detail + list keys | ticket data refresh after push |
| `src/hooks/useRefinementStream.ts` | refinement sessions, suggestion counts, bulk-suggest status, conversation, tickets keys | live refinement UI refresh |
| `src/hooks/useBulkSuggest.ts` | optimistic patch of its own `statusUrl` | read by its own `useSWR` |
| `src/hooks/useSavedSearches.ts` | optimistic add/remove patch of `SWR_KEY` | read by its own `useSWR` |
| `src/hooks/useSprintBoard.ts` | ONE line in `useTicketReviews`: trailing `globalMutate(detailUrl)` | detail refresh after review save/delete (the `swr.mutate()` beside it works) |
| `src/components/story-writer/useStoryWriterActions.ts` | active-sessions revalidation on delete/wrap-up | read by `useActiveWriterSessions` |
| `src/components/ticket-detail/TicketReview.tsx` | detail + list revalidation after agent review | ticket data refresh |
| `src/components/ticket-detail/EpicChildrenSection.tsx` | `refreshMeter` used-points revalidation | broken twin of the `SprintBoard.refreshMeter` fixed in BRDG-455 |
| `src/components/chat/SprintGoalActions.tsx` | `/api/jira/sprints` revalidation after goal write | read by `useJiraSprints` |
| `src/components/shared/StoryWriterLauncherModal.tsx` | optimistic patch + rollback of active-sessions | read by `useActiveWriterSessions` |
| `src/components/sprint-board/CreateSprintModal.tsx` | `/api/jira/sprints` revalidation on create | read by `useJiraSprints` |
| `src/components/sprint-board/SprintEditModal.tsx` | `/api/jira/sprints` `revalidate:false` patches (save + start) | read by `useJiraSprints` |
| `src/components/sprint-board/FinishSprintModal.tsx` | `/api/jira/sprints` `revalidate:false` patch on finish | read by `useJiraSprints` |
| `src/app/(app)/epics/CreateEpicModal.tsx` | `/api/epics/progress` revalidation on create | read by `useEpicProgress` |
| `src/app/(app)/inbox/page.tsx` | `refreshCount` of `/api/new-stories/count` | read by `useSidebarData` (the inbox list itself already uses its bound `mutateList` — fine) |
| `src/app/(app)/cleanup/page.tsx` | disposition-key revalidation after bulk disposition | **verified read** by `DispositionPanel.tsx` `useSWR` (provider-backed) — broken, not harmless |
| `src/app/(app)/refinement/[sessionId]/session/[ticketKey]/page.tsx` | via `ticket-cache.ts` helpers | covered by the ticket-cache fix |

**HARMLESS:** none found — every audited call targeted a key that is genuinely read through a provider-backed hook.

**ACTUALLY-WORKS (bound mutators; leave as-is):** `useConversations.ts` / `useMessages.ts` (hook `mutate`), `SprintBoard.tsx` `refreshMeter` + score handlers (fixed in BRDG-455), `useSprintBoard.ts` `configMutate` in `useTicketDetail` and `swr.mutate()` in `useTicketReviews`, `adapter.ts` `mutate()` field (the board list's `KeyedMutator`).

**Note on `preload`:** `src/lib/prefetch.ts` also imports SWR's top-level `preload`. `preload` writes into SWR's PRELOAD map (module-level, provider-independent), which `useSWR` consults on mount regardless of provider — unlike global `mutate` it is not silently broken, so it stays.

## Finding

The app wraps SWR in a **custom cache provider** (`SWRProvider`'s `lruProvider`, BRDG-387, `src/components/SWRProvider.tsx:39`). Because of that, the `mutate` imported directly from `"swr"` (top-level/global, often aliased `globalMutate`) operates on SWR's **default** cache and is a **silent no-op** against every hook that reads from the provider's cache — no revalidation, no cache patch, no error thrown.

The correct, provider-aware mutators are:
- a hook's own `mutate` (e.g. `useTickets(...).mutate`, exposed on the board as `adapter.mutate()`), or
- `useSWRConfig().mutate("/api/...")` for an arbitrary key.

### Confirmed (fixed in BRDG-455)

Verified live in the browser (network capture): after a metadata `PUT`, `globalMutate(activeListKey)` produced **no** `GET /api/tickets`; the value survived only on the overlay until its 30s TTL, then blinked out. The pre-existing `globalMutate("/api/sprints/used-points")` meter refresh (in the score handlers **and** `SprintBoard.refreshMeter`) was broken the same way. Switching to `adapter.mutate()` / `useSWRConfig().mutate()` fired the refetch ~0.3s after the `PUT`, even inside the 30s dedupe window.

## Suspect files (NOT yet verified — audit before trusting)

These non-test files still use the top-level pattern (`import { mutate } from "swr"` or `mutate as globalMutate`). Each use is either a revalidation or an optimistic cache patch that may be a latent no-op. Some may be harmless (e.g. keys not read through the provider), but each needs checking:

- `src/components/sprint-board/sprint-board-utils.ts` — `saveTicketMetadata` / `saveStoryPoints` detail-cache + list patches
- `src/lib/ticket-cache.ts` — `patchTicketDetailCache` / `patchTicketCaches`
- `src/components/sprint-board/row-actions/adapter.ts` — bulk move/edit cache surgery (`makeBoardDispatchAdapter`)
- `src/hooks/useSprintBoard.ts`, `src/hooks/usePipelines.ts`, `src/hooks/usePencilCapacity.ts`, `src/hooks/useSchedulerTick.ts`, `src/hooks/usePipelineTick.ts`, `src/hooks/useStoryWriterDrafts.ts`, `src/hooks/useRefinementStream.ts`
- `src/lib/prefetch.ts`
- `src/components/story-writer/useStoryWriterActions.ts`, `src/components/ticket-detail/TicketReview.tsx`, `src/components/ticket-detail/EpicChildrenSection.tsx`, `src/components/chat/SprintGoalActions.tsx`, `src/components/shared/StoryWriterLauncherModal.tsx`
- `src/components/sprint-board/CreateSprintModal.tsx`, `src/components/sprint-board/SprintEditModal.tsx`, `src/components/sprint-board/FinishSprintModal.tsx`, `src/app/(app)/epics/CreateEpicModal.tsx`
- `src/app/(app)/inbox/page.tsx`, `src/app/(app)/cleanup/page.tsx`, `src/app/(app)/refinement/[sessionId]/session/[ticketKey]/page.tsx`

Note: `src/hooks/useSprintBoard.ts` also correctly uses `useSWRConfig()` in places, so it is a mix.

## Caveat / open question

`project_swr_mutate_discards_inflight` (BRDG-417) implies optimistic mutate *does* affect data in the chat surface. Either that path used the bound `configMutate`, or chat is not under the same provider, or that observation predates the provider. Worth resolving during the audit — it determines whether the global-mutate no-op is truly universal or context-dependent.

## Resolution (BRDG-458, 2026-07-01)

All broken usages fixed:
- **Hooks/components/pages**: swapped to `useSWRConfig().mutate` (dep arrays updated).
- **Non-hook modules** (`ticket-cache.ts`, `sprint-board-utils.ts`, `row-actions/adapter.ts`, `prefetch.ts`): mutate through a new `scopedMutate` registry (`src/lib/swr-scoped-mutate.ts`) that `SWRProvider` fills with its provider-bound mutator on mount — a lighter equivalent of per-call-site parameter threading (no signature churn across ~15 callers). Unregistered (tests, pre-mount) it falls back to the default mutate, matching the old inert behaviour, with a dev-only warning.
- **Tests**: 14 test files spied the global mutate (false positives); their swr mocks now expose the same spy via `useSWRConfig` so assertions target the real path. New tests cover the registry and the SWRProvider registration.
- **Lint guard**: `no-restricted-imports` errors on the `mutate` named import from `swr` in `src/**` (tests + the registry module exempt). Verified it fires.
- **`preload` note**: verified against the installed SWR source — both `preload` and its consuming middleware key the PRELOAD map off default-cache global state, so `preload` works under the provider and stays a top-level import.

Live browser verification (three mechanisms, all PASS): follow/unfollow revalidation (GET ~275ms after write), inbox count dedup-bust on unmounted key (control leg proved dedupe, count GET fired on next nav open after mark-read), pencil-capacity optimistic patch (immediate DOM update, PUT-only wire).

**Useful SWR internals fact (source-verified):** a bare provider-bound `mutate(key)` on a key with NO mounted hook still deletes SWR's FETCH dedup marker, so the next mount refetches even inside `dedupingInterval`. That is exactly the semantics the inbox count refresh needs (its NavPanel subscriber mounts on open).

**Pre-existing quirk found in passing (not fixed here):** FullnessMeter's capacity editor double-commits (Enter calls commit, then blur commits again) producing two identical idempotent PUTs to `/api/sprints/pencil-capacity`. Harmless; candidate for a small cleanup.
