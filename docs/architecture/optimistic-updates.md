# Optimistic Updates & the Pending-Edits Overlay

How board edits show up instantly without "snapping back" to stale data. Read this
before adding any new editable field to the board.

## The problem: snap-back

The sprint board renders a list fetched with SWR (`useTickets`). That list is
**refetched constantly**:

- a 60s background poll (`refreshInterval`),
- on window focus / when a picker portal closes (`revalidateOnFocus`),
- after a background Jira sync.

Each refetch **replaces the entire list** with whatever the server returns. When a
user makes a local edit (status, assignee, epic, scores, readiness, ...), the change
is written to the server, but the server often has not caught up at the moment the
next refetch fires:

- **Jira read-after-write lag** - a transition or field change takes a moment to
  propagate through Jira's APIs, so a read right after the write returns the old value.
- **Stale response cache** - the `/api/tickets` route caches responses for ~30s, so a
  refetch can serve a snapshot taken before the write.

The result: the row briefly shows the new value, then a refetch overwrites it with the
old value, and it "snaps back" until the server finally catches up (often a minute
later). This is the single most common class of board bug.

## Why patching the SWR cache once is not enough

The naive fix - `mutate(data, { revalidate: false })`, or SWR's
`optimisticData` / `populateCache` - patches the cache **once**. It survives exactly
one revalidation cycle. The very next independent refetch (poll, focus, sync) replaces
the cache again and the value snaps back. This approach was used per-handler and kept
failing for exactly this reason.

## The fix: a render-time overlay that survives every refetch

Optimistic edits live in a small external store, **not** in the SWR cache. The board
re-applies every live edit on top of the list **on every render**, so no refetch can
win. The value is held until the server data confirms it (self-heal) or a TTL safety
net expires. A snap-back is then structurally impossible regardless of which refetch
fired.

This mirrors the older, proven `pendingSprintMoves.ts` overlay (which solved the same
problem for the single "sprint" field) and generalizes it to all editable fields.

### Pieces

| File | Role |
|------|------|
| `src/components/sprint-board/pendingTicketEdits.ts` | The store: `registerPendingEdit` / `confirmPendingEdit` / `clearPendingEdit`, `applyPendingEdits` (merge), `hasPendingEdit`, TTL self-clear. |
| `src/components/sprint-board/useTicketActions.ts` | Every edit handler registers an edit, calls the API, then confirms on success / clears on failure. |
| `src/components/sprint-board/SprintBoard.tsx` | Applies `applyPendingEdits` to the list (next to `applyPendingMoves`) and runs the self-heal effect. |

### Lifecycle of one edit

1. **Register** - the handler calls `registerPendingEdit(key, field, value, Date.now())`.
   The overlay now applies `value` on top of the list immediately and on every refetch.
2. **Call the API** - the write request runs.
3. **Confirm or clear**:
   - success -> `confirmPendingEdit(key, field)`. The edit stays applied (the server may
     still be lagging) but is now eligible to be cleared once the data matches.
   - failure -> `clearPendingEdit(key, field)`. The row falls back to server data and a
     toast reports the revert.
4. **Self-heal** - a `SprintBoard` effect clears a *confirmed* edit as soon as the server
   list reflects the value (`valuesMatch`). Gating on `confirmed` (not mere presence) is
   essential: clearing earlier would let an in-flight stale refetch win the race.
5. **TTL safety net** - if the server never catches up, `registerPendingEdit` self-clears
   the edit after `TTL_MS` (30s) so it can never stick forever.

### Map-rendered fields (poStatus / readiness)

`poStatus` and `readiness` render from local React maps in `useTicketActions`, not
straight off the list object. They use the same store: their handlers register an edit,
and `syncFromApiTickets` skips reconciling a field while `hasPendingEdit` is true, so a
stale refetch cannot reconcile the map back to the old value.

### Edits made from the ticket-detail sidebar (BRDG-382)

