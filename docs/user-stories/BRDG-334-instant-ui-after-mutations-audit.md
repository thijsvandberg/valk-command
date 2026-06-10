# BRDG-334: Mutations should update the UI instantly (stale-cache sweep)

**Status:** Not Started
**Priority:** Medium
**Type:** Bug / Tech-debt audit

## Description

As a PO, when I change something (status, assignee, metadata, sprint, etc.) I expect the
screen to reflect it immediately, without a manual refresh.

Concrete trigger: on a ticket single view I set a **subtask** to status `DEPRECATED`. The
change saved (Jira + DB), but the subtask kept its old status until I refreshed the page.

This is the same class of bug as the already-fixed BRDG-271 (bulk move sprint) and the
documented project pitfall:
*"Cross-route `cache.invalidate` is unreliable in next dev; patch SWR client-side."*

The goal of this story is twofold:
1. Fix the subtask-status case immediately (the concrete bug above).
2. Run a systematic, app-wide audit (using the prompt below) to find every other place
   where a successful mutation does not update the UI until a refresh, and fix them with
   the documented client-side SWR-patch pattern.

## Root cause (subtask-status case)

- The ticket detail GET (`src/app/api/tickets/[key]/route.ts`) caches its response
  server-side for 60s (`src/lib/cache.ts`). That response **embeds the subtasks and their
  statuses**.
- Changing a subtask status calls `PUT /api/tickets/{subtaskKey}/status`
  (`src/app/api/tickets/[key]/status/route.ts`). That route invalidates the subtask's own
  key and the board list pattern `^/api/tickets(\?|$)`, but **not** the parent ticket's
  detail key `/api/tickets/{parentKey}`.
- The client handler `handleJiraStatusChange` in
  `src/components/ticket-detail/SubtasksSection.tsx` only calls `onMutate()` (a bare
  `mutateTicket()` revalidation) after the response. That refetch hits the **still-cached**
  parent detail and gets the old subtask status back. The parent-ticket status change works
  instantly because it does an **optimistic** client cache patch (`{ revalidate: false }`)
  in `useTicketDetailPage.handleJiraStatusChange` — the subtask path doesn't.

## Approach (subtask-status case)

Mirror the established pattern (parent status change, BRDG-271):

1. **Optimistic client-side patch** in `SubtasksSection.handleJiraStatusChange`: before/after
   the PUT, update the parent ticket's SWR cache in place so the changed subtask's
   `jiraStatus` updates immediately (`mutateTicket(updater, { revalidate: false })`), instead
   of relying on a bare `onMutate()` refetch. Roll back / re-validate on failure.
2. **Parent-cache invalidation on the server**: in `PUT /api/tickets/[key]/status`, also
   invalidate the parent ticket's detail cache so a later revalidation returns fresh data
   and confirms (rather than reverts) the optimistic value. The subtask's parent key is
   available on the ticket row — invalidate `/api/tickets/{parentKey}` when the updated
   ticket has a parent.

## Audit prompt (run this to find all other instances)

> Use this prompt verbatim for an investigation/audit agent. It is the reusable deliverable
> of this story. Save the agent's findings to
> `docs/investigations/2026-06-10-stale-ui-after-mutation-audit.md`.

