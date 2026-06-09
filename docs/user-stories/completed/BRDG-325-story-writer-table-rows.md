# BRDG-325: Story Writer landing as the regular ticket table

**Status:** Done
**Priority:** Medium
**Type:** Improvement
**Related:** BRDG-239 (headerless board rows), BRDG-310 (empty SP/BV hover reveal), BRDG-323 (unified estimate picker), [[project_ticketrow_phaseout]] (target BoardRow, not TicketRow)

## Description

The Story Writer landing page (`/story-writer`) currently shows active draft sessions as a
two-column grid of bespoke `SessionCard`s. Every other ticket list in the app (sprint board) uses the
shared `BoardRow` table row, so the draft list looks and behaves differently from everywhere else.

Convert the landing page to render its active sessions through the **regular ticket table** — the real
`BoardRow` component — while keeping the **session-specific data** the cards carry today (relative
time, "Jira changed" warning, split source/target). The result is one consistent ticket row across the
app, with the Story Writer list reusing the same status pill, title, epic chip, sprint chip, and the
live inline pickers (status / readiness / Story Points / Business Value / assignee / epic).

## Behaviour

### Layout

- The 2-column `SessionCard` grid is replaced by a **single-column table** of `BoardRow`s inside a
  `Card` surface, mirroring the sprint board (`<table className="w-full table-fixed border-collapse">`
  + `<tbody>`, one `BoardRow` per session).
- The "N active sessions" count and the "New story" button in the header are unchanged. The empty state
  ("No active sessions") is unchanged.

### Each row reuses the real `BoardRow`

- Renders the standard ticket row: issue-type icon + status pill, title with the hover edit pencil,
  set epic chip, sprint chip, and the inline meta pickers. Empty planning fields (SP / BV / Add epic)
  follow the standard BRDG-310 hover-reveal behaviour.
- The inline pickers are **live** — changing status / readiness / Story Points / Business Value /
  assignee / epic writes through to Jira exactly as on the sprint board (same handlers).
