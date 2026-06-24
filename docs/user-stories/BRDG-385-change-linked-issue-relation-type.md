# BRDG-385: Change a linked issue's relation type in place

**Status:** Not Started
**Priority:** Medium
**Type:** Feature / UX — Linked Issues

## Description

As a Product Owner, on every place where I see a related/linked issue, I want to change the
**type of the link** (e.g. from "relates to" to "is blocked by") without removing the link and
re-adding it by hand. I am not changing *which* issue is linked, only the **relation** between
the two.

Jira's REST API has **no "edit link type"** operation — an issue link's type is immutable once
created. So changing the type means **delete the existing link + create a new one** with the new
type. That round-trip should be hidden behind a single user action ("change the type"); the PO
never deletes and re-adds manually.

## Where related items appear

All "existing linked issue" UI in the app is a **single shared component**:

- [LinkedIssuesSection.tsx](../../src/components/ticket-detail/LinkedIssuesSection.tsx) renders the
  links grouped by relation heading (the "RELATES TO" group in the screenshot), and
  [LinkedIssueRow.tsx](../../src/components/ticket-detail/LinkedIssueRow.tsx) renders each row.
- It is mounted in exactly two hosts:
  [TicketTabContent.tsx](../../src/components/ticket-detail/TicketTabContent.tsx) (the ticket
  detail side panel) and
  [SessionTicketView.tsx](../../src/components/refinement-session/SessionTicketView.tsx) (the
  refinement session view).

So implementing the change-type affordance **once** in the shared component covers every place
the PO sees related items. The AI **suggestion** chips (`RelatedSuggestions`,
`LinkSuggestionChips`) are not existing links — they already let you pick a relation on accept and
are **out of scope**.

## Current behaviour

- Each row in a relation group shows a **Delete** button only
  ([LinkedIssuesSection.tsx](../../src/components/ticket-detail/LinkedIssuesSection.tsx),
  `DeleteButton` in `actionsSlot`). There is no way to change the relation.
- To re-type a link today the PO must delete it and add a new one via the composer — two manual
  steps, and the link briefly disappears.
- The link composer already has a **relation picker** (the filterable `useLinkTypes` dropdown,
  `inlineRelation` state) used when *creating* a link. The label list comes from
  [useLinkTypes.ts](../../src/hooks/useLinkTypes.ts), each entry carrying `{ value, label,
  jiraTypeName, direction }`.

The delete + create plumbing already exists and handles the Jira specifics:

- `POST /api/tickets/[key]/links`
  ([route.ts](../../src/app/api/tickets/[key]/links/route.ts)) creates a Jira link, resolving
  `jiraTypeName` + `direction` (it swaps source/dest for inward links). Falls back to a
  hardcoded relation→type map when Jira link types can't be fetched.
- `DELETE /api/tickets/[key]/links` removes the Jira link by `jiraLinkId` (and the local
  `ticketLink` row), tolerating a missing/locally-created link id.
- Client wrappers: `tickets.createLink(...)` and `tickets.deleteLink(...)` in
  [api-client.ts](../../src/lib/api-client.ts).
- `LinkedIssue.jiraLinkId` is populated by
  [ticket-detail-builder.ts](../../src/lib/ticket-detail-builder.ts) from the synced
  `ticketLink` row; a just-created, not-yet-synced link has `jiraLinkId` null until a Jira sync
  backfills it.

## Proposed approach

### Backend: one combined "retype" operation

Add a single server-side operation that does **delete-then-create atomically-ish**, instead of
making the client fire two requests. Preferred shape: extend
[/api/tickets/[key]/links/route.ts](../../src/app/api/tickets/[key]/links/route.ts) with a
`PATCH` handler.

Request: the existing link's identity (`jiraLinkId`, `linkedKey`, current `relation`) plus the
**new** relation (`relation`, and `jiraTypeName` + `direction` resolved client-side from
`useLinkTypes`, same as create does today).

Behaviour:
1. No-op guard: if the new relation equals the current one, return success without touching Jira.
2. Duplicate guard: if `linkedKey` is already linked under the new relation, return a 4xx the UI
   can surface as "already linked as <new relation>".
3. Delete the existing Jira link, then create the new one with `jiraTypeName` + `direction`. If
   `jiraLinkId` is null (link created in Bridge but not yet backfilled by a Jira sync — see Edge
   cases), **resolve the real link id from Jira on demand** (fetch the issue's links, match by
   `linkedKey` + current type) and delete that, so we never leave the old link behind. Only when
   the row is still a local `pending-` placeholder (no Jira link exists yet at all) do we skip the
   Jira delete and just create.
4. **Rollback:** if the create fails after the delete succeeded, re-create the original link so
   the PO never ends up with the link silently gone. Surface a clear error if even rollback fails.
5. One activity-log entry ("Changed link type: <key> <old> → <new>"), and invalidate the same
   caches the create/delete paths already invalidate (including the related-suggestion cache).

