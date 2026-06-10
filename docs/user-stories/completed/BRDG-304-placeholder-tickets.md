# BRDG-304: Placeholder tickets for forward planning

**Status:** Not Started
**Priority:** Medium
**Type:** Feature

## Description

As a PO planning ahead, I sometimes know more work is coming before any real ticket exists.
I want to drop a **placeholder ticket** into a future sprint or epic purely to mark "there's
more here" — a lightweight stand-in I can flesh out and later **transform into a real
ticket**.

A placeholder:

- **Looks clearly different** from regular tickets (it is provisional, not real work yet).
- **Holds content** — at least a title and a description/notes — so the idea isn't lost.
- **Shows up in sprint overviews and epics** (grouped by sprint), so my forward plan is
  visible in context.
- **Carries BV and an estimate** (the guestimation from [BRDG-303](BRDG-303-forward-planning-guestimation.md),
  since a placeholder has no real SP by definition), so it counts toward the sprint
  fullness meter.
- **Can be toggled on/off** so it isn't always cluttering the board.
- **Can be promoted** into a real ticket when the idea is ready.

This is part of the same forward-planning "pencil" layer as BRDG-303 and should feel
consistent with it.

## Where it lives (recommended — confirm)

Tickets today are strictly 1:1 with Jira: `ticket.jiraKey` is the primary key and the
create endpoint (`src/app/api/tickets/route.ts:202`) always creates the Jira issue first.
A placeholder has no Jira issue yet, so it cannot live in the `ticket` table.

**Recommendation:** placeholders are **Bridge-local only** (their own store) and do **not**
touch Jira until promoted. Promotion is what creates the real Jira issue. This keeps
half-formed ideas out of Jira and makes "transform to real ticket" a deliberate step.

> Open question the PO raised: whether placeholders should hit Jira earlier. Default above
> is Bridge-local-until-promoted; easy to revisit before build.

## Relationship to BRDG-303

- A placeholder has no real SP, so its estimate is the **guestimation** (same Fibonacci
  scale and picker). It also takes a **BV**.
- Placeholders contribute to the **sprint fullness meter** via effective points (their
  guestimation), exactly like un-pointed real tickets do.
- Visibility rides on the same per-view **Planning** toggle: when planning mode is off,
  placeholders are hidden along with the rest of the planning layer. (Could be split into
  its own sub-toggle later if needed.)

## Relationship to the Epic Writer (BRDG-291)

The [Epic Writer](BRDG-291-epic-writer.md) (full plan:
[docs/plans/2026-06-04-epic-writer.md](../plans/2026-06-04-epic-writer.md)) introduces the
**same underlying concept** from a different angle: AI-generated child-story **DRAFT cards**
(`epic_child_draft`) that live locally in Bridge until a per-card **"Create in Jira"**
([BRDG-295](BRDG-295-epic-create-in-jira-linking.md)) promotes them to real issues under the
epic, with sprint placement at/after creation.

That is the same "provisional ticket -> promote to Jira" abstraction this story builds with
`placeholderTicket` + a promote endpoint. The difference is **origin** (manual forward-
planning markers here vs AI breakdown cards there) and **surface** (board/epic rows here vs
the writer canvas there).

If both get built, consider a **shared provisional-ticket model + a single promote-to-Jira
service** (create issue, link to epic, carry content/BV/estimate, set sprint via the existing
`moveToSprint` path) that both features consume, plus shared "provisional" row styling.
Flagged for alignment; not blocking this story.

## Current state (where this plugs in)

- **Ticket schema:** `ticket` table keyed by `jiraKey` (`src/db/schema.ts:42`); no
  "source"/"local"/"placeholder" concept exists. Bridge-private metadata lives in
  `ticketMetadata` (`src/db/schema.ts:85`).
- **Creation:** `POST /api/tickets` (`src/app/api/tickets/route.ts:202`) and the
  epic-child variant (`src/app/api/tickets/[key]/children/route.ts:16`) both create the
  Jira issue immediately, then insert locally with readiness `drafting`. UI via
  `ChildIssueComposer` (used by `SprintBoard.tsx` and `EpicChildrenSection.tsx:160`).
- **Special-row styling precedent:** `BoardRow.tsx` already renders variant states —
  removed-from-Jira at `opacity-50` (`BoardRow.tsx:154,232`) and `DEPRECATED` with metric
  placeholders suppressed (`:158`). This is the pattern to mirror for placeholder styling.
- **Grouped views:** sprint board grouped view (`SprintBoard.tsx`) and epic children grouped
  by sprint (`EpicChildrenBySprint.tsx`) both map ticket lists to rows. Placeholders must be
  merged into those lists.
