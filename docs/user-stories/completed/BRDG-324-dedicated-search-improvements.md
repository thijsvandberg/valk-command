# BRDG-324: Dedicated search improvements (subtasks, shared filters, ticket pill)

**Status:** Done
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

## Implementation Plan

### Phase A — Data layer: add `readiness` to the index and result (FIRST; unblocks #4/#5)

1. `src/lib/search-index-cache.ts` — add `readiness: string | null` to the `TicketDetail` interface.
2. `src/lib/local-search-engine.ts` — populate readiness end-to-end:
   - `buildIndex()` ticketDetails builder: add `readiness: meta?.readiness ?? null`.
   - `LocalSearchResult` interface: add `readiness: TicketReadiness | null` (import `TicketReadiness`).
   - Mapped result loop: `readiness: (detail?.readiness as TicketReadiness | null) ?? null`.

### Phase B — Engine filtering: subtasks + readiness

3. `SearchParams`: add `readinessFilter: string[]`. Keep `poStatusFilter` for back-compat.
4. Default subtask exclusion + opt-in. Normalize Jira type string robustly:
   `const norm = (t) => t ? t.toLowerCase().replace(/[\s-]/g, "") : null;` (handles "Sub-task"/"Subtask").
   - Type membership check uses normalized type.
   - Guard regardless of typeFilter: `if (!typeFilter.includes("subtask") && norm(r.issueType) === "subtask") return false;`
5. Readiness filter mirroring board semantics: `cur === null ? readinessFilter.includes("none") : readinessFilter.includes(cur)`. Add to `hasFilters` (fuse limit).

### Phase C — Routes

6. `src/app/api/search/local/route.ts` — parse `readiness` param, pass `readinessFilter`. Keep `poStatus` parse for back-compat.
7. `src/app/api/search/jira/route.ts` — default JQL path: append `issuetype != subtask` when no `issuetype` param and no jqlOverride. (Known limitation: Jira mode has no filter UI, so the opt-in is Local-only.)

### Phase D — Shared option-renderer components

8. New `src/components/shared/IssueTypeOption.tsx` — `{ value }` → ISSUE_TYPE_COLORS color + centered IssueTypeIcon (15/2) + capitalized label.
9. New `src/components/shared/StatusOption.tsx` — `{ value }` → DELETED rose/strikethrough branch + StatusBadge else.
10. New `src/components/shared/ReadinessOption.tsx` — `{ value }` → "none" → dot + "Ready for Development"; else ReadinessIcon + READINESS_CONFIG label.
11. `FilterBar.tsx` — replace inline Status/Type/Readiness renderOption bodies with the shared components (keeps board+search in sync).

### Phase E — SearchFilterPanel: poStatus → readiness, Subtask, shared renderers

12. `SearchFilterPanel.tsx`: rename `poStatus` → `readiness` across `SearchFilters`, `EMPTY_FILTERS`, `hasActiveFilters`, `SerializedSearchFilters`, `serializeFilters`, `deserializeFilters` (back-compat: accept optional legacy `poStatus`, drop it — semantics differ), `filtersToParams` (emit `readiness`). Add `subtask` to TYPE_OPTIONS/TYPE_LABEL_MAP. Use shared Status/Type/Readiness option renderers. Replace PO Status dropdown with a Readiness dropdown (`READINESS_OPTIONS.map(o => o.value ?? "none")`).
13. `useSavedSearches.test.ts` — fixtures `poStatus: []` → `readiness: []`; add one legacy-`poStatus` fixture to assert no-throw deserialize.

### Phase F — Result row pill

14. `SearchResultParts.tsx` `LocalResultRow` — replace mono key + StatusBadge with `<TicketStatusPill variant="list" ticketKey readiness issueType showKey={showKey} showStatus showReadiness />`. Map status: `removedFromJira={status.toUpperCase()==="DELETED"}`, else `jiraStatus={status.toUpperCase() as JiraStatus}`. Keep sprint-name suffix. Keep `StatusBadge` (still used by JiraResultRow/PreviewPane).

### Phase G — Tests + gates

15. `local-search-engine.test.ts` — add `readinessFilter: []` to `defaultParams`; tests for subtask default-exclude, `["subtask"]` opt-in, `["story"]` still excludes subtasks, readiness `["on_hold"]` and `["none"]`.
16. New component tests for IssueTypeOption / StatusOption / ReadinessOption.
17. Gates: lint, typecheck, test, build.

### Risks / notes

- Subtask type string unverified → normalized comparison, no hard-coded "Sub-task".
- Saved searches persist `poStatus` in localStorage → back-compat deserialize must not throw; legacy values dropped, not migrated.
- Jira opt-in not wired (no Jira filter UI); default Jira search always excludes subtasks.
- `result.status` casing/DELETED handled defensively via `.toUpperCase()` + `removedFromJira`.
- `poStatuses` in `FilterOptionsData` becomes unused by the panel; keep the field to avoid route churn (optional follow-up cleanup).

## Checklist

- [x] Subtasks excluded by default; `Subtask` Type option brings them back (Local + Jira) <!-- Jira opt-in is exclusion-only: Jira mode has no filter panel, so the Subtask toggle is Local-only -->
- [x] Shared Type option renderer used in both `SearchFilterPanel` and `FilterBar`
- [x] Shared Status option renderer (badge pills) used in both
- [x] Search "PO Status" replaced with "Readiness" filter (board's enum + icons)
- [x] Result rows render the standard `TicketStatusPill` (key + issue type + status + readiness)
- [x] `readiness` added to search index/result if needed for the pill
- [x] Tests for engine subtask filtering and the shared option components
- [x] `npm run lint`, `typecheck`, `test`, `build` pass