- **Removed-from-Jira sessions are not struck through.** Drop the old `DELETED` strikethrough
  treatment — just show the normal ticket pill (do not pass the row's `removed` flag into `BoardRow`).

### Row interactions

- **Click the row → Resume** the draft (navigate to `/tickets/{ticketKey}/write`). This replaces
  `BoardRow`'s default click-to-select-sidebar behaviour on this page; the explicit "Resume" button
  from the card is removed.
- **Discard** moves to a **hover-revealed trash icon** at the right end of the row (instead of the
  always-visible trash button on the card). Clicking it still opens the existing
  "Discard session?" `ConfirmDialog`. Clicks on the trash (and on any inline picker) must not also
  trigger the row's Resume navigation.

### Session-only signals to keep

These have no equivalent on a normal board row, so they are added as opt-in row decorations (inert on
the sprint board):

- **Relative time** — `6h ago / 1d ago` last-updated chip.
- **"Jira changed" warning** — amber badge when `jiraUpdatedAt > updatedAt`.
- **Split indicator** — scissors + "Split" badge and the dual source/target title for split sessions
  (`targetTicketKey` set).

## Implementation

- **`src/app/(app)/story-writer/page.tsx`:** delete `SessionCard`; render the sessions through a table
  of `BoardRow`s. Map each `ActiveSession` → a `Ticket` shape for `BoardRow` (`ticketKey → key`,
  `status → jiraStatus`, `issueType → type`, plus `readiness`, `epic`, `epicKey`, `sprintId`). Wire the
  existing live picker handlers (the same ones the sprint board uses) so inline edits write to Jira.
  Override the row click to Resume; keep `cmd/ctrl-click → open ticket in new tab` if cheap.
- **`/api/story-writer/active-sessions`:** the row needs the fields `BoardRow` displays. Extend the
  endpoint (and the `ActiveSession` type) to also return `storyPoints`, `businessValue`, `assignee`,
  `flagged`, `qualityScore`, `notes`, and subtask counts, so the row renders accurately instead of
  showing every planning field as empty. (If a field is genuinely absent for drafts, it falls back to
  the standard empty hover-placeholder.)
- **`src/components/sprint-board/BoardRow.tsx`:** add a small **optional** "session context" prop
  bundle so the landing list can inject what a board row lacks — a relative-time chip, the
  "Jira changed" badge, the split badge + secondary title, and a trailing hover-revealed discard
  action. All opt-in; when the props are absent the component renders exactly as it does on the board.
- Reuse `formatTimeAgo` / `hasJiraChanges` from the current page; keep the `ConfirmDialog` and
  `StoryWriterLauncherModal` wiring unchanged.

## Implementation Plan

**Core strategy.** Drive the landing page from `useSWR<Ticket[]>` whose fetcher maps the
`ActiveSession[]` payload into a `SessionTicket` (a `Ticket` extended with the session-only fields
`sessionId / sessionUpdatedAt / sessionJiraUpdatedAt / targetTicketKey / targetTitle`). This lets the
real `useTicketActions` hook drive every live picker unchanged. The SWR key and `useTicketActions`'
`activeListKey` MUST be the same constant string, because `saveTicketMetadata` / `saveStoryPoints`
optimistically `globalMutate(activeListKey, (Ticket[]) => …)`. The `SessionTicket` extends `Ticket`, so
every optimistic spread (`{...t, storyPoints}` etc.) preserves the session fields, and revalidation
re-maps fresh `SessionTicket`s — no parallel map needed.

1. **API + shared type (AC3).** Move `ActiveSession` out of `route.ts` into `src/types/story-writer.ts`
   (route.ts must export handlers only); the route `import type`s it. Add `formatTimeAgo` /
   `hasJiraChanges` and the pure `sessionToSessionTicket(session)` mapper there too (unit-testable).
   Extend the GET select with `storyPoints`, `flagged`, `assignee` (built to `{name,initials,color}`),
   `businessValue`, `qualityScore`, `guestimation`, `poNotes`, and an `openSubtaskCount` /
   `totalSubtaskCount` group-by over `ticketSubtask` (mirror `tickets/route.ts`). `sprintName` (the
   Jira sprint id) maps to `Ticket.sprintId`.
2. **BoardRow optional props (AC4/AC5/AC6/AC8).** Add inert-when-absent props: `onActivate?(key)`
   (row click → resume; falls back to `onSelectTicket` when absent, keeps cmd/ctrl new-tab),
   `onDiscard?(key)` (hover-revealed trailing trash, stopPropagation), `sessionTimeAgo?`,
   `sessionJiraChanged?`, `splitTarget?` (string ⇒ render Scissors+"Split" chip and a muted secondary
   target line; undefined ⇒ board layout unchanged). AC6 is satisfied by the mapper **omitting**
   `removedFromJiraAt`, so `isRemoved` is always false → normal pill, no strikethrough.
3. **Page rewrite (AC1/AC2/AC7).** Delete `SessionCard` + grid. Render a `Card` wrapping
   `<table className="w-full table-fixed border-collapse text-body-lg"><tbody>` of plain `BoardRow`s
   (no Sortable/DnD/virtualizer; `isChecked/someChecked/isDragActive=false`, no-op checkbox/select).
   Wire `useTicketActions` `handle*` + `readinessMap` + `syncFromApiTickets`, `sprints`/`sprintNameMap`
   from `useJiraSprints`, `showSprint`, and the session props per row (cast `ticket as SessionTicket`).
   Keep the count, "New story" button, launcher, `EmptyState`, and discard `ConfirmDialog` (keyed by
   ticketKey → sessionId via the mapped row).
4. **Tests (AC9).** Extend `active-sessions/route.test.ts` (new fields + subtask counts; add a
   `seedTicketSubtask` builder). Extend `BoardRow.test.tsx` (session badges present/absent, resume on
   click vs select, trash + picker stopPropagation, no removed treatment). Add `page.test.tsx` (mapping
   via `sessionToSessionTicket`, count/empty state, resume push, discard → DELETE + mutate).

**Order:** API+type → BoardRow props → page → tests. **Risks:** keep SWR key == `activeListKey`;
`sprintName` is a sprint id; do not pass `removedFromJiraAt`; render plain `BoardRow` (no Sortable).

## Acceptance Criteria

- [x] `/story-writer` shows active sessions as a single-column ticket table using the real `BoardRow`,
      not the old card grid.
- [x] The row shows the standard status pill, title (with edit pencil), epic chip, and sprint chip, and
      the inline status / readiness / SP / BV / assignee / epic pickers write live to Jira.
- [x] Clicking a row resumes the draft (`/tickets/{key}/write`); the standalone "Resume" button is gone.
- [x] Discard is a hover-revealed trash at the right that opens the existing confirm dialog; picker and
      trash clicks do not resume the row.
- [x] Relative time, the "Jira changed" amber badge, and the split badge + source/target title still
      appear on the relevant rows.
- [x] Removed-from-Jira sessions render with a normal ticket pill (no strikethrough/DELETED state).
- [x] The "N active sessions" count, "New story" button, and empty state are unchanged.
- [x] The added `BoardRow` session-context props are inert on the sprint board (no visual change there).
- [x] Tests cover the session → row mapping, the Resume-on-click and discard interactions, and the
      session-only badges (time / Jira changed / split).

## Notes

- Target `BoardRow`, never the deprecated dense `TicketRow` ([[project_ticketrow_phaseout]]).
- The landing page is line-less and airier (BRDG-239) — keep that rhythm; do not reintroduce row
  separators or column headers.