```
You are auditing the valk-command (Bridge) Next.js 15 app for a specific recurring bug:
a mutation (status / assignee / metadata / sprint / label / readiness / score / pin /
flag / link / comment / draft / any write) succeeds on the server, but the UI does not
reflect the change until the user manually refreshes the page.

Known root-cause pattern (documented project pitfall):
- GET API routes cache responses server-side in an in-memory cache (src/lib/cache.ts),
  often for 30-60s. These responses frequently EMBED nested/aggregate data (e.g. a ticket
  detail embeds its subtasks; a sprint list embeds per-ticket fields; the board list
  embeds status/assignee).
- A write route calls cache.invalidate(...) for SOME keys, but in Next dev each route
  handler is a separate module with its OWN cache instance, so cross-route invalidate is
  unreliable. Even in prod, the write route often does not invalidate every GET key that
  embeds the mutated data (notably PARENT / AGGREGATE keys, not just the entity's own key).
- The client mutation handler then relies on a bare mutate()/onMutate() REVALIDATION,
  which refetches and gets the still-cached (stale) server response back. So the UI does
  not change until the cache TTL expires or a background revalidation completes.
- The reliable fix (project guidance): patch the relevant SWR cache(s) CLIENT-SIDE with
  { revalidate: false } (optimistic in-place update), as done in BRDG-271
  (useTicketActions.handleBulkMoveSprint) and useTicketDetailPage.handleJiraStatusChange
  (parent status). Optionally also invalidate the right server keys for correctness.

Your task:
1. Enumerate every client-side mutation handler. Search src/components/ and src/hooks/ for
   write calls: fetch(..., { method: "PUT" | "POST" | "PATCH" | "DELETE" }), apiFetch with
   those methods, and the jira/api client wrappers (e.g. jira.assign, jira.moveSprint,
   apiFetch(`/api/.../metadata`)). List each handler with file:line and the endpoint it hits.
2. For each handler, classify its cache strategy as one of:
   (a) OPTIMISTIC client patch with { revalidate: false } — good, likely instant.
   (b) Bare revalidation only — mutate()/onMutate()/global mutate(key) with no client patch —
       SUSPECT: check whether the revalidated GET key is server-cached and embeds the
       mutated field.
   (c) No cache update at all — relies on navigation / nothing — SUSPECT.
3. For every SUSPECT handler, map the SWR GET key(s) that display the mutated data. Crucially
   include keys that EMBED the entity indirectly (parent ticket detail embeds subtasks; the
   All/board list embeds per-ticket fields; epic children tables; refinement lists;
   stakeholder views). Then open the corresponding GET route and confirm whether it is
   server-cached (cache.get/cache.set in src/app/api/.../route.ts) and whether the matching
   write route's cache.invalidate covers EVERY embedding key (not just the entity's own key).
4. Flag a finding when: the mutated data is shown via a server-cached GET key that the write
   route does not invalidate (or invalidates only via an unreliable cross-route call), AND the
   client does not optimistically patch that key. These are the "needs manual refresh" bugs.
5. Pay special attention to nested/aggregate displays where the mutated entity is NOT the
   top-level resource of the cached response (the subtask-in-parent-detail case is the seed
   example). These are the easiest to miss.
6. Produce a findings table: handler (file:line) | endpoint | displayed-via GET key(s) |
   server-cached? | invalidation gap | client patch present? | severity | proposed fix
   (which SWR key to patch client-side, and which server key to also invalidate).
7. Do NOT fix anything. Output the investigation document only. Group findings by view
   (Sprint Board, Ticket Detail, Epic, Refinement, Stakeholder, Chat, Test Center, Scheduled
   Jobs) and rank by how visible the staleness is to the user.

Constraints: read-only, no code changes. Use grep/glob broadly. Reference file:line for
every claim. Keep the report concise and actionable.
```

## Implementation Plan

1. Fix the subtask-status case (Approach above): client-side optimistic patch in
   `SubtasksSection.handleJiraStatusChange` + parent-cache invalidation in
   `PUT /api/tickets/[key]/status`. Add/extend tests.
2. Run the audit prompt; save findings to
   `docs/investigations/2026-06-10-stale-ui-after-mutation-audit.md`.
3. Triage findings with the PO; fix the confirmed instances using the client-side SWR-patch
   pattern (and server invalidation where cheap and correct). Each fix gets a test.

## Requirements

### 1. Subtask status updates instantly
- Setting a subtask's status (incl. `DEPRECATED`) on the ticket single view reflects on the
  subtask row immediately, no manual refresh.
- A later background revalidation confirms the value rather than reverting it.

### 2. No regression on failure
- If the status write fails, the optimistic value is rolled back (or revalidated) and the
  existing warning is shown.

### 3. App-wide audit completed and documented
- The audit prompt has been run and findings saved to the investigation doc, grouped by view
  and ranked by visibility.

### 4. Confirmed instances fixed
- Each confirmed stale-after-mutation instance is fixed with the client-side SWR-patch
  pattern and covered by a test.

## Out of scope
- Reworking `src/lib/cache.ts` into a cross-module singleton (broader change; the project
  guidance is to patch SWR client-side). May be noted as a follow-up if findings are
  widespread.

## Technical notes
- Reference fixes for the pattern: `useTicketActions.handleBulkMoveSprint` (BRDG-271) and
  `useTicketDetailPage.handleJiraStatusChange` (parent status), both use
  `mutate(updater, { revalidate: false })`.
- The parent ticket detail key is `/api/tickets/{parentKey}`; it embeds subtasks with their
  `jiraStatus`. The subtask's own key `/api/tickets/{subtaskKey}` is not what the detail view
  reads its subtask statuses from.

## Checklist
- [x] Subtask status change patches the parent ticket SWR cache client-side ({ revalidate: false })
- [x] Wired on both the full-page ticket detail and the SidePanel (both use `useTicketDetailPage`)
- [x] `PUT /api/tickets/[key]/status` also invalidates the parent ticket detail cache when the ticket has a parent
- [x] Failure path rolls back / revalidates and still surfaces the warning
- [x] Tests cover instant subtask status update and the failure path
- [ ] Refinement session subtask view (`SessionTicketView`) wired the same way (own data path; deferred to the audit)
- [ ] Audit prompt run; findings saved to `docs/investigations/2026-06-10-stale-ui-after-mutation-audit.md`
- [ ] Confirmed audit findings fixed with the client-side SWR-patch pattern, each with a test
