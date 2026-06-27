# BRDG-410: Polling and memory hygiene (timers, visibility, unbounded maps)

**Status:** Completed
**Priority:** Medium
**Type:** Stability / Performance — hooks, contexts, lib

## Status

Shipped 2026-06-26. All five acceptance-criteria items done plus two of the safe minor edges:

- `revalidation-queue`: `markChecked` now prunes `lastChecked` entries past the cooldown over a
  SNAPSHOT (`[...lastChecked]`), never the live Map's iterator (avoids the BRDG-387 freeze class).
  Age-based prune chosen per the Open Question recommendation. Verified live: triggering
  `revalidate-deleted-tickets` returned `cooldownSize: 25` (bounded to the fresh batch).
- `useStakeholderAnalysis`: recover-effect captures its interval in a local, clears any prior one
  before claiming `pollRef`, and returns a cleanup that clears only its own interval (so a later
  `generate()` poll is never clobbered when `rows` revalidates).
- `useLinkIssueSearch`: added an unmount effect clearing both debounce timers and aborting the
  in-flight request.
- `usePipelines`: dropped SWR's static `refreshInterval` (the adaptive manual interval is now the
  single poll source) and gated the manual tick on `!document.hidden`.
- `useWorkspaceHealth`: skips the interval tick while hidden; re-checks once on `visibilitychange`.
- Minor edges: `useLocalStorage` storage-sync effect now depends only on `[key]` and reads
  `defaultValueRef.current` (no listener churn for object/array defaults); `useOutsideClick` holds
  `refs`/`onClose` in refs so the document listeners are not re-subscribed every render.

**Descoped / flagged (intentionally not changed)** — all three tracked in
[[BRDG-417-reaudit-longtail-sync-polling-hygiene]]:
- `useConversations`/`useMessages` SWR migration — larger change; Open Question recommends a
  follow-up. Left as-is.
- `RefinementSessionContext` index-persist timer — its post-unmount write persists the session
  position, which is *wanted*; clearing it on unmount would risk dropping that save. Left as-is per
  the story's own "where the post-unmount write is unwanted" qualifier.
- `event-bus` BroadcastChannel-without-WebLocks double-dispatch — cross-tab leadership code, rare
  fallback, no test; too risky to touch without a dedicated repro. Left as-is.

Verified: full suite green (6875 tests), lint/typecheck/build clean, live endpoints (tickets,
scheduler run, pipelines, workspace health) all 200 with no server errors, and the Pipelines view
rendered with `usePipelines` data (the only console errors are a pre-existing nested-`<a>` hydration
warning in `PipelineRow`, unrelated to this story).

## Description

The 2026-06-25 re-audit ([2026-06-25-refactor-reaudit.md](../investigations/2026-06-25-refactor-reaudit.md))
found a set of long-running-process hygiene issues: an unbounded in-memory Map, a couple of polling
intervals that can leak or double-run, fetches that keep going on hidden tabs, and a hook that can
setState after unmount. Each is small and independent; this story does them in one focused pass.

> **Important context (read first):** the 2026-06-24 "app freezes when editing a description"
> incident was the **LRU SWR cache** (`swr-lru-provider.ts`), fixed 2026-06-25 by commit `7b660cd9`
> (snapshot `keys()`). That fix is correct and out of scope here — **do not touch it**. The
> `revalidation-queue` item below is a **different, slow** leak (a Map that was never capped), not a
> regression and not the freeze. When capping it, prune by age over a **snapshot** — never
> iterate-and-mutate the Map, which is exactly what caused the LRU freeze.

## Current Behaviour

- **`revalidation-queue.lastChecked` is unbounded (Medium, memory).**
  [revalidation-queue.ts:15,51-56](../../src/lib/revalidation-queue.ts): `markChecked()` (called per
  revalidation tick from `scheduled-tasks.ts:246,255`) writes one entry per checked ticket key;
  entries are removed only by explicit `remove()`. `COOLDOWN_MS` (24h) is only a comparison threshold,
  never a pruning trigger. In a long-lived server the Map accumulates one permanent entry for every
  ticket ever viewed. (History note: this file has one commit ever; the cap was proposed in a prior
  audit but never implemented — not a regression.)
- **`useStakeholderAnalysis` interval leak / double-poll (Medium, stability).**
  [useStakeholderAnalysis.ts:140-171](../../src/hooks/useStakeholderAnalysis.ts): the recover-effect
  (deps `[rows]`) assigns `pollRef.current = setInterval(...)` with **no cleanup return**, and
  `generate()` also assigns `pollRef.current`. When `rows` revalidates while a generate-created
  interval is live, the previous interval can be orphaned (un-clearable) or two 4s intervals can poll
  the same task.
- **`useLinkIssueSearch` missing unmount cleanup (Medium, stability).**
  [useLinkIssueSearch.ts:96-98](../../src/hooks/useLinkIssueSearch.ts): debounce timers + abort
  controller are cleared only inside `resetSearch`; there is no unmount effect. Closing the popover
  while a debounce is pending fires `searchForLink` and `setResults` on an unmounted component, and the
  abort is never triggered. Used in 4 places.