The sidebar (`TicketMetaContent.tsx`) edits several fields that also render on the board
row: epic, assignee, status, story points, business value. When the board is open
beside the sidebar (column layout), those edits must survive the board's refetches too,
so each handler registers on this same overlay (`registerPendingEdit` / `confirmPendingEdit`
/ `clearPendingEdit`), exactly like `useTicketActions`.

The catch: the sidebar's own pickers render from local React state that is re-seeded from
the `ticket` prop whenever it changes (the reset effect in `TicketMetaContent.tsx`), and
that prop comes from the per-key **detail** cache. So the sidebar still patches the detail
cache immediately - but via `patchTicketDetailCache` (`ticket-cache.ts`), which patches
**only** `/api/tickets/<key>`, never the list caches. Patching the list cache here would
be self-defeating: the board's self-heal compares the overlay value against the list data,
so a client-side list patch looks like the server "catching up" and clears the overlay
early, letting the next stale refetch win - the exact snap-back this overlay prevents.

Rule for any sidebar field that also lives on the board row: overlay for the board list,
`patchTicketDetailCache` for the sidebar's own re-seed, never `patchTicketCaches` (which
patches the list). Fields with no board-row presence (PO notes, labels) may keep using
`patchTicketCaches`. The one board-row exception is `testDocState`, which patches the list
deliberately because its value has no Jira read-after-write lag — see the Test-doc marker
section below.

### Test-doc marker (testDocState)

The board row's test-doc marker renders from `ticket.testDocState` on the list. Every
action that changes it — Skip in the sprint test-doc bundle (`SprintTestDocsModal`),
Save / "No test doc needed" / the background draft save in the review modal
(`useTestDocReview`) — registers on this overlay. The immediate list revalidation those
handlers fire can be served a pre-write snapshot (the `/api/tickets` response cache plus
the browser honoring its `max-age=10, stale-while-revalidate=20` header), which kept the
old icon until a manual refresh.

**Exception to the sidebar rule: these handlers also patch the *list* cache
(`patchTicketCaches`), not just the detail (BRDG-476).** The general rule above forbids a
client-side list patch because a Jira-lagged field's real read genuinely stays stale for a
while, so the patch would clear the overlay early and the next stale refetch would win.
That reasoning does **not** apply to `testDocState`: it derives from Bridge's own `testDoc`
/ `testDocDraft` columns (`deriveTestDocState`), written synchronously by the save route,
so a real read never lags. Without the list patch the marker relied solely on the overlay's
30s safety-net TTL — which expired before the next list refetch could confirm the value
(SWR dedupes for 15s and only polls every 60s, and generate-then-save happens well inside
that window), snapping the icon back to its pre-save state until a later poll. Patching the
list directly lets the overlay self-heal at once and keeps the row correct.

Two more specifics: an accepted doc outranks a draft server-side (`deriveTestDocState`), so
the draft-save path skips the overlay when an accepted doc exists; and the detail panel is
covered by the same `patchTicketCaches` call (it patches `/api/tickets/<key>` too).

### The save helpers must not patch the list cache for overlay fields (BRDG-383)

`saveTicketMetadata` and `saveStoryPoints` optimistically patch the SWR **list** cache by
default. For a board-row edit that already registers on the overlay, that patch is
self-defeating in exactly the way the sidebar section describes: the client-side list patch
makes the list look like the server caught up, so the self-heal clears the overlay early and
the next stale refetch wins (the value snaps back). The board handlers therefore call the
helpers with `{ patchList: false }`; the overlay is the only display mechanism. The detail-cache
patch stays (the sidebar re-seed). `MultiSprintView` (Compare view) now also rides the overlay
(BRDG-407) and likewise calls these helpers with `{ patchList: false }`.

### On confirm, revalidate the list so the overlay can self-heal (BRDG-455)

`patchList: false` means nothing writes the new value into the loaded list. The overlay
must therefore hand off to a **server** read: the self-heal clears the overlay only once
`apiTickets` reflects the value. If no refetch is triggered, the loaded list never catches
up and the overlay's 30s TTL evicts the value first — the row shows the edit, blinks out at
~30s, then reappears on the next natural refetch.

