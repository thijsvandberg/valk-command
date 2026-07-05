# BRDG-471: Auto-generate a test doc when a pinned-sprint ticket moves to Test

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description

Test docs already exist end-to-end (generate → review → accept → Jira block), but generation is always a manual click. This story makes it automatic for the sprints the PO actually cares about, and makes the "a draft is waiting for you" state impossible to miss.

Decided behaviour:

- When a ticket **in a pinned sprint** transitions to **Test** status, Bridge automatically kicks off test-doc generation in the background (no click). It reuses the existing generation flow, so the result lands as a **draft** in `ticket_metadata.test_doc_draft*`, exactly like a manual generation.
- The draft still has to be **accepted** by the PO (review modal → Save). Auto-generation only produces the draft; it never writes to Jira on its own.
- On the sprint board, a waiting draft shows a **persistent "Test doc draft ready to accept"** signal in the status line under the ticket. Unlike the status/sprint/deploy reasons, this signal is **state-driven, not dismissible**: it stays until the draft is accepted or the ticket is marked "not needed" (dismiss ≠ accept). The affordance reads **"Review test doc"** (needs action), distinct from the **"View test doc"** shown for an already-accepted doc.
- On the ticket single (detail) view, a waiting draft shows a **prominent banner at the top** ("Test doc draft ready for review", with a Review & accept action), in addition to the existing "Test doc" meta row.

The auto-trigger scope is the pinned gate; the draft-ready **surfacing** (board line + detail banner) applies to **any** draft, whether it was auto-generated or generated manually — a pending draft is a pending draft, and the acceptance prompt should be uniform. (See Open Questions if this should be narrowed.)

## Current Behaviour

- **Test-doc data & states** — `ticket_metadata` holds `testDoc` (accepted), `testDocUpdatedAt`, `testDocClassification`, and the draft cache `testDocDraft` / `testDocDraftClassification` / `testDocDraftGeneratedAt`. `deriveTestDocState()` (`src/lib/test-doc.ts`) is the single source of truth: `accepted` > `draft` > `not_needed` (`testDocClassification === "not_stakeholder_relevant"`) > `null`.
- **Manual generation** — `POST /api/tickets/[key]/generate-test-doc` gathers title/type/description + all comments + recent status changes, dispatches the `generate-test-doc` VRW skill via `agentFetch`, returns `{ taskId, streamUrl }`, and schedules `after(() => persistTestDocDraftWhenDone(key, taskId))` (`src/lib/test-doc-background.ts`) which polls the workspace task and writes the parsed markdown to `testDocDraft` via `writeTestDocDraft()`. This is the piece the auto-trigger will reuse.
- **Accept** — `PUT /api/tickets/[key]/test-doc` saves the doc to `testDoc`, clears the draft cache, and appends the single `:::expand Test documentation` block to the Jira description (via `upsertLocalEdit` + `pushToJira`). Draft-key guarded (409 on `DRAFT-xxx`).
- **Board status line** — `src/components/sprint-board/StatusChangeLine.tsx`, rendered inside `BoardRow.tsx`. It appears when `listUnseenStatusChanges()` (`src/lib/status-changes-query.ts`) returns a row, from three reasons: a status change, a sprint-add (BRDG-439), or a fresh UAT deploy (BRDG-446). It already receives `testDocState` and `testDocGenerating` props (BRDG-426): for a `TEST`/`DONE` line it shows **"Generate test doc"** when state is `null`, a **"Generating..."** spinner while `testDocGenerating`, and **"View test doc"** for **both** `draft` and `accepted` (line ~237) — so today a waiting draft is not visually distinct from an accepted doc, and it only shows while an *unseen* status/sprint/deploy line exists (a dismissed line takes the affordance with it).
- **Detail view** — `src/components/ticket-detail/TicketMetaContent.tsx` (shared by the full ticket page and the board SidePanel) always renders a "Test doc" meta row (BRDG-468) with states Saved / **Draft pending review** (amber) / Not needed / No doc yet, plus quick actions, hosting its own `TestDocReviewModal`. The draft state is visible but sits low in the meta sidebar, not "above the fold".
- **Pinned sprints** — table `sprintSlot` (`slotIndex` PK 0-7, `sprintId`, `sprintName`); global (single-user app), served by `GET/PUT /api/sprint-slots`. A ticket links to sprints via `ticket.sprintIds` (JSON array). Pinned is currently **UI-only** (hoists groups to the top of the board via `useGroupBy.ts`); nothing on the backend reacts to it yet. Membership check pattern (from `src/app/(app)/inbox/page.tsx`): `ticket.sprintIds?.some(id => pinnedSprintIds.includes(id))`.
- **Status-change detection is split across two paths:**
  - **Jira-origin** (developer moves the ticket, picked up by incremental / sprint / single-ticket sync): `upsertIssue()` (`src/lib/upsert-issue.ts`) compares `existing.status !== ticketData.status`, sets `statusChanged`, inserts a `ticketStatusChange` row (`fromStatus`/`toStatus`), and emits `ticket:changed`. `TEST` is a first-class normalized status (`normalizeStatus` maps IN REVIEW/REVIEW → `TEST`).
  - **Bridge-origin** (PO sets status inside Bridge): `PUT /api/tickets/[key]/status` transitions Jira, then does a **direct `db.update(ticket).set({ status })`** (route line 87) and emits `ticket:changed` — it does **not** call `upsertIssue` and does **not** insert a `ticketStatusChange` row.
  - There is no event-bus side-effect framework reacting to `ticket:changed`; a trigger must be wired explicitly at each detection point.