Doing this server-side gives one atomic-ish unit, one log line, and no window where the link is
entirely absent. A client-side `deleteLink` → `createLink` sequence is the fallback if the PATCH
proves awkward, but it double-invalidates caches and flickers.

Add `tickets.changeLinkType(...)` (or `updateLink`) to
[api-client.ts](../../src/lib/api-client.ts).

### Frontend: per-row relation editor

In [LinkedIssuesSection.tsx](../../src/components/ticket-detail/LinkedIssuesSection.tsx) /
[LinkedIssueRow.tsx](../../src/components/ticket-detail/LinkedIssueRow.tsx):

- Give each row a way to **change its relation** — reuse the existing filterable relation picker
  from the composer (same `useLinkTypes` list, same keyboard nav) rather than building a new one.
  **Placement (decided):** an **Edit / Change-type action next to the existing Delete action** on
  the row; activating it opens the relation picker.
- On change, **optimistically move the row** from its current relation group to the new group
  (the rows are grouped by `relation`), reusing the section's existing `inlinePending` /
  `deletingKeys` overlay style so it doesn't snap back during the refetch, then call the backend
  and `onMutate()`.
- On error, revert the optimistic move and show the inline error (same `inlineError` channel used
  today).
- Disable changing type on a still-`pending-` row (no real link to retype yet) and while a
  retype for that row is in flight.

## Implementation Plan

Decided after an Opus plan + codebase verification.

### Backend: `PATCH` handler in [route.ts](../../src/app/api/tickets/[key]/links/route.ts)

Add `export async function PATCH` alongside POST/DELETE. `getRelationMapping`, `FALLBACK_RELATION_TO_JIRA`,
and the cache constants are already module-private and reusable.

Request body: `{ jiraLinkId?, linkedKey, currentRelation, relation, jiraTypeName?, direction? }`.

1. POST preamble: `validatePathParam` → `resolveDraftKey` → ticket-exists 404; `parseJsonBody`.
2. 400 if `linkedKey` or `relation` missing.
3. **No-op:** `relation === currentRelation` → 200 (POST-shaped body), no Jira touch, no log/invalidate.
4. **Duplicate:** local `ticketLink` row with `ticketKey===key && linkedKey===linkedKey && relation===relation`
   (the NEW relation) → 409 `"<linkedKey> is already linked as \"<relation>\""`.
5. Resolve new type+direction: prefer body `jiraTypeName`+`direction`, else `getRelationMapping()`
   (default `Relates`/outward). `newSource = isInward ? linkedKey : key`, `newDest = isInward ? key : linkedKey`.
6. **Delete strategy (three cases):** `pending-` id → skip Jira delete; real id → delete it; `undefined`/null
   (synced-but-no-id) → resolve via new private `resolveJiraLinkId(parentKey, linkedKey, currentRelation)`
   (`getIssueLinksByKeys([parentKey])`, match `type.name` + the linked-side key + direction); null result → no delete.
7. **Delete-then-create + rollback:** capture old type/direction first. If delete warranted and it throws → 502
   (nothing destroyed). Then `createIssueLink(newSource,newDest,newType)`; on failure after a successful delete →
   re-create the original (recompute old source/dest); 502 `"...; original link restored"` or, if rollback also
   throws, `"...could not restore the original link"` + `logger.error`.
8. **Local DB:** after Jira create succeeds, `db.delete(ticketLink)` scoped to `currentRelation` then `db.insert`
   the new row (`jiraLinkId: null`, new `relation`, copy title/type/status/assignee).
9. `syncJiraTimestamp` (non-fatal), invalidate the same caches as POST/DELETE (incl. `relatedSuggestionCache`),
   single `logActivity` `"Changed link type: <linkedKey> <currentRelation> → <relation>"`, return POST-shaped JSON.

Factor a private `resolveTypeAndDirection(relation, jiraTypeName?, direction?)` shared by POST + PATCH.

### api-client: [api-client.ts](../../src/lib/api-client.ts)

`changeLinkType(key, { jiraLinkId?, linkedKey, currentRelation, relation, jiraTypeName?, direction? }, signal?)`
→ `PATCH /api/tickets/<key>/links`, returns `LinkedIssue`.

### Frontend: per-row Change-type action

- **Extract `RelationPicker.tsx`** from the composer's inline dropdown
  ([LinkedIssuesSection.tsx](../../src/components/ticket-detail/LinkedIssuesSection.tsx) ~494-581);
  props `{ value, onChange, linkTypes, autoFocus?, onClose? }`, internal open/filter/highlight state, identical
  DOM/classes. Re-point the composer at it (keeps existing composer tests green).
- **State lives in the section** (rows are recreated on regroup): `editingKey` (composite `${key}:${relation}` of the
  open row), `retypingKeys: Set` (in-flight). Reuse existing `inlinePending`, `effectiveDeletingKeys`, `inlineError`.
