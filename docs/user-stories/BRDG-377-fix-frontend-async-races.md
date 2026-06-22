# BRDG-377: Fix frontend async races and lifecycle bugs

**Status:** Not Started
**Priority:** High
**Type:** Stability — hooks, contexts, components

## Description

The codebase audit ([2026-06-22-codebase-audit.md](../investigations/2026-06-22-codebase-audit.md))
found a set of frontend lifecycle defects: a hook that silently disables itself in dev, two async
fetches that render the wrong entity's data on fast switching, side effects inside `setState`
updaters, and a couple of render-purity / list-key issues. Each is small and well-understood; this
story fixes them together. Note the project uses the React Compiler, so this is about effect
correctness and render purity, **not** adding manual memoization.

## Current Behaviour

- **`useWorkspaceTask` dev self-disable (Critical, dev-only).**
  [useWorkspaceTask.ts:54,57-64](../../src/hooks/useWorkspaceTask.ts): `unmountedRef = useRef(false)`
  is set to `true` on unmount but **never reset to `false`** on mount (its three sibling hooks —
  `useTaskStream.ts:69`, `useStakeholderAnalysis.ts:119`, `useStoryWriter.ts:130` — all reset it).
  Under React 19 StrictMode's mount→unmount→remount dev cycle, every `safeSetState` becomes a
  permanent no-op, so the chat workspace-task UI (streaming progress/results/errors) stops updating
  in dev.
- **`useMessages` initial-fetch race (High).**
  [useMessages.ts:29-49](../../src/hooks/useMessages.ts): the initial fetch has no ignore/abort
  flag (the background poll is content-compare guarded, the initial fetch is not). Switching
  conversations fast lets an old response overwrite with the wrong conversation's messages.
- **`CommentsSection` fetch race (High).**
  [CommentsSection.tsx:33-45](../../src/components/ticket-detail/CommentsSection.tsx): fetches
  `tickets.getComments(ticketKey)` with no cancellation guard. Its container `TicketTabContent` is
  not keyed by `ticket.key` (`SidePanel.tsx:582`), so `ticketKey` changes in place — an in-flight
  response for the previous ticket can overwrite the panel. Sibling sections (`SubtasksSection`,
  `LinkedIssuesSection`, `TicketHistory`) all use a `let cancelled` guard; this one omits it.
- **Side effects in `setState` updaters (High).**
  [RefinementSessionContext.tsx:172-200](../../src/contexts/RefinementSessionContext.tsx):
  `saveSession`/`finishSession` call `refinementSessionsApi.update(...)` *inside* the
  `setState((prev) => {...})` updater. Updaters must be pure; React may run them more than once
  (StrictMode/concurrent) → duplicate PATCH requests.
- **Impure getSnapshot (Medium).**
  [ThemeContext.tsx:78-82](../../src/contexts/ThemeContext.tsx): `getThemeSnapshot` calls
  `applyTheme(t)` (mutates `document.documentElement` + meta) inside a `useSyncExternalStore`
  getSnapshot, which must be pure and runs during render.
- **Unmemoized refinement context value (Medium).**
  [RefinementSessionContext.tsx:202-219](../../src/contexts/RefinementSessionContext.tsx): the
  provider passes `{...state, ...12 callbacks}` as a fresh literal each render, re-rendering the
  whole fullscreen refinement subtree on every state change. `ActivityContext` is the reference
  pattern (split state/actions + memoized values).
- **BurnupChart seed guard never resets (Medium).**
  [BurnupChart.tsx:72,81-85](../../src/components/sprint-board/BurnupChart.tsx): `seedAttempted`
  is a single boolean ref that never resets across sprints (the chart is not keyed by `sprintId`),
  so only the first sprint viewed in a session auto-seeds.
- **Index keys on a reorderable list (Medium).**
  [TicketGroup.tsx:104](../../src/components/stakeholder/TicketGroup.tsx): list items use `key={i}`
  although a stable `jiraKey` is available; on sort/filter the wrong row gets the dimmed/hover state.

## Proposed Approach

1. **`useWorkspaceTask`:** reset `unmountedRef.current = false` on mount (match the three sibling hooks).
2. **`useMessages`:** add `let ignore = false` (or an `AbortController`) to the initial-fetch
   effect; gate `setMessages`/`setError` on `!ignore`; set `ignore = true` in cleanup.
3. **`CommentsSection`:** add the same `let cancelled` guard the sibling sections use.
4. **`RefinementSessionContext` save/finish:** read needed values from a ref/state outside the
   updater, perform the API call there, keep the updater pure (just flip the flags).
5. **`ThemeContext`:** move `applyTheme` out of `getSnapshot` into `subscribe` / a `useEffect` on
   `theme`; `getThemeSnapshot` returns the resolved value only.
6. **Refinement context value:** memoize it (or split into state + stable actions contexts like
   `ActivityContext`).
7. **`BurnupChart`:** reset the seed guard when `sprintId` changes (store `seedAttempted.current =
   sprintId` and compare, inside the effect to respect the no-ref-write-in-render rule).
8. **`TicketGroup`:** key by `t.jiraKey ?? t.title`.

No user-facing behaviour change beyond fixing the bugs (correct conversation/comments shown,
burnup seeds for every sprint, theme unchanged visually).

## Acceptance Criteria

- [ ] In dev, the chat workspace-task UI keeps updating after StrictMode's remount (no permanent
      `safeSetState` no-op).
- [ ] Switching conversations / tickets quickly never renders the previous entity's
      messages/comments (in-flight responses are ignored).
- [ ] Saving/finishing a refinement session fires exactly one PATCH (no duplicate under StrictMode).
- [ ] `getThemeSnapshot` is pure; theme still applies correctly on load and toggle.
- [ ] The refinement provider value is stable across renders that don't change it.
- [ ] Every never-seeded sprint auto-seeds its burnup; stakeholder rows keep correct state on
      sort/filter.

## Tests

- [ ] `useWorkspaceTask`: a mount→unmount→remount cycle still applies state updates.
- [ ] `useMessages` / `CommentsSection`: a late response for the previous id/key is discarded.
- [ ] `RefinementSessionContext`: save/finish invoke the API once even if the updater runs twice.
- [ ] `BurnupChart`: switching to a second unseeded sprint triggers auto-seed.
- [ ] `TicketGroup`: reordering preserves per-row state (keyed by `jiraKey`).

## Open Questions

- **Refinement context split.** Full split into state + actions contexts (matches `ActivityContext`,
  more work) vs. a single `useMemo` on the value (smaller). Recommend the split if the subtree is
  large enough to matter; otherwise memoize.

## Related

- [[2026-06-22-codebase-audit]] — source audit (Stability — frontend).
- `ActivityContext` — reference pattern for the context-value fix.
- Touch points: `useWorkspaceTask.ts`, `useMessages.ts`, `CommentsSection.tsx`,
  `RefinementSessionContext.tsx`, `ThemeContext.tsx`, `BurnupChart.tsx`, `TicketGroup.tsx`.
