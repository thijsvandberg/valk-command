# Top-level `swr` `mutate` is a no-op against the custom cache provider — audit needed

**Date:** 2026-07-01
**Trigger:** BRDG-455 (guesstimate/BV/SP score edits blinked out ~30s after entry).

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

## Recommendation

Open a dedicated cleanup story to audit each suspect: confirm whether the call reaches the intended hook, and replace real no-ops with `useSWRConfig().mutate` / the hook's own `mutate`. A lint rule banning `import { mutate } from "swr"` in `src/**` (allow only `useSWRConfig`) would prevent regressions.