## Proposed Approach

### 1. Shared auto-trigger helper (backend)

Add `maybeAutoGenerateTestDoc(key)` (co-locate with the generation kickoff, e.g. `src/lib/test-doc-background.ts`). Factor the kickoff currently inline in `generate-test-doc/route.ts` (gather context → `agentFetch` → `persistTestDocDraftWhenDone`) into a shared `kickoffTestDocGeneration(key)` that both the route and the helper call, so there is one generation path.

`maybeAutoGenerateTestDoc(key)` applies all guards and no-ops unless every condition holds:
- `key` is not a `DRAFT-xxx` key (`isDraftKey` from `@/lib/draft-key`).
- The ticket belongs to a **pinned sprint** (`ticket.sprintIds` intersects the `sprintSlot` sprint ids).
- No existing `testDoc` (accepted) and no existing `testDocDraft`, and `testDocClassification !== "not_stakeholder_relevant"` — i.e. `deriveTestDocState() === null`. Never clobber a doc, a draft, or a not-needed marker.
- No generation already in flight for this key (module-level in-flight `Set<string>`, added before kickoff and cleared in `persistTestDocDraftWhenDone`'s `finally`) — belt-and-suspenders against a concurrent double-fire.

Fire it via `after()` from both detection points, only on a transition **into** `TEST`:
- `upsertIssue()` — inside the `statusChanged` block, when `toStatus === "TEST"`.
- `PUT /api/tickets/[key]/status` — after the `db.update`, when `existing.status !== "TEST" && status === "TEST"`.

After the draft lands, reuse the existing board/detail cache invalidation (`revalidateTestDocViews` / `invalidateTestDocCache` in `src/lib/test-doc-prefetch.ts`) so the board picks up the new draft without a hard refresh.

### 2. Persistent draft-ready board line

- `listUnseenStatusChanges()` (`src/lib/status-changes-query.ts`): add a **state-derived** source — board tickets with `testDocDraft IS NOT NULL AND testDoc IS NULL` (i.e. `testDocState === "draft"`) — to the key union, carrying a `testDocReady` marker on `StatusChangeItem`. Because this source has **no seen-key**, a draft ticket appears (and re-appears) regardless of whether its status/sprint/deploy line was dismissed. This is what makes the signal persist until accept/not-needed.
- `StatusChangeLine.tsx`:
  - New branch for a **draft-ready-only** line (no status/sprint/deploy reason): sentence "Test doc draft ready to accept" + a **"Review test doc"** action (opens the review modal via the existing `onViewTestDoc`).
  - Change the `draft` affordance label/emphasis so it reads **"Review test doc"** (distinct from `accepted` → "View test doc"), including when it rides on a real move-to-Test line.
  - Do **not** render the generic dismiss checkmark for a draft-ready-only line (dismiss ≠ accept); the only resolutions are Save (accept) or mark not-needed.
- `useStatusChanges.ts` (`markSeen`): keep marking only the status/sprint/deploy ids seen — never the draft state — so dismissing a status change collapses the sentence but leaves the "draft ready to accept" line standing.

### 3. Prominent detail-view banner

- In `TicketMetaContent.tsx` (shared surface, so it shows on both the full ticket page and the board SidePanel), render a prominent accent callout **at the top** when `testDocState === "draft"`: "Test doc draft ready for review" + a **Review & accept** button opening the existing `TestDocReviewModal`. The existing "Test doc" meta row stays. Reuse the BRDG-468 refresh choreography (pending-edit overlay + cache patch), do not reinvent it.

### Non-goals / out of scope

- No changes to the generation recipe or the VRW skill.
- No "Generating..." intermediate state on the board for the auto-trigger (it needs server-side in-flight state the client doesn't currently have). The board simply shows the draft-ready line once the draft lands. (See Open Questions.)
- No auto-**accept**; acceptance stays a deliberate PO action.
- No test-doc surfaces added to Inbox/Epics/Refinement/Stakeholder (consistent with BRDG-468).

## Open Questions

- **Which pinned sprints arm the auto-trigger?** Default (assumed here): **all** pinned sprints (slots 0-7), matching the PO's "gepinde sprint" wording. If future/backlog/closed pinned sprints should be excluded (only the active pinned sprint arms it), gate on the sprint's `state === "active"` in `maybeAutoGenerateTestDoc`.
- **Should the persistent draft-ready line apply to all drafts or only auto-generated pinned-sprint drafts?** Default (assumed here): **all drafts**, so the acceptance prompt is uniform and a manually generated draft is not silently harder to find. To narrow it to auto-generated pinned-sprint drafts only, the draft source in `listUnseenStatusChanges` would additionally filter on pinned membership.
- **"Generating..." on the board for the auto-trigger?** Deferred. Default: ship the draft-ready line first; add an in-flight indicator later if the wait feels invisible (would require exposing the in-flight `Set`/task state to the board payload).

## Implementation Plan

Grounding facts found in code: (a) the generate route's kickoff is inline in `generate-test-doc/route.ts`; (b) `writeTestDocDraft` only calls `cache.invalidate` — it emits no ticket event, and `test_doc` is NOT in `useStatusChanges` `REVALIDATE_KINDS`, so a server-side draft write produces no client push (the manual flow only refreshes via a client-side poll that the auto path lacks); (c) `upsertIssue` runs a synchronous better-sqlite3 transaction and is also driven by non-request background sync, so `after()` is unsafe there — use a direct fire-and-forget `void`; (d) the draft-ready reason must be a real fourth source in `listUnseenStatusChanges` (a draft-only ticket produces no `StatusChangeItem` today, so the line never renders); (e) `ticketSprint` (indexed bridge, kept in lockstep by `syncTicketSprints`) is the reliable pinned-membership source, joined to `sprintSlot`.

1. **Extract kickoff** — factor the inline kickoff in `generate-test-doc/route.ts` into `kickoffTestDocGeneration(key)` in `src/lib/test-doc-background.ts` (gather context -> `agentFetch` -> returns `{ taskId, streamUrl }`; does NOT schedule persist). Route keeps its own `after(() => persistTestDocDraftWhenDone(...))`; the auto path uses a bare `void persistTestDocDraftWhenDone(...)` (persistent server, may run outside a request scope). (AC 1, 4)
2. **`maybeAutoGenerateTestDoc(key)` + server in-flight `Set`** in `test-doc-background.ts`; no-op unless: `!isDraftKey(key)`, ticket in a pinned sprint (`ticketSprint` innerJoin `sprintSlot`), `deriveTestDocState(meta) === null`, and not already in `inFlight`. Add before kickoff; clear in `persistTestDocDraftWhenDone`'s `finally`. Never throws. (AC 1, 3)
3. **Jira-origin trigger** — in `upsertIssue`, capture `movedToTest` inside the txn (`statusChanged && ticketData.status === "TEST"`), then AFTER commit `void maybeAutoGenerateTestDoc(issue.key)`. (AC 2)
4. **Bridge-origin trigger** — in `PUT /api/tickets/[key]/status`, after the `db.update` and past the `rejected` return, `if (existing.status !== "TEST" && status === "TEST") after(() => maybeAutoGenerateTestDoc(key))` (route is request-scoped). (AC 2)
5. **Live push** — add `emitTicketEvent({ kinds: ["test_doc"] })` to `writeTestDocDraft`; already invalidates caches. (AC 9 server half)
6. **Revalidate kind** — add `"test_doc"` to `REVALIDATE_KINDS` in `useStatusChanges.ts` so the board re-runs the status-changes query on the event. (AC 5, 9 client half)
7. **State-driven source** — in `listUnseenStatusChanges`, add `testDocReady` to `StatusChangeItem`; add a fourth key source: board tickets with `testDocDraft IS NOT NULL AND testDoc IS NULL`; union into `keys`; set `testDocReady` on the item. No seen-key => persists across dismissal. (AC 5, 6, 7)
8. **Board line** — in `StatusChangeLine.tsx`: `draftReadyOnly` branch ("Test doc draft ready to accept"); affordance label split (`draft`/`testDocReady` -> "Review test doc" with needs-action emphasis; `accepted` -> "View test doc"); extend the affordance render guard with `|| change.testDocReady`; suppress the dismiss checkmark when `draftReadyOnly`. (AC 5, 6, 7)
9. **`markSeen`** — verify it only marks status/sprint/deploy ids seen (never the draft); add a test that a combined line collapses to a draft-ready-only line after dismiss. (AC 6)
10. **Detail banner** — in `TicketMetaContent.tsx`, a prominent accent callout at the top when `testDocState === "draft"` with a "Review & accept" button (`setTestDocIntent("view")`); existing meta row stays; reuse the BRDG-468 accept/refresh choreography so both clear without a hard refresh. (AC 8, 9)

Known limitations (accepted, not blocking): the queue is hidden when the board's "updates" toggle is collapsed and is scoped to the currently-viewed sprint's keys; the in-flight `Set` is per-process (a rare cross-instance double-fire is possible on a multi-node deploy — this app is single-node).

## Acceptance Criteria

- [x] When a ticket in a pinned sprint transitions to `TEST`, test-doc generation starts automatically and the result lands as a `draft` in `ticket_metadata`, with no PO click. <!-- maybeAutoGenerateTestDoc via after() in upsertIssue statusChanged block + PUT status route; reuses kickoffTestDocGeneration + persistTestDocDraftWhenDone -->
- [x] The auto-trigger fires for both Jira-origin (sync) and Bridge-origin (PUT status) transitions into `TEST`. <!-- both call sites wired to the shared helper -->
- [x] The auto-trigger never fires for a `DRAFT-xxx` key, a ticket outside every pinned sprint, or a ticket that already has an accepted doc, a draft, or a not-needed marker; and never double-fires while a generation is in flight. <!-- guards in maybeAutoGenerateTestDoc: isDraftKey, pinned sprintIds intersect, deriveTestDocState()===null, in-flight Set -->
- [x] Auto-generation only produces a draft; it never writes to the Jira description on its own (acceptance still does that). <!-- kickoff path stops at writeTestDocDraft; only PUT test-doc writes Jira -->
- [x] On the sprint board, a ticket with a waiting draft shows a "Test doc draft ready to accept" status line with a "Review test doc" action. <!-- StatusChangeLine draft-ready branch + listUnseenStatusChanges state-derived source -->
- [x] That draft-ready signal persists until the draft is accepted or the ticket is marked not-needed; dismissing the status/sprint/deploy line does not remove it, and no generic dismiss checkmark is offered for a draft-only line. <!-- state-derived (no seen-key) source; markSeen untouched for draft; dismiss hidden on draft-only line -->
- [x] The board affordance for a draft ("Review test doc") is visually distinct from an accepted doc ("View test doc"). <!-- StatusChangeLine label/emphasis split by testDocState -->
- [x] On the ticket single (detail) view, a waiting draft shows a prominent banner at the top with a Review & accept action; the existing "Test doc" meta row remains. <!-- TicketMetaContent top callout when testDocState==="draft", opens TestDocReviewModal -->
- [x] Accepting the draft (or marking not-needed) clears both the board draft-ready line and the detail banner without a hard refresh. <!-- revalidateTestDocViews / invalidateTestDocCache + BRDG-468 choreography -->

## Tests

- [x] `maybeAutoGenerateTestDoc` fires the kickoff exactly once for a pinned-sprint ticket entering `TEST`, and no-ops on: non-pinned ticket, existing doc/draft/not-needed, `DRAFT-xxx` key, and a second call while in flight. <!-- src/lib/test-doc-background.test.ts (new) -->
- [x] `PUT /api/tickets/[key]/status` to `TEST` on a pinned ticket schedules the auto-trigger; a non-`TEST` transition does not. <!-- status/route.test.ts -->
- [x] `upsertIssue` schedules the auto-trigger on a Jira-origin transition into `TEST` for a pinned ticket. <!-- upsert-issue.test.ts -->
- [x] `listUnseenStatusChanges` returns a draft-ready item for a `draft`-state ticket with no unseen status/sprint/deploy change, and stops returning it once `testDoc` is set. <!-- status-changes-query.test.ts -->
- [x] `StatusChangeLine` renders the draft-ready-only line ("Review test doc", no dismiss check) and shows a distinct label for draft vs accepted. <!-- StatusChangeLine.test.tsx -->
- [x] `TicketMetaContent` renders the top banner only when `testDocState === "draft"` and opens the review modal from it. <!-- TicketMetaContent.test.tsx -->

## Related

- [[BRDG-426-generate-test-doc]] — the underlying generate/review/accept flow; explicitly deferred "auto-generation on the move-to-Test status change (on demand only)", which this story picks up.
- [[BRDG-468-ticket-detail-test-doc-controls]] — the detail-view test-doc row and refresh choreography this banner builds on.
- [[BRDG-469-board-test-doc-filter]] — board draft/accepted/missing bucketing and coverage badge (another persistent surface for drafts).
- [[BRDG-446]] — the deployAdded status-line reason; pattern for adding a reason to `listUnseenStatusChanges` (though this one is state-derived, not seen-tracked).
- `docs/architecture/optimistic-updates.md`, `docs/architecture/workspace-integration.md` (stakeholder test documentation), `docs/architecture/jira-sync.md`.
