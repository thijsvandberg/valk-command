# BRDG-307: Create an epic from the Epics page

**Status:** Done
**Priority:** Medium

## Description

As a PO, I want a **Create** button on the `/epics` page that opens a small modal where I enter a
title (required) and an optional description. On create, the epic is made in Jira and I am taken
straight to the epic's single view, where I can flesh out the description or open the Epic Writer
to work it out further.

This keeps epic creation in the place where epics live (the Epics page), instead of squeezing it
into the sprint-board create row. Creating the epic is a lightweight act: make it exist, then land
the PO on the epic so the next step (describe it / run the writer) is one click away.

> Supersedes the earlier idea in this story of adding "Epic" to the sprint-board create dropdown.
> That approach was dropped because an epic never appears as a board row (the board GET filters
> epics out), so creating one there is a dead end. Creation now lives on `/epics`.

## Current behaviour

- `/epics` (`src/app/(app)/epics/page.tsx`) lists epics via `useEpicProgress`. Its header
  (`ViewHeader`) has no create affordance.
- The only single-epic destinations today are `/tickets/[key]` (the epic's detail view, where its
  description is edited; `EpicRow` links the epic key here) and `/epics/[key]/write` (the Epic
  Writer / epic mode of the story writer, reached via "Work out Epic").
- `jiraClient.createIssue({ summary, issueType, projectKey, description? })` already supports an
  optional ADF `description`. There is no create-epic API endpoint yet; `POST /api/tickets` is
  board-oriented and deliberately excludes the Epic type.

## Behaviour

### Create button + modal

- Add a **Create epic** button to the `/epics` page header (`ViewHeader`), styled with the brand
  treatment (not default Tailwind blue/indigo), with hover/focus-visible/active states.
- Clicking it opens a modal with:
  - **Title** — required text input, autofocused. Create is disabled until non-empty.
  - **Description** — optional multi-line input.
- Enter (or a Create button) submits; Escape / backdrop / cancel closes. Show a busy state while
  the create is in flight; surface a clear error if it fails (reuse the shared toast).

### Creating the epic

- On submit, create a Jira issue of type **Epic** with the title as summary and, when provided,
  the optional description.
- The description is entered as plain text / markdown and must be converted to ADF before sending
  (reuse the existing markdown-to-ADF conversion, same path the story editor uses on write).
- An epic has no sprint and no epic parent: never send `sprintId` or `parentKey`.
- Persist a local epic row so the new epic resolves immediately on the next screen and on `/epics`
  before the next Jira sync, and invalidate the epic caches.

### Redirect to the epic single view

- On success, redirect to the epic's single view: `/tickets/[newKey]`.
- That view already lets the PO edit the description. From there the PO can open the Epic Writer
  (`/epics/[key]/write`) to work the epic out. If a launch into the Epic Writer is not already
  reachable from the epic's single view, that link/affordance is in scope to add; the full epic
  mode / breakdown itself is not (it already exists, BRDG-291..296).

## Implementation Plan

Derived from an Opus planning pass over the relevant files.

### Grounded facts
- `jiraClient.createIssue` (`src/lib/jira-client.ts`) already takes `{ summary, description?, issueType?, projectKey?, sprintId?, parentKey? }`, spreads `description` only when truthy, and omits sprint/parent when not passed. `description` must be ADF.
- `markdownToAdf` from `@/lib/markdown-to-adf` is the established description→ADF helper (already used in `src/app/api/epics/[key]/writer/create-in-jira/route.ts`). Skip when blank.
- `GET /api/epics` (`src/app/api/epics/route.ts`) caches under key `/api/epics`. The POST lives in the same file. `cache.invalidate("/api/epics")` prefix-clears both `/api/epics` and `/api/epics/progress`.
- Ticket insert (mirror `POST /api/tickets`): required `jiraKey`, `title`, `status`; set `type: "epic"`, `status: "TO DO"`, `jiraId`, `flagged: false`. No sprint/epic fields.
- The `/epics` list renders from `useEpicProgress()` (`/api/epics/progress`), so client refresh is `mutate("/api/epics/progress")`.
- Single view (`tickets/[key]/page.tsx`) hard-codes the writer link to `/tickets/[key]/write` even for epics; needs an epic-scoped branch to `/epics/[key]/write`.