- **Per-view visibility precedent:** epic children persist a `hide-deprecated` toggle in
  localStorage (`EpicChildrenSection.tsx:114`); inline tag/field visibility is persisted via
  `useColumnConfig.ts`. Same approach for the planning/placeholder toggle.

## Implementation Plan

> Refined 2026-06-09 against current code. Supersedes the original draft: BRDG-323 shipped a
> unified `EstimatePicker` (SP + guestimation in one control); the "used" total for the
> fullness meter is computed **server-side** in `GET /api/sprints/used-points`, not in the
> components; placeholders must route to a dedicated `PlaceholderRow` rather than fake a
> `Ticket`, because `BoardRow` assumes a real Jira key everywhere (prefetch, navigation,
> status pill, assignee/follow/review).

### Core design decision

Placeholders are merged into the grouped views keyed by a `PLH-<uuid>` id, but render through
a **dedicated `PlaceholderRow`** (sprint board) / placeholder branch (epic view), NOT a faked
`Ticket`. `useGroupBy` and dnd are id-agnostic (string keys), so the id flows through grouping
cleanly; routing to a separate component contains all Jira-key assumptions. Placeholders are
**not draggable** in v1 (excluded from SortableContext); sprint is set at create/edit time.

### Data

1. New `placeholder_ticket` table in `src/db/schema.ts` (Bridge-local, no Jira sync, no FK):
   `id` (text PK, `PLH-<uuid>`), `title`, `description` (default ""), `type` (default
   "story"), `sprintId`/`sprintName`, `epicKey`/`epic`, `businessValue` (int 0–7),
   `guestimation` (int in 0,1,2,3,5,8), `status` ("active"|"promoted", default "active"),
   `promotedToKey`, `createdAt`/`updatedAt` (`datetime('now')`). Indexes on sprintId, epicKey,
   status. Run `npm run db:generate` to emit the migration.

### API

2. `src/services/placeholder-service.ts` (validation lives here) + thin routes
   `src/app/api/placeholders/route.ts` (GET list with `?sprintId=`/`?epicKey=` filters,
   default `status=active`; POST create, generates id, requires title) and
   `src/app/api/placeholders/[id]/route.ts` (PATCH partial update with BV/guestimation
   validation; DELETE hard-delete the DB row). Add `placeholders` to `src/lib/api-client.ts`.
   Invalidate `/api/tickets*` and used-points caches on write.
3. **Promote** `src/app/api/placeholders/[id]/promote/route.ts` (POST → `promotePlaceholder`):
   extract the Jira-creating body of `POST /api/tickets` into a shared
   `createTicketWithJira({title, issueType, sprintId, epicKey})` helper and call it from both;
   carry description as a `ticketLocalEdit` (field "description", null baseline), BV +
   guestimation via `updateTicketMetadata(newKey, …)`; mark placeholder
   `status=promoted, promotedToKey=newKey`. Active-only list filter means no duplicate row.

### UI — rendering & distinct look

4. `PlaceholderTicket` type in `src/types/ticket.ts`; `src/hooks/usePlaceholders.ts` (SWR,
   fetch only when `enabled`=planning on, optimistic create/update/remove/promote). Merge into
   `SprintBoard.tsx` (build `placeholdersBySprint`, render in each group) and into
   `EpicChildrenSection.tsx`→`EpicChildrenBySprint.tsx` (adapt to an `EpicChild`-shaped object
   with `isPlaceholder:true`, branch `renderRow`). Both gated on the planning toggle.
5. `src/components/sprint-board/PlaceholderRow.tsx`: dashed/ghosted surface, `Pencil` motif,
   "Placeholder" badge (slate metric tone), NO status pill / assignee / navigation / prefetch.
   Reuse for the epic view.
6. Inline edit on `PlaceholderRow`: editable title + description (popover textarea),
   `BusinessValuePicker` for BV, `EstimatePicker` with `storyPoints={null}` + `planningMode`
   for guestimation (degrades to guess-only). All persist via PATCH.
7. A **Promote / Convert to ticket** overflow action on `PlaceholderRow` → `promote` → mutate
   ticket list + placeholder list.

### UI — visibility toggle + meter

8. Visibility tied to the existing per-view planning toggle (`sprint-board-planning-visible` /
   `epic-children-planning-visible`) via the `usePlaceholders(enabled)` gate. Extend
   `GET /api/sprints/used-points` to also sum `effectivePoints(null, guestimation)` over active
   placeholders per sprint, so the fullness meter matches. Guard `isUnpointedChild` so
   placeholders are not flagged as unpointed.