This bit the three PO-score handlers (`guestimation`, `businessValue`, `storyPoints`). They
confirmed the overlay edit but only revalidated the capacity meter (`/api/sprints/used-points`),
never the ticket list. On the **All view** there is no background poll (`refreshInterval = 0`
in `useSprintBoard.ts`), so nothing refetched the list until a window refocus, and the score
disappeared for the gap between the 30s TTL and that refetch.

Fix: on a confirmed save, revalidate the list so a fresh read lands and the self-heal clears
the overlay cleanly. This is safe because the metadata/story-points write reliably invalidates
the `/api/tickets` response cache (the `cache` store is a `globalThis` singleton, so cross-route
`cache.invalidate` works in dev too), so the refetch returns the new value — not the stale
snapshot that a mid-write revalidation would. The Jira-field handlers (status/epic/assignee)
already revalidate on confirm via the row-actions dispatch; this brings the score handlers in line.

**Use the PROVIDER-BOUND mutate, not the top-level `swr` `mutate`.** The app wraps SWR in a
custom cache provider (`SWRProvider`'s `lruProvider`, BRDG-387). The `mutate` imported directly
from `"swr"` operates on SWR's *default* cache and is a **silent no-op** against every hook that
lives in the provider's cache. The first attempt at this fix used `globalMutate(activeListKey)`
and did nothing — the network showed no refetch after the `PUT`, and the value still blinked out.
(The pre-existing `globalMutate("/api/sprints/used-points")` meter refresh was broken the same way,
including `SprintBoard`'s `refreshMeter`.) Revalidate through provider-bound mutators instead:
- **the ticket list** via the board's `KeyedMutator`, exposed as `adapter.mutate()` (which calls
  `useTickets(...).mutate`);
- **any other key** (e.g. the capacity meter) via `useSWRConfig().mutate("...")`.

Rule of thumb: anywhere you're tempted to `import { mutate } from "swr"` in a component, use
`useSWRConfig().mutate` (or a hook's own `mutate`) instead — the global import will not reach
this app's cache.

**BRDG-458 closed this app-wide.** Every top-level `mutate` usage was audited and fixed (see
`docs/investigations/2026-07-01-top-level-swr-mutate-noop-audit.md` for the per-usage table):
- Hooks/components use `useSWRConfig().mutate`.
- **Non-hook modules** (`ticket-cache.ts`, `sprint-board-utils.ts`, `row-actions/adapter.ts`,
  `prefetch.ts`) cannot call hooks; they mutate through `scopedMutate`
  (`src/lib/swr-scoped-mutate.ts`), a registry `SWRProvider` fills with its provider-bound
  mutator on mount. New non-hook cache helpers should import `scopedMutate` from there —
  never `mutate` from `"swr"`.
- A lint rule (`no-restricted-imports` in `eslint.config.mjs`) errors on the top-level
  `mutate` import anywhere in `src/**` (tests exempt), so the pattern cannot silently return.
- SWR's `preload` is fine as a top-level import (its PRELOAD handshake is keyed off
  default-cache global state on both sides, provider-independent).
- Useful internals fact: a bare provider-bound `mutate(key)` with NO mounted hook still
  deletes SWR's dedup marker, so the next mount refetches even inside `dedupingInterval`
  (this is how the inbox's nav-count refresh works — its NavPanel subscriber mounts on open).

## Adding a new editable board field (checklist)

1. Add the field name to `EditableField` in `pendingTicketEdits.ts`.
2. In the handler: `registerPendingEdit(key, field, value, Date.now())` before the API
   call; `confirmPendingEdit` on success; `clearPendingEdit` on failure.
3. Do **not** add a bespoke `mutate(..., { revalidate: false })` optimistic patch - the
   overlay already handles display; that pattern is what caused the snap-back bug. If the
   handler saves via `saveTicketMetadata` / `saveStoryPoints`, pass `{ patchList: false }`
   so the helper does not patch the list cache either (BRDG-383).
4. If the field renders from a separate map (like poStatus/readiness) rather than the
   list object, guard its reconciliation with `hasPendingEdit`.
5. On a confirmed save, revalidate the loaded list via the **provider-bound** mutator
   (`adapter.mutate()`, never the top-level `swr` `mutate` — it is a no-op against the custom
   cache provider) so the self-heal can clear the overlay before its 30s TTL evicts the value.
   The write invalidates the `/api/tickets` cache, so the refetch is fresh (BRDG-455). Skip only
   if a forced revalidation already happens elsewhere (e.g. the row-actions dispatch).
6. Add a test asserting the value survives a stale refetch (see
   `pendingTicketEdits.test.ts` and the handler tests in `useTicketActions.test.ts`).

## Shared row-actions dispatch + per-surface adapters (BRDG-374)

The bulk row actions (status / readiness / epic / move / quick-move / assignee / labels /
flag / review / subtasks / copy / refine) are written **once** in
`src/components/sprint-board/row-actions/useRowActions.ts`. Each surface — Sprint Board,
Epic children, Inbox — supplies a `RowActionsAdapter` (see `row-actions/adapter.ts`) that
reflects the change in **its own** optimism model. The dispatch never forces one model:

| Step | What the dispatch does | What the adapter does per surface |
|------|------------------------|-----------------------------------|
| `beginEdit(keys, field, value)` | before the write | **Board:** `registerPendingEdit` (+ the readiness map the row renders from). **Epic:** `onChildOptimistic` for status/readiness. **Inbox:** nothing (row carries no flag/readiness state). |
| write per key | shared API call (`apiFetch` / `tickets.*` / `jira.*`) | — |
| `confirmEdit(okKeys)` / `revertEdit(failedKeys)` | after settle | **Board:** confirm/clear the overlay (+ restore the readiness map on revert; revalidate for epic/assignee/labels). **Epic/Inbox:** `mutate()` to revalidate. |
| `beginMove` / `confirmMove` / `revertMove` | sprint move | **Board:** `registerPendingMove` then the BRDG-271 destination-cache injection. **Epic/Inbox:** a local `localMoves` name overlay, then `mutate()`; self-heal drops the override when the refetch reflects the move. |

So the board keeps the global `pendingTicketEdits` / `pendingSprintMoves` overlay described
above, while epic and inbox keep their local React-state overlays — all behind one dispatch.
`useTicketActions` is now only the board's **per-row side-panel** handlers (poStatus / story
points / single readiness / `syncFromApiTickets`) plus the readiness map; its old bulk
handlers moved into `useRowActions`. The board's quick-move + create-sprint (it pins +
navigates) and the flag-reason dialog stay in `SprintBoard`; the epic's DnD move/reorder and
create-zone plan-sprint stay in `EpicChildrenSection`.

