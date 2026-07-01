# BRDG-458: Audit and fix top-level `swr` mutate no-ops across the app

**Status:** To Do
**Priority:** High
**Type:** Bug / Tech debt

## Description
Follow-up to BRDG-455 and [docs/investigations/2026-07-01-top-level-swr-mutate-noop-audit.md](../investigations/2026-07-01-top-level-swr-mutate-noop-audit.md).

The app wraps SWR in a custom cache provider (`SWRProvider`'s `lruProvider`, BRDG-387). Because of that, the `mutate` imported directly from `"swr"` (top-level/global, often aliased `globalMutate`) operates on SWR's **default** cache and is a **silent no-op** against every hook that reads from the provider's cache: no revalidation, no cache patch, no error. Features built on it look correct in code and in tests (which mock the global mutate), but do nothing at runtime.

BRDG-455 proved this live: the board score handlers' list revalidation and the capacity-meter refresh (score handlers + `SprintBoard.refreshMeter`) were both dead code until switched to provider-bound mutators. Roughly **17 other non-test files** still use the top-level pattern; each usage is a potential silently-broken feature (stale lists after a save, refreshes that never happen, optimistic patches that never render).

The correct, provider-aware mutators are:
- a hook's own `mutate` (e.g. `useTickets(...).mutate`, exposed on the board as `adapter.mutate()`), or
- `useSWRConfig().mutate("/api/...")` for an arbitrary key.

## Suspect files (from the investigation; verify each, list may have drifted)
Cache-layer helpers (highest blast radius, used by many callers):
- `src/components/sprint-board/sprint-board-utils.ts` (`saveTicketMetadata` / `saveStoryPoints` detail + list patches)
- `src/lib/ticket-cache.ts` (`patchTicketDetailCache` / `patchTicketCaches`)
- `src/components/sprint-board/row-actions/adapter.ts` (bulk move/edit cache surgery)
- `src/lib/prefetch.ts`

Hooks:
- `src/hooks/useSprintBoard.ts` (mixed: also uses `useSWRConfig` correctly in places)
- `src/hooks/usePipelines.ts`, `src/hooks/usePencilCapacity.ts`, `src/hooks/useSchedulerTick.ts`, `src/hooks/usePipelineTick.ts`, `src/hooks/useStoryWriterDrafts.ts`, `src/hooks/useRefinementStream.ts`

Components / pages:
- `src/components/story-writer/useStoryWriterActions.ts`, `src/components/ticket-detail/TicketReview.tsx`, `src/components/ticket-detail/EpicChildrenSection.tsx`, `src/components/chat/SprintGoalActions.tsx`, `src/components/shared/StoryWriterLauncherModal.tsx`
- `src/components/sprint-board/CreateSprintModal.tsx`, `src/components/sprint-board/SprintEditModal.tsx`, `src/components/sprint-board/FinishSprintModal.tsx`, `src/app/(app)/epics/CreateEpicModal.tsx`
- `src/app/(app)/inbox/page.tsx`, `src/app/(app)/cleanup/page.tsx`, `src/app/(app)/refinement/[sessionId]/session/[ticketKey]/page.tsx`

## Proposed Approach
1. **Audit before fixing.** For each usage, determine what it is supposed to do (revalidate a key / patch a cache) and whether the target key is read through a provider-backed hook. Classify: **broken** (no-op on a real feature), **harmless** (dead code, or key not read anywhere), or **actually works** (explain why — e.g. runs outside the provider tree).
2. **Fix the broken ones** by switching to `useSWRConfig().mutate` or the owning hook's `mutate`. For non-hook modules (`sprint-board-utils.ts`, `ticket-cache.ts`, `prefetch.ts`, `adapter.ts`) the top-level import cannot simply become a hook call: thread the provider-bound mutate in from the calling component (parameter or adapter field), mirroring how `adapter.mutate()` already works. Prefer small mechanical changes; where a call site is already covered by the pendingTicketEdits overlay, follow the BRDG-455 pattern in `docs/architecture/optimistic-updates.md`.
3. **Verify at least the top 3 highest-impact fixes live in the browser** (network capture: the expected GET fires after the action), not only via unit tests — BRDG-455's first fix passed all tests while doing nothing.
4. **Guard against regression** with a lint rule in `eslint.config.mjs` (`no-restricted-imports` on the `mutate` named import from `"swr"` for `src/**`, allowing test files), so the pattern cannot silently return.
5. **Resolve the BRDG-417 caveat**: `project_swr_mutate_discards_inflight` implies an optimistic global mutate DID affect chat data. Determine why (bound `configMutate`? outside provider? predates provider?) and record the answer in the investigation doc — it determines whether any "actually works" classifications are safe.

## Implementation Plan

Findings that shape the plan (from the planning pass over the actual code):
- `SWRProvider` mounts only in `src/app/(app)/layout.tsx`; the root layout has no provider. Every suspect renders under `(app)`, so **no usage can be "actually-works because it mounts outside the provider"**.
- **BRDG-417 caveat resolved:** the chat empty-list bug lived in `src/hooks/useConversations.ts`, which uses the hook's own bound `mutate` (never the global). It does not contradict the no-op thesis; bound-mutator classifications are safe.
- **Grep drift — 3 extra broken files** not in the original list: `src/hooks/useEpics.ts`, `src/hooks/useBulkSuggest.ts`, `src/hooks/useSavedSearches.ts` (each patches a key read via a provider hook).
- One genuine ambiguity: `cleanup/page.tsx` disposition-key mutate may have no reader (harmless-dead) — resolve during audit, not by assumption.
- Threading style for non-hook modules: explicit parameter (matches the `adapter.mutate()` precedent); reject a module-level registry.

Phases (order matters; tests must be repaired before the lint rule):
1. **Phase 0 — Audit table + BRDG-417 resolution** into the investigation doc (verify the ambiguous cases first).
2. **Phase 1 — Non-hook shared modules** (highest blast radius, thread a bound mutator parameter): `src/lib/ticket-cache.ts` (+~7 caller files), `src/components/sprint-board/sprint-board-utils.ts` (+~8 callers), `src/components/sprint-board/row-actions/adapter.ts` (`confirmMove` surgery), `src/lib/prefetch.ts` (`seedTicketDetailCache`; also verify `preload` behaves under the provider).
3. **Phase 2 — Hooks** (swap `globalMutate` → `useSWRConfig().mutate`): `useEpics`, `usePipelines`, `usePencilCapacity`, `useSchedulerTick`, `usePipelineTick`, `useStoryWriterDrafts`, `useRefinementStream`, `useBulkSuggest`, `useSavedSearches`, plus the one broken line in `useSprintBoard.ts` `useTicketReviews`.
4. **Phase 3 — Components/pages** (same swap): `useStoryWriterActions.ts`, `TicketReview.tsx`, `EpicChildrenSection.tsx` (refreshMeter twin), `SprintGoalActions.tsx`, `StoryWriterLauncherModal.tsx`, `CreateSprintModal.tsx`, `SprintEditModal.tsx`, `FinishSprintModal.tsx`, `CreateEpicModal.tsx`, `inbox/page.tsx`, `cleanup/page.tsx`.
5. **Phase 4 — Tests**: convert false-positive global-mutate spies to the `SprintBoard.moveMeter.test.tsx` `vi.hoisted` + `useSWRConfig` pattern (`useSchedulerTick`, `usePipelineTick`, `useRefinementStream`, `StoryWriterLauncherModal`, `CreateSprintModal`, `SprintEditModal`, `FinishSprintModal`, `CreateEpicModal` tests) and cover the new threaded signatures.
6. **Phase 5 — Live browser verification** of the top 3 highest-impact fixes via subagents (network capture on :3101, dev bypass auth): ticket-cache patch path, used-points refresh from EpicChildrenSection, `/api/jira/sprints` refresh from a sprint modal.
7. **Phase 6 — Lint rule**: `no-restricted-imports` banning the `mutate` named import from `"swr"` in `src/**`, test files exempt; fix whatever it still surfaces.
8. **Phase 7 — Architecture docs** update.

Key risks: overlay double-application once `revalidate:false` patches actually start working (BRDG-383 guards must hold); refetch volume from tick hooks' predicate mutates once they genuinely revalidate; large threading fan-out in a shared working tree (stage explicit paths only).

## Checklist
- [x] Audit every top-level `swr` mutate usage in the suspect files; record per-usage classification (broken / harmless / works + why) in the investigation doc
- [ ] Fix all **broken** usages with provider-bound mutators (hook `mutate` or `useSWRConfig().mutate`; threaded in for non-hook modules)
- [ ] Remove or annotate **harmless** dead calls (no silent leftovers)
- [x] Resolve the BRDG-417 chat-SWR caveat and document the answer (useConversations uses the bound hook mutate; no contradiction)
- [ ] Live browser verification (network capture) for the top 3 highest-impact fixes
- [ ] Update/extend tests for fixed call sites; ensure no test asserts on the global mutate spy for provider-backed behaviour (false positives, like the old `SprintBoard.moveMeter.test.tsx`)
- [ ] Add the `no-restricted-imports` lint rule banning top-level `mutate` from `"swr"` in `src/**` (tests exempt) and fix any remaining violations it surfaces
- [ ] Update `docs/architecture/optimistic-updates.md` and/or `docs/architecture/client-data-and-memory.md` with the final rule of thumb

## Out of scope / non-goals
- No behaviour changes beyond making existing intended refreshes/patches actually work.
- No redesign of the LRU provider or the pendingTicketEdits overlay.
- The BRDG-455 board score/meter paths are already fixed; don't rework them.
