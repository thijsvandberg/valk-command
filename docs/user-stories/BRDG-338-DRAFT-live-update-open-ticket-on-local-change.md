# BRDG-338: Live-update an Open Ticket When Its Local Data Changes

**Status:** Done
**Priority:** TBD
**Type:** Story
**Builds on:** BRDG-243 (story-writer outdated-draft warning, the existing ticket-events SSE), BRDG-021/BRDG-158 (incremental sync), BRDG-172 (Jira comments from Bridge)

## Problem

When a ticket detail page is already open and the same ticket's data changes elsewhere, the open view stays **stale** until the user manually refreshes or reopens it.

Concrete repro (the trigger for this story): a comment was added to VPL-46432 in Jira. Opening the ticket in a *new* tab fetched and showed the comment (the on-open single-ticket sync wrote it to our local SQLite). But the *already-open* tab kept showing the old state. It should have updated too, because the data was already local by then.

### Why it happens

The local DB is fresh, but nothing tells the open tab.

- The on-open single-ticket sync (and the manual "refresh from Jira") only revalidate **their own tab's** SWR cache. SWR caches live per browser context, so tab A never learns that tab B just wrote a new comment to the shared DB.
- The 150s background incremental sync *does* `globalMutate` all `/api/tickets*` caches, but only within the tab running that poll, and only on its own ~150s cadence. So a change can sit invisible on an open tab for up to ~150s, or indefinitely if that tab isn't the one that synced.
- There is already an in-process SSE channel (`GET /api/tickets/[key]/events` + `emitTicketEvent` + `useTicketEvents`), but today it:
  - is consumed **only by Story Writer** (not the normal ticket detail page or the board), and
  - emits **only `content:changed`** (description / AC version), never comments, status, assignee, story points, sprint, labels, etc.

So the plumbing for cross-tab push exists but is narrow and barely wired up.

## Goal

As the PO, when I have a ticket open and its data changes from **any** source — another tab, a Jira sync, an agent push, a Bridge-side edit — the open view should update **as soon as the change has landed in our local DB**, without me refreshing or reopening.

Because all SSE connections hit the same Next.js process and the emitter is an in-process singleton, emitting on every local upsert fans the change out to every open tab subscribed to that ticket key. No Jira inbound webhook is required (that remains a separate, larger effort — see Out of scope).

## Scope of updates to cover

The fix must not be comment-only. Any remote/local change to the open ticket should propagate:

- Jira comments (new / edited / deleted)
- Status changes
- Assignee changes
- Description / acceptance criteria (already partly covered via `content:changed`)
- Story points / business value
- Sprint membership (move / carry-over)
- Labels and flags
- Watchers
- New / changed subtasks and issue links

## Decisions (from refinement)

These resolve the original open questions:

1. **Typed events.** The event carries *what* changed (e.g. `comment`, `status`, `assignee`, `content`, `points`, `sprint`, `labels`, ...), not just a generic "something changed". This enables the brief highlight below and any future in-place UI.
2. **Live on detail + board + refinement.** The ticket detail page and side panel, the sprint board rows, and the refinement lists all update live. (The board/refinement keep their existing 150s poll as a fallback; SSE is the fast path.)
3. **Brief highlight on change.** The changed spot (e.g. the new comment, the status pill) briefly lights up so the user notices something just arrived. Not a silent swap.
4. **Keep the existing "ticket changed" warning while editing.** During an active Story Writer / inline-edit session in the same tab, the BRDG-243 outdated-draft behaviour is preserved: the user is told and chooses when to take the change. No silent overwrite of in-progress edits.

## Approach (to refine)

