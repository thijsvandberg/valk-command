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

### Data

1. New `placeholderTicket` table (Bridge-local; no Jira sync), e.g.:
   - local id (e.g. `PLH-<uuid>`), `title`, `description` (content), `type`
     (default Story), `sprintId`/`sprintName`, `epicKey`,
   - `businessValue`, `guestimation` (the BRDG-303 estimate),
   - lifecycle (`active` | `promoted`), `promotedToKey` (Jira key once promoted),
   - `createdAt`/`updatedAt`. Migration in `drizzle/`.

### API

2. CRUD endpoints for placeholders (create, update content/BV/guestimation/sprint/epic,
   delete-to-`deleted/` per repo convention, list by sprint/epic).
3. **Promote** endpoint: create the real Jira ticket via the existing creation path
   (title, type, sprintId, epicKey), carry over the description (push as local edits), BV
   (→ `ticketMetadata`), and guestimation (→ the new ticket's guestimation, since it has no
   SP yet), then mark the placeholder `promoted` with `promotedToKey`. The row thereafter
   renders as the real ticket.

### UI — rendering & distinct look

4. Merge active placeholders into the row lists in the sprint board grouped view and the
   epic-children-by-sprint view.
5. Distinct placeholder styling, consistent with BRDG-303's "pencil/provisional" motif:
   dashed/outline row, muted/ghosted surface, a clear "Placeholder" badge and pencil-family
   icon — unmistakably not a real ticket. Mirror the `BoardRow` variant-state approach.
6. Allow editing content (title + description), BV, and guestimation inline / in a light
   editor. A placeholder has no real SP field and no Jira-only controls (status workflow,
   assignee push, etc.).
7. A **Promote / Convert to ticket** action on the placeholder.

### UI — visibility toggle

8. Placeholders are shown only when the view's Planning mode (BRDG-303) is on. When off,
   they are hidden everywhere.

### Tests

9. Cover: placeholder CRUD + validation; placeholders appear only in grouped views with
   planning on; distinct styling renders; BV + guestimation editable and counted in the
   fullness meter; promote creates a real ticket carrying content/BV/guestimation and marks
   the placeholder promoted.

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

- [ ] `placeholderTicket` table (Bridge-local) + migration
- [ ] CRUD API for placeholders (create/update/list/delete-to-`deleted/`)
- [ ] Promote endpoint: create real ticket, carry content/BV/guestimation, mark promoted
- [ ] Merge placeholders into sprint-board and epic-by-sprint grouped views
- [ ] Distinct placeholder styling (dashed/ghosted + badge + pencil motif)
- [ ] Inline edit of content, BV, and guestimation on a placeholder
- [ ] Visibility tied to BRDG-303 per-view Planning toggle
- [ ] Promote / Convert-to-ticket action in the UI
- [ ] Tests for all of the above
- [ ] Update relevant docs in `/docs`
```
