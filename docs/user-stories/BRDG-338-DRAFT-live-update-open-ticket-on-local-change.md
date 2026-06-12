# BRDG-338: Live-update an Open Ticket When Its Local Data Changes

**Status:** Placeholder
**Priority:** TBD
**Type:** Story
**Builds on:** BRDG-243 (story-writer outdated-draft warning, the existing ticket-events SSE), BRDG-021/BRDG-158 (incremental sync), BRDG-172 (Jira comments from Bridge)

> Placeholder / draft story. Scope is sketched but not yet refined. Details to be discussed before any implementation.

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

## Acceptance Criteria (draft - to refine)

- [ ] With ticket X open in tab A, adding a comment to X (via Jira, then synced into local DB by any path) makes tab A show the new comment without manual refresh
- [ ] Same for status, assignee, description/AC, story points, business value, sprint, labels, flags, watchers, subtasks/links
- [ ] The trigger works regardless of *which* tab/process caused the local write (on-open sync, incremental sync, agent push, Bridge edit)
- [ ] Update appears promptly after the data is local (target: within ~1-2s of the local write, not the next 150s poll)
- [ ] The change kind is carried in the event so subscribers know what moved (comment / status / assignee / content / points / sprint / labels / ...)
- [ ] The sprint board rows and refinement lists also update live for tickets they currently render (poll remains as fallback)
- [ ] The changed element briefly highlights on a live update; the tab that originated the change shows no highlight
- [ ] The tab that originated an edit does not flicker or lose in-progress editor state; during an active edit/Story Writer session the change goes through the existing BRDG-243 outdated-draft warning, not a silent overwrite
- [ ] Rapid bursts of field changes coalesce into a single revalidate, not one per field
- [ ] SSE connection auto-reconnects on drop (existing heartbeat/reconnect behaviour retained) and is cleaned up on unmount

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

## Tests

- [ ] Emitting a ticket event causes a subscribed detail page to revalidate its SWR caches
- [ ] The emitted event carries the correct change kind (comment / status / assignee / content / ...)
- [ ] Comment sync (Jira-comment POST and `/api/jira/sync-comments`) emits a ticket event for the key
- [ ] `upsertIssue` emits on field-only changes (status/assignee/SP), not just version changes
- [ ] Event for key X does not trigger a revalidate on an open view of key Y
- [ ] A subscribed board/refinement row revalidates when its ticket changes
- [ ] The changed element highlights on a foreign change but not on a change the current tab originated
- [ ] During an active edit session, a live change routes to the outdated-draft warning rather than overwriting edited fields
- [ ] Burst of field changes coalesces into a single revalidate
- [ ] SSE route still filters by key and reconnects after disconnect

## Dependencies

None blocking. Reuses the ticket-events SSE from BRDG-243. Coordinate with Story Writer staleness handling so live refresh and the outdated-draft warning don't conflict.
