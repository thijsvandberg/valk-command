# BRDG-324: Dedicated search improvements (subtasks, shared filters, ticket pill)

**Status:** To Do
**Priority:** Medium
**Type:** Improvement
**Related:** BRDG-321/322 (board row markers), shared `FilterDropdown` / `IssueTypeIcon` / `TicketStatusPill`

## Problem

The dedicated search (Cmd+Shift+K, `SearchModal.tsx` — not the action/command modal) has drifted
from the Sprint Board. Concretely:

- **Subtasks flood the results.** With no Type filter active, subtasks are indexed and returned
  alongside everything else. A query like "cli test" returns a long list dominated by near-identical
  subtask rows (`Update client`, `remove client`, ...). There is no way to *opt in* to subtasks
  either, because `subtask` is not one of the Type options.
- **Filter dropdowns look different from the board.** Search and the board both reuse
  `FilterDropdown`, but each supplies its own inline `renderOption`. The result: the search **Type**
  dropdown shows plain-text labels (Story, Bug, Task, Spike, Epic), while the board **Type** dropdown
  shows colour-coded labels (Task blue, Spike orange, Story green, Bug red). The search **Status**
  dropdown shows a small colour dot + label; the board shows full `StatusBadge` pills. They should be
  one shared rendering so a change lands everywhere at once.
- **PO Status filter is inconsistent** with the board's Readiness filter.
- **Result rows show a bare key + status badge.** The right side renders the raw `VPL-XXXX` key in
  mono plus a `StatusBadge`. It does not surface issue type or readiness, which the standard ticket
  pill already does elsewhere in the app.

## Goals

1. Exclude subtasks from search results **by default**, but allow searching them via a `Subtask`
   option in the Type filter.
2. Adopt the Sprint Board **Type** filter rendering into search, factored into a **shared component**
   so both stay in sync.
3. Adopt the Sprint Board **Status** filter rendering (badge pills) into search via the same shared
   approach.
4. Align the search **PO Status / Readiness** filter with the board (see Open Questions).
5. Replace the right-hand key + status badge in each result row with the **standard ticket pill**
   (`TicketStatusPill`, `variant="list"`) so issue type and readiness show at a glance.

## Current state (reference)

| Concern | Search | Sprint Board |
|---|---|---|
| Filter bar | `src/components/sprint-board/SearchFilterPanel.tsx` | `src/components/sprint-board/FilterBar.tsx` |
| Type dropdown render | plain label + `IssueTypeIcon` (no colour), opts `story,bug,task,spike,epic` (`SearchFilterPanel.tsx:244-257`) | colour-coded label + centred `IssueTypeIcon` (`FilterBar.tsx:223-239`) |
| Status dropdown render | colour `StatusDot` + label (`SearchFilterPanel.tsx:215-228`) | `StatusBadge` pill, incl. `DELETED` (`FilterBar.tsx:135-155`) |
| PO Status / Readiness | "PO Status", free-text values from `poStatuses`, colour dot (`SearchFilterPanel.tsx:229-243`) | "Readiness", `READINESS_CONFIG` enum + `ReadinessIcon` (`FilterBar.tsx:181-207`) |
| Result row | mono key + `StatusBadge` (`SearchResultParts.tsx:362-377`) | `TicketStatusPill` |
| Subtask handling | indexed & returned; no `subtask` Type option | n/a |

Shared building blocks already in place: `FilterDropdown`, `IssueTypeIcon` + `ISSUE_TYPE_COLORS`,
`StatusBadge`, `ReadinessIcon` + `READINESS_CONFIG`, `TicketStatusPill`.

## Solution

### 1. Subtasks: hidden by default, opt-in via Type

- In the local search engine, **exclude `subtask`** from results unless `subtask` is explicitly
  selected in the Type filter. Engine + index: `src/lib/local-search-engine.ts` (index build
  ~`L91-102`, ticket filter ~`L314-339`). Apply the same default exclusion to the Jira search route
  (`src/app/api/search/jira/route.ts`) so behaviour matches across the Local/Jira toggle.
- Add `subtask` to `TYPE_OPTIONS` / `TYPE_LABEL_MAP` (`SearchFilterPanel.tsx:41-49`) so it appears in
  the dropdown. Selecting it (alone or with others) brings subtasks back in.

### 2. Shared Type filter option renderer

- Extract the board's Type `renderOption` (colour-coded label + centred `IssueTypeIcon`) into a small
  shared component (e.g. `IssueTypeOption` in `src/components/shared/`). Use it in **both**
  `FilterBar.tsx` and `SearchFilterPanel.tsx` so future changes land in one place.

### 3. Shared Status filter option renderer

- Same pattern: extract the board's Status render (`StatusBadge` + `DELETED` handling) into a shared
  `StatusOption` component and use it in both filter bars. Search drops its `StatusDot` variant.

### 4. Switch search PO Status to the board's Readiness model

- **Decided:** replace the free-text "PO Status" filter with the board's **Readiness** filter —
  rename to "Readiness", reuse `READINESS_CONFIG` + `ReadinessIcon`, and filter on the
  `TicketReadiness` enum instead of the free-text PO status custom field. This makes the two filters
  mean the same thing and supplies the `readiness` the result pill needs (#5).
- Requires `readiness` in the search index/result (see #5). The free-text PO status field is no longer
  used as a search filter.

### 5. Standard ticket pill in result rows

- In `LocalResultRow` (`SearchResultParts.tsx:362-377`), replace the mono key + `StatusBadge` with
  `TicketStatusPill` (`variant="list"`, `showKey`, `showStatus`, `showReadiness`, `issueType`).
- Data: `LocalSearchResult` (`local-search-engine.ts:17-37`) already carries `key`, `status`,
  `issueType`, `poStatus` — but **not** the `TicketReadiness` enum the pill expects. Add `readiness`
  to the index/result (also required by #4).
- Keep the sprint-name suffix that currently sits next to the key, or fold it into the pill's hover
  card — confirm placement during build.

## Decisions

1. **PO Status -> Readiness:** search switches from the free-text PO status field to the board's
   `TicketReadiness` enum (decided). See solution #4.
2. **Keep Epic in the Type filter** (decided) — search spans more than the active sprint, so Epic as a
   searchable type stays.

## Scope

- `src/lib/local-search-engine.ts` — default subtask exclusion + opt-in; add `readiness` to result
  (pending Q1).
- `src/app/api/search/jira/route.ts` — matching subtask default for Jira mode.
- `src/components/sprint-board/SearchFilterPanel.tsx` — `subtask` option; use shared Type/Status
  option renderers; replace PO Status with the Readiness filter (`READINESS_CONFIG`).
- `src/components/sprint-board/FilterBar.tsx` — switch to the shared option renderers.
- New shared components in `src/components/shared/` (Type option, Status option).
- `src/components/sprint-board/SearchResultParts.tsx` — `TicketStatusPill` in `LocalResultRow`.

Out of scope: the action/command modal; saved-view behaviour; Jira-side readiness mapping beyond what
the toggle needs.

## Checklist

- [ ] Subtasks excluded by default; `Subtask` Type option brings them back (Local + Jira)
- [ ] Shared Type option renderer used in both `SearchFilterPanel` and `FilterBar`
- [ ] Shared Status option renderer (badge pills) used in both
- [ ] Search "PO Status" replaced with "Readiness" filter (board's enum + icons)
- [ ] Result rows render the standard `TicketStatusPill` (key + issue type + status + readiness)
- [ ] `readiness` added to search index/result if needed for the pill
- [ ] Tests for engine subtask filtering and the shared option components
- [ ] `npm run lint`, `typecheck`, `test`, `build` pass