### Steps
1. **`POST /api/epics`** (add to `src/app/api/epics/route.ts`): body `{ title, description? }`; trim+validate title (400 if empty); `createIssue({ summary, issueType: "Epic", projectKey: env.JIRA_PROJECT_KEY, ...(desc ? { description: markdownToAdf(desc) } : {}) })` in try/catch (502 on Jira fail); insert local `type: "epic"` row; `cache.invalidate("/api/epics")`; `logActivity`; return `{ key }`.
2. **`epics.create`** in `src/lib/api-client.ts`: `apiFetch<{ key: string }>("/api/epics", { method: "POST", body: data, signal })`.
3. **`CreateEpicModal`** (`src/app/(app)/epics/CreateEpicModal.tsx`): follow `CreateSprintModal` idiom (shared `Modal` = Escape/backdrop/focus-trap, `creating`/`error` state, inline error keeps modal open). Required title input (autofocus, Enter submits), optional description textarea. Create disabled until title non-empty. On success: toast, `mutate("/api/epics/progress")`, `router.push("/tickets/" + key)`. On error: inline error, stay open.
4. **Wire button into `src/app/(app)/epics/page.tsx`**: brand-styled Create epic button in header; mount modal + `useToast`/`Toast`.
5. **Epic Writer affordance** in `src/app/(app)/tickets/[key]/page.tsx`: branch the writer href to `/epics/[key]/write` when `ticket.type === "epic"`. Description editing already works for epics (no change).

### Tests
- `src/app/api/epics/route.test.ts`: Epic type sent, no sprintId/parentKey, description→ADF (doc node) when given / absent when blank, local row inserted, returns `{ key }`, 400 on empty title, 502 on Jira failure.
- `src/app/(app)/epics/CreateEpicModal.test.tsx`: empty title disables Create; success pushes `/tickets/[key]`; rejection keeps modal open + shows error.

### Risks
- A brand-new childless epic may not appear in the default `/epics` list (progress route surfaces recent-activity epics); redirect to the single view still works. Verify, flag if it stays hidden.
- Keep the epic writer CTA simple (always link `/epics/[key]/write`); confirm session-aware block isn't story-mode-specific.

## Acceptance Criteria

- [x] The `/epics` page header has a Create epic button (brand-styled, with hover/focus/active states)
- [x] Clicking it opens a modal with a required title and an optional description
- [x] Create is disabled until the title is non-empty; Escape/cancel/backdrop closes the modal
- [x] Submitting creates a Jira issue of type Epic with the title, and the description when given
- [x] The optional description is stored as ADF (converted from the entered text), not raw text
- [x] No `sprintId` and no `parentKey` are sent for an epic create
- [x] A local epic row is persisted and the epic caches are invalidated so the new epic shows on `/epics`
- [x] On success the PO is redirected to the epic single view (`/tickets/[newKey]`)
- [x] From the epic single view the PO can edit the description and open the Epic Writer
- [x] A failed create shows an error and keeps the modal open (no broken redirect)
- [x] Tests cover: the create endpoint (Epic type, description-to-ADF, no sprint/parent),
      modal validation (empty title blocks create), and the redirect target

## Technical Notes

- **API:** add a dedicated `POST /api/epics` (alongside the existing `GET /api/epics`) that takes
  `{ title, description? }`, calls `jiraClient.createIssue({ summary: title, issueType: "Epic",
  projectKey: env.JIRA_PROJECT_KEY, description? })`, inserts a local `ticket` row
  (`type: "epic"`, `status: "TO DO"`), invalidates `/api/epics` and `/api/epics/progress`, and
  returns `{ key }`. A dedicated endpoint keeps epics out of the board-oriented `POST /api/tickets`.
- **Description → ADF:** reuse the existing markdown-to-ADF helper used on story write (see
  BRDG-268 work) so the optional description renders correctly in Jira. Skip the field entirely
  when blank.
- **Modal:** new `CreateEpicModal` under `src/app/(app)/epics/`, opened from the page header.
  Follow the existing modal idiom (e.g. `CreateSprintModal`) for layout, busy state, and toasts.
- **Redirect:** on success use the client router to push `/tickets/[newKey]`.
- **Epic Writer launch from the single view:** confirm `/tickets/[key]` exposes a way to open
  `/epics/[key]/write` for an epic; add the affordance if missing (small, scoped to epics).

## Out of Scope

- Adding "Epic" to the sprint-board create dropdown (the original approach, now dropped).
- Epic breakdown / child-story generation / AI assistance on the new epic (the Epic Writer's job).
- Assigning team, colour, sprint, or other epic metadata at create time (done later on the epic).
- Any change to how epics are listed or progress is computed on `/epics`.