## Compare view (MultiSprintView) — migrated (BRDG-407)

The two-column Compare view now uses this overlay for its field edits (`title`, `jiraStatus`,
`type`, `storyPoints`, `businessValue`) instead of the old per-handler
`mutate(..., { revalidate:false })` patches, so those edits no longer snap back. It keeps a
self-heal effect (gated on `confirmed`, like the board) that skips tickets currently held by a
move override. Drag moves still use a per-column whole-list override (the view fetches each sprint
separately, so the board's `pendingSprintMoves` does not map cleanly), but the override is now held
for `MOVE_OVERRIDE_TTL_MS` rather than dropped immediately, so a concurrent refetch can't revert a
move before the server-confirmed state propagates. `readiness`/`poStatus` stay as local React maps:
they are never reconciled from a server read in this view, and `poStatus` has no server-persist path,
so the overlay's TTL semantics would be wrong for them.

## History

- `pendingSprintMoves.ts` - original single-field overlay (sprint moves).
- BRDG-357 - generalized the pattern to all editable fields and removed the fragile
  per-handler cache patches.
- BRDG-382 - wired the ticket-detail sidebar edits (epic, assignee, status, points,
  business value) into the overlay and added `patchTicketDetailCache` so the sidebar no
  longer patches the list cache (which defeated the overlay's self-heal).
