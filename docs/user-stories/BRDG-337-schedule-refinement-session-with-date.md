# BRDG-337: Schedule a Refinement Session with a Date (name optional)

**Status:** Draft
**Priority:** TBD
**Type:** Story
**Builds on:** BRDG-214 (refinement session UX), `CreateSessionModal`, `DateTimePicker`

> Draft story. Scope is sketched but not yet refined. Details to be discussed before any implementation.

## Description

As the PO, when I plan a new refinement session I want to be able to set a **date** (via a datepicker) in addition to giving it a **name**, so I can schedule sessions for a specific day rather than only labelling them.

Today the "New refinement session" modal (`CreateSessionModal`) only has a single name field, which is prefilled with today's date as a string. This story splits naming from scheduling:

- **Name** is optional (free text).
- **Date** is optional (datepicker).
- At least **one of the two is required** - you can give just a name, just a date, or both. Submitting with neither is blocked.

The datepicker should also surface **other refinement sessions** that already have a date, shown as a small dot/marker on the relevant calendar days, so the PO has context on what is already planned when picking a date.

## Acceptance Criteria (draft - to refine)

- [ ] The create-session modal has two inputs: a name field and a date field (datepicker)
- [ ] Name is not required
- [ ] Date is not required
- [ ] Submitting (Create button + Enter) is blocked when both name and date are empty; the Create button is disabled or shows a clear "give it a name or pick a date" hint
- [ ] Submitting works with name only, date only, or both
- [ ] When only a date is given (no name), the session still gets a sensible display label derived from the date
- [ ] The datepicker shows a dot/marker on days that already have one or more scheduled refinement sessions
- [ ] Hovering / focusing a marked day optionally reveals which session(s) are on that day (nice-to-have, to confirm)
- [ ] Existing sessions without a date are unaffected (date is nullable)

## Open questions (discuss before build)

- **Display label when name is empty:** what format? (e.g. "Refinement - 2026-06-18", or just the date.) Current code falls back to `today` for an empty name.
- **Schema:** add a nullable `scheduledFor` (date) column to `refinement_session`? Date-only or date+time? `DateTimePicker` exists and supports time - do we want time here, or date-only?
- **Sorting / display:** should scheduled sessions sort by date in the session bar, and should the date be shown on the session chip/row?
- **Markers data source:** the picker needs the set of dates that already have sessions. Fetch all sessions' dates on modal open, or expose a lightweight "scheduled dates" endpoint?
- **Past dates:** allow scheduling in the past, or restrict to today onward?
- **Multiple sessions same day:** single dot, or a count/intensity? Do we cap what the hover reveals?

## Technical Notes

- Modal lives in `src/components/refinement-session/CreateSessionModal.tsx`. It currently calls `onCreate(name: string)`; this signature must broaden to carry the optional date, e.g. `onCreate({ name?: string; scheduledFor?: string })`.
- Wired up in `src/components/refinement-session/RefinementPageContent.tsx` via `handleCreateSession` (line ~337), which calls `refinementSessionsApi.create(...)`.
- Create endpoint: `src/app/api/refinement-sessions/route.ts` (currently accepts `name` + `ticketKeys`, forces `status: "draft"`). Needs to accept and persist the date.
- Schema: `refinementSession` table in `src/db/schema.ts` (line ~860) has no date column today - add a nullable field + migration in `drizzle/`.
- API client: `refinementSessions.create` / `update` in `src/lib/api-client.ts` (around line 700) - extend the typed payload.
- Reuse existing pickers rather than introducing a new calendar library: `src/components/shared/DateTimePicker.tsx`. Confirm whether it supports rendering per-day markers/dots; if not, this is the main net-new UI work.

## Tests

- [ ] Create with name only succeeds
- [ ] Create with date only succeeds and gets a date-derived label
- [ ] Create with both succeeds
- [ ] Create with neither is blocked (button disabled / no API call)
- [ ] Persisted date round-trips (create then read shows the date)
- [ ] Datepicker renders a marker on a day that has an existing scheduled session
- [ ] Sessions without a date continue to work (back-compat)

## Dependencies

None blocking. Touches schema (migration), the create modal, the create API, and the datepicker component.
