# BRDG-337: Schedule a Refinement Session with a Date (name optional)

**Status:** Done (implemented 2026-06-12)
**Priority:** TBD
**Type:** Story
**Builds on:** BRDG-214 (refinement session UX), `CreateSessionModal`, `DateTimePicker`

## Description

As the PO, when I plan a new refinement session I want to be able to set a **date** (via a datepicker) in addition to giving it a **name**, so I can schedule sessions for a specific day rather than only labelling them.

Today the "New refinement session" modal (`CreateSessionModal`) only has a single name field, which is prefilled with today's date as a string. This story splits naming from scheduling:

- **Name** is optional (free text).
- **Date** is optional (datepicker).
- At least **one of the two is required** - you can give just a name, just a date, or both. Submitting with neither is blocked.

The datepicker should also surface **other refinement sessions** that already have a date, shown as a small dot/marker on the relevant calendar days, so the PO has context on what is already planned when picking a date.

## Implementation Plan

Order: schema → migration → api-client types → POST route → PATCH route → label helper → DateTimePicker extension → modal + parent wiring → sorting → label application → tests.

1. **Schema + migration** (`src/db/schema.ts` line ~860): add nullable `scheduledFor: text("scheduled_for")` (stores `"YYYY-MM-DD"`), make `name` nullable. Generate migration via `npm run db:generate` (drizzle-kit, next sequential file in `drizzle/`). Route tests run real migrations via `createTestDb`, so this must land first. Verify the generated SQL preserves existing rows (name NOT NULL drop forces a table rebuild in SQLite).
2. **API client** (`src/lib/api-client.ts` ~line 673/700): `RefinementSessionResponse.name: string | null`, add `scheduledFor: string | null`; extend `create`/`update` payload types.
3. **POST route** (`src/app/api/refinement-sessions/route.ts`): validate `scheduledFor` against `/^\d{4}-\d{2}-\d{2}$/`; drop the `Refinement <date>` name fallback (empty name → null); 400 when both name and date are missing; persist `scheduledFor`.
4. **PATCH route** (`src/app/api/refinement-sessions/[id]/route.ts`): accept `scheduledFor` (same validation, nullable).
5. **Label helper** `sessionLabel({ name, scheduledFor })` in `src/components/refinement-session/refinement-utils.ts`: both → `"{date} - {name}"`, otherwise the filled one. Apply at all render sites: `SavedSessionList.tsx:128`, `RefinementQueuePanel.tsx:62`, `RefinementHistoryList.tsx:71`, `SortableQueueItem.tsx:124`, `AddToRefinementModal.tsx:105`; null-guard `ticketSessionMap` consumers.
6. **DateTimePicker** (`src/components/shared/DateTimePicker.tsx`): add optional `minDate?: string` (disable past days) and `markers?: Record<string, string[]>` (one dot per marked day, `title` + `aria-label` listing session names). Existing consumers unaffected (props optional). Derive today via local-time `fmtDatePart`, not UTC `toISOString` (timezone risk).
7. **CreateSessionModal**: name (optional, no today-prefill) + DateTimePicker (date-only, `minDate` today, `markers`); Create disabled + Enter blocked when both empty with hint "Give it a name or pick a date"; `onCreate({ name?, scheduledFor? })`.
8. **RefinementPageContent**: broaden `handleCreateSession`, build `scheduledDates` memo from loaded sessions (no new endpoint), sort `activeSessions` client-side: dated first ascending by date, undated by `createdAt`.
9. **Tests**: rewrite `CreateSessionModal.test.tsx` (old prefill assertions break); extend `route.test.ts` (round-trip, neither → 400, fallback-name assertions update); `DateTimePicker.test.tsx` (minDate disables past day, marker dot + names); `refinement-utils` label tests; sorting comparator test.

Known risks from planning: PATCH currently rejects empty name (edit UI out of scope, flagged); GET limit 50 bounds the marker data (accepted); rename affordance on date-only sessions opens an empty field (acceptable, session keeps its date).

## Acceptance Criteria

- [x] The create-session modal has two inputs: a name field and a date field (datepicker)
- [x] Name is not required
- [x] Date is not required
- [x] Submitting (Create button + Enter) is blocked when both name and date are empty; the Create button is disabled or shows a clear "give it a name or pick a date" hint
- [x] Submitting works with name only, date only, or both
- [x] Display label: "{date} - {name}" when both are set; only the date or only the name when one is empty
- [x] The datepicker only allows today and future dates (past days disabled)
- [x] The datepicker shows a single dot/marker on days that already have one or more scheduled refinement sessions
- [x] Hovering / focusing a marked day reveals the name(s) of the session(s) on that day
- [x] Multiple sessions on the same day are allowed (still one dot; hover lists them all)
- [x] Sessions with a date sort by date in the session bar; sessions without a date sort by created date
- [x] Existing sessions without a date are unaffected (date is nullable)

## Decisions (refined 2026-06-12)

- **Display label when name is empty:** "{date} - {name}" when both are filled; just the date or just the name when only one is given.
- **Schema:** nullable date-only column (no time). Time can be added later without a breaking change.
- **Sorting / display:** scheduled sessions sort by date; undated sessions fall back to created date.
- **Markers data source:** derive from the session list already loaded on the Refinement page; the modal receives the scheduled dates as a prop. No new endpoint.
- **Past dates:** not allowed; today and future only.
- **Multiple sessions same day:** allowed. One dot per day regardless of count; hover/focus lists the session names.

## Technical Notes

- Modal lives in `src/components/refinement-session/CreateSessionModal.tsx`. It currently calls `onCreate(name: string)`; this signature must broaden to carry the optional date, e.g. `onCreate({ name?: string; scheduledFor?: string })`.
- Wired up in `src/components/refinement-session/RefinementPageContent.tsx` via `handleCreateSession` (line ~337), which calls `refinementSessionsApi.create(...)`.
- Create endpoint: `src/app/api/refinement-sessions/route.ts` (currently accepts `name` + `ticketKeys`, forces `status: "draft"`). Needs to accept and persist the date.
- Schema: `refinementSession` table in `src/db/schema.ts` (line ~860) has no date column today - add a nullable field + migration in `drizzle/`.
- API client: `refinementSessions.create` / `update` in `src/lib/api-client.ts` (around line 700) - extend the typed payload.
- Reuse existing pickers rather than introducing a new calendar library: `src/components/shared/DateTimePicker.tsx`. Confirm whether it supports rendering per-day markers/dots; if not, this is the main net-new UI work.

## Tests

- [x] Create with name only succeeds
- [x] Create with date only succeeds and gets a date-derived label
- [x] Create with both succeeds
- [x] Create with neither is blocked (button disabled / no API call)
- [x] Persisted date round-trips (create then read shows the date)
- [x] Datepicker renders a marker on a day that has an existing scheduled session
- [x] Datepicker blocks selecting a past date
- [x] Sessions sort by date when scheduled, by created date otherwise
- [x] Sessions without a date continue to work (back-compat)

## Dependencies

None blocking. Touches schema (migration), the create modal, the create API, and the datepicker component.