- **`handleChangeType(item, newRelation)`:** no-op short-circuit; client duplicate short-circuit (set `inlineError`);
  optimistic move = add old composite to `deletingKeys` + push `{...item, relation:newRelation}` into `inlinePending`
  + add new composite to `retypingKeys`; call `tickets.changeLinkType(...)` with `jiraTypeName`/`direction` from
  `linkTypes.find(lt => lt.value === newRelation)`; on success `onMutate()` + clear `retypingKeys` (overlays self-prune
  on refetch — same pattern as create at ~325-330); on error revert (drop old composite from `deletingKeys`, drop the
  placeholder, clear `retypingKeys`, set `inlineError`).
- **Row wiring** (~744-761): non-pending `actionsSlot` renders a `ChangeTypeButton` (toggles `editingKey`) next to
  `DeleteButton`; pending rows keep `actionsSlot={undefined}`. When `editingKey===thisComposite`, render `RelationPicker`
  as a sibling under the row within the group container (mirrors how `composerAt===relation && linkComposer` renders),
  not in the hover-only overlay. Switch row React `key` to the composite to avoid a duplicate-key warning during the move.
- Both hosts (`TicketTabContent`, `SessionTicketView`) mount the same section → no host changes.

### Tests

- [route.test.ts](../../src/app/api/tickets/[key]/links/route.test.ts): happy path (delete real id → create with
  swap), no-op, 409 duplicate, rollback (create rejects → original re-created → 502), null id resolved via
  `getIssueLinksByKeys`, `pending-` skips delete, symmetric type = no swap. Add `getIssueLinksByKeys` to the jira mock.
- [LinkedIssuesSection.test.tsx](../../src/components/ticket-detail/LinkedIssuesSection.test.tsx): optimistic group
  move + correct `changeLinkType` payload; error reverts + shows message; same-relation = no call + closes; pending row
  has no Change-type action.

### Order

1. Backend PATCH + helpers → 2. route tests → 3. api-client wrapper → 4. extract `RelationPicker` + re-point composer
(prove no regression) → 5. section `handleChangeType` + row action → 6. section tests → 7. `verify` + `build`.

### Known gaps

- Duplicate detection is against the **local** `ticketLink` mirror (can miss an unsynced Jira link) — consistent with
  the rest of the system trusting the local mirror.
- Picker rendered under the row (not in the hover-only `actionsSlot` overlay), since that overlay hides on pointer-leave.

## Acceptance criteria

- [x] On a linked-issue row, the PO can change the link's relation type (e.g. "relates to" →
      "is blocked by") in place, in both hosts (ticket detail side panel and refinement session).
- [x] The row moves to the correct relation group reflecting the new type.
- [x] Behind the scenes the old Jira link is removed and a new one created with the correct Jira
      type **and direction** (inward vs outward); the change persists after a refresh/re-sync.
- [x] Selecting the same relation is a no-op (no Jira churn).
- [x] Changing to a relation the issue is already linked under is rejected with a clear message.
- [x] If the new link can't be created, the original link is restored (no silent data loss) and
      an error is shown.
- [x] AI suggestion chips are unchanged.
- [ ] `npm run verify` and `npm run build` pass.

## Tests

- [x] PATCH route: happy path (delete old + create new with right type/direction), no-op when
      relation unchanged, duplicate-relation rejection, rollback when create fails after delete,
      tolerates a null/`pending-` `jiraLinkId`.
- [x] `tickets.changeLinkType` client wrapper hits the route with the right payload (asserted via
      the `LinkedIssuesSection` change-type test).
- [x] `LinkedIssuesSection`: changing a row's relation optimistically moves it between groups and
      calls the API; error reverts and surfaces the message; same-relation pick does nothing;
      pending rows can't be retyped. Plus a focused `RelationPicker` unit test.

## Edge cases

- **Not-yet-synced links** (`jiraLinkId` null) — a link just added in Bridge exists in Jira but
  Bridge hasn't yet backfilled Jira's internal link id (that happens on the next sync). Retyping
  in that window resolves the id from Jira on demand before deleting (see Proposed approach step
  3), so the old link is never left dangling as a duplicate. Only a still-`pending-` placeholder
  (no Jira link created yet at all) skips the delete.
- **Link types without a distinct inward/outward** (symmetric like "relates to") — direction is
  carried by `useLinkTypes`, so this is automatic, but worth a test.

## Related

- [[BRDG-215-all-jira-link-types]] — surfaced the full Jira link-type set and the
  `jiraTypeName`/`direction` resolution reused here.
- [[BRDG-224-link-editor-popover]] — the link editor/composer this builds on.
- [[BRDG-332-open-related-issues-in-sidebar]] — made linked-issue rows clickable into the panel.
- [[BRDG-150-link-issue-search-improvements]], [[BRDG-225-improve-link-issue-search]] — the link
  search used by the composer.
- Optimistic overlay pattern: [optimistic-updates.md](../architecture/optimistic-updates.md).