- **`usePipelines` double-polls and ignores visibility (Medium, perf).**
  [usePipelines.ts:43-66](../../src/hooks/usePipelines.ts): sets SWR `refreshInterval` (5 min) AND a
  manual adaptive `setInterval` that calls `swrMutate()`. At idle both fire → two refetches per cycle
  for the same key; the manual interval also does not pause on hidden tabs. Imported in 10 places.
- **`useWorkspaceHealth` polls when hidden (Low, perf).**
  [useWorkspaceHealth.ts:54](../../src/hooks/useWorkspaceHealth.ts): 30s poll with no
  `document.visibilityState` guard (sibling tick hooks guard it).
- **Hand-rolled conversation/message polling (Low, structure).**
  [useConversations.ts:47-64](../../src/hooks/useConversations.ts) and
  [useMessages.ts:76-112](../../src/hooks/useMessages.ts) poll via `setInterval`+`setState` instead of
  SWR → undeduped when both consumers mount, not LRU-bounded, no hidden-tab pause. (Larger change;
  optional within this story — see Open Questions.)
- **Minor churn / edges (Low).** `useOutsideClick.ts:25-53` re-subscribes document listeners when
  callers pass inline `refs`/`onClose`; `useLocalStorage.ts:49-56` re-subscribes the storage listener
  for non-primitive defaults (the hook already keeps `defaultValueRef` to avoid exactly this);
  `event-bus.ts:104-110` double-dispatches in the rare BroadcastChannel-without-WebLocks fallback;
  `RefinementSessionContext.tsx:69` index-persist timer not cleared on unmount.

## Proposed Approach

1. **Cap `lastChecked`** — in `enqueue`/`markChecked`, prune entries older than `COOLDOWN_MS` by first
   snapshotting the entries (`[...lastChecked]`) then deleting expired keys, or use a size-bounded LRU
   like `cache.ts`. Add a regression test asserting the size stays bounded. **Do not** iterate the
   live Map while deleting.
2. **`useStakeholderAnalysis`** — give the recover-effect a cleanup that clears its interval, and
   clear `pollRef.current` before assigning a new one in both the recover-effect and `generate`.
3. **`useLinkIssueSearch`** — add an unmount effect that clears both debounce timers and aborts
   `abortRef.current`.
4. **`usePipelines`** — keep a single source of polling (drop the static `refreshInterval` or the
   manual interval) and gate the manual one on `document.visibilityState === "visible"`.
5. **`useWorkspaceHealth`** — skip the fetch when hidden; trigger one check on `visibilitychange` →
   visible.
6. **Minor edges** — stabilize `useOutsideClick` (keep `onClose` in a ref, depend on ref identities),
   read `defaultValueRef.current` in `useLocalStorage`'s handler, guard the event-bus fallback
   re-post on leadership, clear the refinement persist timer on unmount where the post-unmount write
   is unwanted.

No user-facing behaviour change; the app uses less memory over long sessions and stops redundant
background traffic.

## Acceptance Criteria

- [x] `revalidation-queue` memory stays bounded over a long session (old `lastChecked` entries are
      pruned), implemented without iterating-and-mutating the live Map.
- [x] `useStakeholderAnalysis` never leaves an orphaned poll interval and never runs two for one task.
- [x] `useLinkIssueSearch` performs no setState/fetch after unmount; pending aborts fire on close.
- [x] `usePipelines` makes one refetch per idle cycle and does not poll on hidden tabs.
- [x] `useWorkspaceHealth` does not poll on hidden tabs.
- [x] No regression in stakeholder analysis, link search, pipelines, or workspace health.

## Tests

- [x] `revalidation-queue` test asserts `cooldownSize` stays bounded after many `markChecked` calls
      spanning past `COOLDOWN_MS`.
- [x] `useStakeholderAnalysis` test: a `rows` change during a live poll does not create a second
      interval; unmount clears it.
- [x] `useLinkIssueSearch` test: unmount with a pending debounce fires no setState and aborts.
- [x] `usePipelines` / `useWorkspaceHealth` tests: no poll when `document.hidden`.

## Open Questions

- **`useConversations`/`useMessages` SWR migration.** Worth folding in (dedupe + hidden-tab pause +
  LRU-bounded) but it requires porting the optimistic create/delete/markRead logic to `mutate`.
  Recommend: do it as a follow-up unless this story has room — flag if descoped.
- **`lastChecked` strategy.** Age-based prune (simplest, matches the 24h cooldown intent) vs. LRU cap
  (matches `cache.ts`). Recommend age-based prune.

## Related

- [[2026-06-25-refactor-reaudit]] — source audit (Polling & memory hygiene); see the LRU-freeze note.
- [[BRDG-387]] — the LRU SWR provider whose freeze (separate issue) is already fixed.
- Touch points: `revalidation-queue.ts`, `useStakeholderAnalysis.ts`, `useLinkIssueSearch.ts`,
  `usePipelines.ts`, `useWorkspaceHealth.ts`, `useOutsideClick.ts`, `useLocalStorage.ts`,
  `event-bus.ts`, `RefinementSessionContext.tsx`.