1. **Broaden the event into typed events.** Extend `TicketEvent` beyond `content:changed` to a small set of typed change kinds so subscribers know what moved. The minimum any subscriber needs is "this key changed, revalidate"; the kind drives the highlight and lets the board update just the affected pill cheaply.
2. **Emit on every local write path.** Fire `emitTicketEvent` wherever a ticket's local data is written, not just the version-change branch in `upsertIssue`: single-ticket sync, incremental sync, comment sync (`/api/jira/sync-comments`, `POST .../jira-comments`), and Bridge-side metadata/field mutations.
3. **Subscribe the detail page, board, and refinement.** The ticket detail view (`useTicketDetailPage`) subscribes to `useTicketEvents(key)` and revalidates its SWR caches (`mutateTicket`, comments) on an event for the open key. The sprint board and refinement lists subscribe for the keys they currently render and revalidate / patch the affected row. Today only Story Writer listens.
4. **Brief highlight.** On applying a live update, the changed element flashes a short, subtle highlight (transform/opacity only, per the project's animation rules). Keyed off the typed change kind so only the relevant element highlights.
5. **Avoid self-echo / churn.** A tab that just made the edit itself should not visually thrash; debounce/coalesce bursts (a sync can upsert many fields at once) into a single revalidate, and suppress the highlight for changes the current tab originated.
6. **Preserve editing safety.** When the open tab has an active edit/Story Writer session, route the change through the existing outdated-draft warning (BRDG-243) instead of a silent refresh of the edited fields.

## Implementation Plan

### Event type design

Widen `TicketEvent` in `src/lib/ticket-events.ts` to a single event name with typed change kinds:

```ts
export type TicketChangeKind =
  | "content" | "status" | "assignee" | "points" | "sprint"
  | "labels" | "comment" | "subtasks" | "links";

export interface TicketEvent {
  type: "ticket:changed";
  ticketKey: string;
  kinds: TicketChangeKind[];   // coalesced per write
  origin?: string | null;      // tab id for self-echo suppression
}
```

### Subscription model

- Detail page + side panel: existing per-key SSE (`/api/tickets/[key]/events` + `useTicketEvents`), one connection per open detail.
- Board + refinement: a single multiplexed broadcast stream (new `/api/tickets/events` route + new `useTicketEventsStream` hook, modeled on the existing `refinement-sessions/stream` pattern). Per-row EventSources would hit the browser's ~6-connections-per-origin cap.

### Self-echo suppression

- New `src/lib/client-id.ts`: per-tab `getClientId()` via `sessionStorage` + `crypto.randomUUID()`.
- `apiFetch` injects `X-Bridge-Client` header on every call; write routes thread it into `emitTicketEvent` as `origin`.
- Subscribers: `origin === getClientId()` → revalidate but no highlight; foreign/null origin → revalidate + highlight. Background syncs have no origin and highlight everywhere (correct).

### Coalescing

- Server: `upsertIssue` accumulates `kinds` and emits one terminal event per call.
- Client: hooks debounce revalidation per key (~200ms trailing) via existing `useDebouncedCallback`.

### Steps (in order)

1. **Event type + emitter** (`src/lib/ticket-events.ts`): widen the type.
2. **Per-key SSE route + hook** (`events/route.ts`, `useTicketEvents.ts`): emit/listen `ticket:changed`, pass `kinds`/`origin`, debounce; update Story Writer listener to gate on `kinds.includes("content")` (BRDG-243 unchanged).
3. **Broaden emit in `upsertIssue`**: `kinds` accumulator (status/assignee/points/sprint/labels/comment/subtasks/links), single terminal emit; `content` keeps the `needsNewVersion && !isOwnPushEcho` gate; new tickets emit nothing.
4. **Comment write paths emit**: `/api/jira/sync-comments` (when synced > 0) and `POST /api/tickets/[key]/jira-comments` (with origin header).
5. **Self-echo infra**: `client-id.ts`, `apiFetch` header; add emits with origin to Bridge-side write routes (`status/route.ts`, `metadata/route.ts`).
6. **Highlight primitive**: new `src/hooks/useChangeHighlight.ts`, transform/opacity-only pulse, respects `prefers-reduced-motion`.
7. **Subscribe the detail page** (`useTicketDetailPage.ts`): revalidate ticket + comments caches on event; route through BRDG-243 outdated-draft path during active edits; suppress own-origin highlight.
8. **Broadcast stream**: new `/api/tickets/events` route + `useTicketEventsStream` hook patching/revalidating list caches via `ticket-cache.ts`.
9. **Wire board + refinement**: mount stream hook once in the board/refinement containers; per-row highlight into `BoardRow` (NOT legacy `TicketRow`).

### Known gaps (resolved defaults)

- **Watchers are never stored locally** (fetched on demand from Jira) so they cannot fire a local-write event; excluded from v1, flagged below in AC.
- **Business value** is Bridge-only (`ticketMetadata`), so its live path is the metadata route emit (step 5), grouped under kind `points`.
- The `content:changed` → `ticket:changed` wire rename is safe: in-process emitter, both ends ship together.

## Acceptance Criteria (draft - to refine)

- [x] With ticket X open in tab A, adding a comment to X (via Jira, then synced into local DB by any path) makes tab A show the new comment without manual refresh
- [x] Same for status, assignee, description/AC, story points, business value, sprint, labels, flags, subtasks/links <!-- watchers excluded: they are fetched from Jira on demand and never stored locally, so no local write exists to fire an event; needs a separate "persist watchers" story first -->
- [x] The trigger works regardless of *which* tab/process caused the local write (on-open sync, incremental sync, agent push, Bridge edit)
- [x] Update appears promptly after the data is local (target: within ~1-2s of the local write, not the next 150s poll)
- [x] The change kind is carried in the event so subscribers know what moved (comment / status / assignee / content / points / sprint / labels / ...)
- [x] The sprint board rows update live for tickets they currently render (poll remains as fallback) <!-- refinement lists skipped: RefinementPageContent/RefinementTicketList carry uncommitted parallel work (BRDG-336/337) in the shared tree; wiring is one hook mount + row highlight, tracked as follow-up below -->
- [x] The changed element briefly highlights on a live update; the tab that originated the change shows no highlight
- [x] The tab that originated an edit does not flicker or lose in-progress editor state; during an active edit/Story Writer session the change goes through the existing BRDG-243 outdated-draft warning, not a silent overwrite
- [x] Rapid bursts of field changes coalesce into a single revalidate, not one per field
- [x] SSE connection auto-reconnects on drop (existing heartbeat/reconnect behaviour retained) and is cleaned up on unmount

## Technical Notes

- Existing infra to extend, not replace:
  - `src/lib/ticket-events.ts` - in-process `EventEmitter` singleton, `emitTicketEvent` / `onTicketEvent`.
  - `src/app/api/tickets/[key]/events/route.ts` - per-key SSE stream (15s heartbeat, filters by key).
  - `src/hooks/useTicketEvents.ts` - `EventSource` client hook with auto-reconnect.
  - `src/lib/upsert-issue.ts` - currently emits `content:changed` only on version change; add the broader emit here and on the comment/metadata write paths.
  - `src/hooks/useTicketDetailPage.ts` - the consumer that must subscribe and revalidate (`mutateTicket`).
  - `src/hooks/useIncrementalSync.ts` - already `globalMutate`s `/api/tickets*` in-tab; SSE complements it for cross-tab and lower latency.
- The emitter is process-local. This works for the single-process dev/prod setup; if Bridge ever runs multi-process, cross-tab fan-out would need a shared bus (note, not v1 scope).

## Out of scope

- **Jira inbound webhook** (`/api/jira/webhook`): true server push from Jira, eliminating the poll latency entirely. Larger effort (Jira admin config, public URL/tunnel for local dev, secret validation). The PRD lists it; track as a separate follow-up. This story makes open tabs update as soon as data is *local*, regardless of how it got there.
- **Watchers** (discovered during implementation): watchers are fetched from Jira on demand and never written to the local DB, so there is no local write to react to. Live watcher updates need a "persist watchers locally" story first.

## Follow-ups

- **Wire the refinement lists** to the broadcast stream (mount `useTicketEventsStream()` in `RefinementPageContent`, row highlight via `useLiveTicketChange`). Deferred because those files carried uncommitted parallel work (BRDG-336/337) during implementation; the 150s poll covers refinement in the meantime.
- **Side panel highlight**: the side panel already updates live through the shared `useTicketDetailPage` hook; only the visual pulse on its status pill was deferred because `SidePanel.tsx` carried uncommitted parallel work.

## Tests

- [x] Emitting a ticket event causes a subscribed detail page to revalidate its SWR caches (`useTicketDetailPage.test.ts`)
- [x] The emitted event carries the correct change kind (`ticket-events.test.ts`, `upsert-issue.test.ts`)
- [x] Comment sync (Jira-comment POST and `/api/jira/sync-comments`) emits a ticket event for the key (both route tests)
- [x] `upsertIssue` emits on field-only changes (status/assignee/SP), not just version changes (`upsert-issue.test.ts`)
- [x] Event for key X does not trigger a revalidate on an open view of key Y (per-key route test + `useTicketEventsStream.test.ts`)
- [x] A subscribed board row revalidates when its ticket changes (`useTicketEventsStream.test.ts`)
- [x] The changed element highlights on a foreign change but not on a change the current tab originated (`useLiveTicketChange.test.ts`, `useTicketDetailPage.test.ts`)
- [x] During an active edit session, a live change routes to the outdated-draft warning rather than overwriting edited fields (`useTicketDetailPage.test.ts`, `useStoryWriterActions.externalChange.test.ts`)
- [x] Burst of field changes coalesces into a single revalidate (`useTicketEvents.test.ts`, `useTicketEventsStream.test.ts`)
- [x] SSE route still filters by key and reconnects after disconnect (`events/route.test.ts`, `useTicketEvents.test.ts`)

## Dependencies

None blocking. Reuses the ticket-events SSE from BRDG-243. Coordinate with Story Writer staleness handling so live refresh and the outdated-draft warning don't conflict.
