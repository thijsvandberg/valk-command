# BRDG-377: Fix frontend async races and lifecycle bugs

**Status:** Completed
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

## Implementation Plan

React Compiler is on: no manual memoization except the explicit context-value memo (item 6).
Ref writes live only in effects/cleanup/handlers (lint blocks ref writes in render).
Order: 1, 3, 2, 8, 7, 5, then 4 before 6 (same file; 6's deps depend on 4's final callbacks).

1. **useWorkspaceTask** (`src/hooks/useWorkspaceTask.ts`): in the unmount effect (57-64) add
   `unmountedRef.current = false;` as the first statement, before `return`. Matches sibling hooks.
2. **useMessages** (`src/hooks/useMessages.ts`): `fetchMessages` is exported as `refresh`, so the
   guard cannot live inside it. Replace the `useEffect(fetchMessages)` with a self-contained effect
   that fetches inline, gates `setMessages`/`setError`/`setLoading` on a local `let ignore = false`,
   and returns `() => { ignore = true; }`. Deps: `[conversationId]`.
3. **CommentsSection** (`src/components/ticket-detail/CommentsSection.tsx`): in the `loadComments`
   effect (33-45) add `let cancelled = false`, gate `setPoComments`/`setLoading` on `!cancelled`,
   add `setLoading(true)` at effect start (skeleton on ticket switch), cleanup sets `cancelled=true`.
4. **RefinementSessionContext** save/finish (172-200): add `const stateRef = useRef(state)` synced via
   `useEffect(() => { stateRef.current = state; }, [state])`. In `saveSession`/`finishSession` read
   `{savedSessionId, currentIndex}` from `stateRef.current`, call `refinementSessionsApi.update(...)`
   outside the updater; updater only flips `sessionActive`/`showingEndModal`. Fires once under StrictMode.
5. **ThemeContext** (`src/contexts/ThemeContext.tsx`): `getThemeSnapshot` returns `resolveTheme()` only
   (no `applyTheme`). Add `useEffect(() => applyTheme(theme), [theme])` in the provider. `public/theme-init.js`
   (beforeInteractive in layout) already applies theme pre-paint, so no flash. `setTheme` still applies sync.
6. **Refinement context value** (202-219): wrap the value object in `useMemo` keyed on `[state, ...12 callbacks]`.
   Do after item 4 so callback identities are final.
7. **BurnupChart** (`src/components/sprint-board/BurnupChart.tsx`): change `seedAttempted` to
   `useRef<string | null>(null)`; in the seed effect guard on `seedAttempted.current === sprintId`,
   then set `seedAttempted.current = sprintId`. Per-sprint guard (chart not keyed by sprintId).
8. **TicketGroup** (`src/components/stakeholder/TicketGroup.tsx`): `key={t.jiraKey ?? t.title}`;
   drop the now-unused `i` from the map callback.

## Acceptance Criteria

- [x] In dev, the chat workspace-task UI keeps updating after StrictMode's remount (no permanent
      `safeSetState` no-op).
- [x] Switching conversations / tickets quickly never renders the previous entity's
      messages/comments (in-flight responses are ignored).
- [x] Saving/finishing a refinement session fires exactly one PATCH (no duplicate under StrictMode).
- [x] `getThemeSnapshot` is pure; theme still applies correctly on load and toggle.
- [x] The refinement provider value is stable across renders that don't change it.
- [x] Every never-seeded sprint auto-seeds its burnup; stakeholder rows keep correct state on
      sort/filter.

## Tests

- [x] `useWorkspaceTask`: a mount→unmount→remount cycle still applies state updates.
- [x] `useMessages` / `CommentsSection`: a late response for the previous id/key is discarded.
- [x] `RefinementSessionContext`: save/finish invoke the API once even if the updater runs twice.
- [x] `BurnupChart`: switching to a second unseeded sprint triggers auto-seed.
- [x] `TicketGroup`: reordering preserves per-row state (keyed by `jiraKey`).

## Open Questions

- **Refinement context split.** Full split into state + actions contexts (matches `ActivityContext`,
  more work) vs. a single `useMemo` on the value (smaller). Recommend the split if the subtree is
  large enough to matter; otherwise memoize.

## Related

- [[2026-06-22-codebase-audit]] — source audit (Stability — frontend).
- `ActivityContext` — reference pattern for the context-value fix.
- Touch points: `useWorkspaceTask.ts`, `useMessages.ts`, `CommentsSection.tsx`,
  `RefinementSessionContext.tsx`, `ThemeContext.tsx`, `BurnupChart.tsx`, `TicketGroup.tsx`.