### Tests

9. `placeholder-service.test.ts` (CRUD validation, promote carries content/BV/guestimation +
   marks promoted, no duplicate), `placeholders` route test (filters, 400 on missing title, id
   format), `PlaceholderRow.test.tsx` (dashed/badge/pencil, BV+guestimation edits, promote
   fires, no status pill/navigation), used-points test (active placeholder counts, promoted
   does not double-count), view-merge test (planning on/off + correct sprint group).

## Requirements

### 1. Create a placeholder
- The PO can create a placeholder in a chosen sprint and/or epic, with at least a title and
  optional description content. Bridge-local; not in Jira.

### 2. Visually distinct
- Placeholders are unmistakably different from real tickets (dashed/ghosted, badge, pencil
  motif), consistent with the BRDG-303 planning look.

### 3. Visible in context
- Placeholders appear in the sprint board grouped by sprint and in the epic view grouped by
  sprint, in the correct sprint group.

### 4. Carries BV + estimate
- A placeholder can take a BV and a guestimation (BRDG-303 scale). The guestimation counts
  toward the sprint fullness meter like any un-pointed ticket.

### 5. Toggle on/off
- Placeholders are hidden unless the view's Planning mode is on.

### 6. Promote to a real ticket
- The PO can transform a placeholder into a real ticket. Promotion creates the Jira issue,
  carries over content/BV/guestimation, and the placeholder is marked promoted (linked to
  the new key). No duplicate is left behind.

## Testing

- Unit: placeholder CRUD + validation; promote carries content/BV/guestimation and links
  the new key.
- Component: placeholder row renders the distinct style; hidden when planning mode off.
- View: placeholders appear in the right sprint group and contribute to the fullness meter.

## Checklist

- [x] `placeholderTicket` table (Bridge-local) + migration (`0074`)
- [x] CRUD API for placeholders (create/update/list/delete) + `placeholder-service`
- [x] Promote endpoint: create real ticket, carry content/BV/guestimation, mark promoted
- [x] Merge placeholders into sprint-board and epic-by-sprint grouped views
- [x] Distinct placeholder styling (dashed/ghosted + badge + pencil motif) — `PlaceholderRow`
- [x] Inline edit of content, BV, and guestimation on a placeholder
- [x] Visibility tied to BRDG-303 per-view Planning toggle
- [x] Promote / Convert-to-ticket action in the UI (+ Add placeholder + delete)
- [x] Tests for all of the above
- [x] Update relevant docs in `/docs`

### Notes / known limitations

- The sprint board's grouped (All) view seeds an empty group for a future sprint that has
  only placeholders, so a placeholder always surfaces there and in the flat single-sprint
  view. The **epic-by-sprint** view groups by the epic's children, so a placeholder added to
  a sprint with no epic children does not create a group there (it is still visible on the
  sprint board); a child in that sprint makes the group and its placeholders appear.
- Placeholders are intentionally **not draggable** in v1; sprint is set at create/edit time.
- A promoted placeholder's description is carried as a **pending local edit** on the new
  ticket (pushable to Jira), not auto-pushed.

### Post-review refinement (PO feedback, 2026-06-10)

- **Create via the regular composer.** Placeholders are no longer created from a separate
  "Add placeholder" row. The shared `ChildIssueComposer` gained a "Placeholder" option in its
  type dropdown (dashed pencil chip, "Create placeholder in …" hint); selecting it routes the
  same create flow to a Bridge-local placeholder. Wired on the sprint board (flat + per-group)
  and the epic-by-sprint per-group composers, gated to planning mode.
- **Polished row.** The row's actions are spelled out exactly like the subtask rows:
  **Convert to ticket / Edit / Delete** (Delete reddens on hover), replacing the bare icons.
- **Convert icon** is `SquareArrowUpRight` (was the AI `Sparkles`).

### Post-review refinement, pass 2 (PO feedback, 2026-06-10)

- **Row reads like a real ticket row.** Dropped the big "Placeholder" badge; the row now
  leads with the ticket pill format adapted for a placeholder: a **dashed icon**
  (`SquareDashed`) + a small slate **"Placeholder" pill** (in place of the issue-type icon +
  status pill).
- **SP/BV follow the story-row logic.** A set guess/BV renders inline; an empty one is hidden
  and only **reveals on row hover** (`HoverRevealSlot`), exactly like a real story row.
- **Actions overlay the content on hover** (gradient fade), like the subtask rows; the SP/BV
  cluster stays reachable on top (`z-20`).
- The dev exploration preview page was removed once the direction was chosen.
```
