# BRDG-345: Inline Sprint Board Search — Match Description, Comments & More

**Status:** Done
**Priority:** Medium
**Type:** Feature

## Description

As a Product Owner, I want the inline "Search tickets…" field on the sprint board to match more than just the ticket title, so I can find a ticket by something I remember from its **description, acceptance criteria, comments, labels or notes** — not only its title or key.

Today the inline field is a narrow substring filter: it matches only `key`, `title` and `assignee.name`. If I half-remember a phrase that lives in the description or a comment ("the one about the Kibana heartbeat channel"), the inline search returns nothing and I have to fall back to the Cmd+K modal. The richer search already exists in the codebase — the modal's local search index covers description, acceptance criteria, labels, notes and both PO and Jira comment bodies — but the inline field doesn't use it. This story closes that gap so the inline filter searches the fields people actually remember content from.

## Context

- **Inline search today (the limited path):** `src/components/sprint-board/useSprintBoardFilters.ts:248-256` filters with a plain substring `.includes()` over exactly three fields — `t.key`, `t.title`, `t.assignee?.name` — with a 2-character minimum and no debounce.
- **The input control:** `src/components/sprint-board/ExpandableSearch.tsx` (icon expands to a field; placeholder "Search tickets…"). State lives in `useSprintBoardFilters.ts:63` (`searchQuery` / `setSearchQuery`).
- **The richer search already exists** (the modal path, Shift+Cmd+K):
  - `src/lib/search-index-cache.ts:49-65` — `TICKET_SEARCH_KEYS` weights ~15 fields including `description`, `acceptanceCriteria`, `notes`, `labels`, `poCommentBodies`, `jiraCommentBodies`.
  - `src/lib/local-search-engine.ts:205-226` — builds the index from the DB, joining comment bodies per ticket and stripping ADF from description / acceptance criteria.
  - `src/components/sprint-board/useSearchActions.ts:62-67` — 150ms debounce, server-side Fuse.js via `/api/search/local`.
- **Data shape:** the board's client-side ticket objects carry `title`, `key`, `assignee`, and (per the schema, `src/db/schema.ts:42-83`) `description`, `acceptanceCriteria`, `labels`. **Comments live in separate tables** (`poComment`, `jiraComment`, `schema.ts:382-410`) and are *not* on the board ticket object — so matching comments inline requires either using the existing local search index/endpoint or extending the board payload.

## Chosen approach (agreed with PO)

A **hybrid / middle path**, combining the two options below:

- **Instant local match** on the fields already present on the board ticket object — title, key, assignee, `description`, `acceptanceCriteria`, `labels`, notes — so the common case stays instant-as-you-type with no perceived latency.
- **Index-backed comment matches** folded in on top: the existing local search index (the engine Cmd+K uses) supplies ticket keys that match on `poCommentBodies` / `jiraCommentBodies`, which are unioned into the visible set. This part may resolve slightly later (debounced) without blocking typing.
- The combined key set is always **intersected with the currently filtered scope** (see Scope criteria) — comment matches never reintroduce a ticket that the active filters excluded.

This was chosen over the two alternatives considered — pure client-side substring (instant but can't reach comments) and pure index reuse (covers everything but makes the whole inline filter async).

## Implementation Plan

**Correction to Context:** the board `Ticket` object (`src/types/ticket.ts`) does **not** carry `description`, `acceptanceCriteria` or `labels` — only `title`, `key`, `assignee.name` and `notes`. So the instant local tier can only widen to `notes`; description / AC / labels / comments all live solely in the server search index and are reached via the index-backed tier.

1. **Engine — `executeLocalKeyMatch(q)`** in `src/lib/local-search-engine.ts`: 2-char guard, reuse `getSearchCache() ?? buildIndex()`, case-insensitive substring scan across all `TICKET_SEARCH_KEYS` (no fuzzy, no weighting, no 25-cap), return de-duplicated `key[]`. Covers description, AC, labels, notes, PO + Jira comments, local edits, reporter, etc.
2. **Route — `GET /api/search/local/keys?q=`** (new `src/app/api/search/local/keys/route.ts`): returns `{ keys: string[] }`, `Cache-Control: private, no-store`. No filter params — scope intersection happens client-side. Modal route (`/api/search/local`) untouched.
3. **api-client** — add `search.localKeys(q, signal)` to `src/lib/api-client.ts`.
4. **Instant tier** — widen the `filteredTickets` substring filter in `useSprintBoardFilters.ts` to also test `t.notes` (title/key/assignee already covered).
5. **Index-fetch effect** in `useSprintBoardFilters.ts`: `indexMatchedKeys: Set<string>` state; debounced (~150ms) aborting fetch keyed on `searchQuery`; clears when query < 2 chars. Mirrors the abort/debounce pattern in `useSearchActions.ts`.
6. **Fold in** — `filteredTickets` keeps a ticket in `scopeFiltered` if it passes the instant match **OR** `indexMatchedKeys.has(t.key)`. Intersection with the filtered scope is implicit (we only iterate `scopeFiltered`).
7. **Result count** — expose `searchResultCount` (= filtered) and `searchScopeCount` (= `scopeFiltered.length`) from the hook; render "X of Y" via an optional `count` prop on `ExpandableSearch` (so all hosts get it). Denominator = post-filter scope.
8. **Empty state** — thread `searchQuery` into `TicketTable` and swap the empty-state copy to "No tickets match '…'" when a search is active (reuse `EmptyState`).

**Deferred (nice-to-have):** matched-term highlighting and a "matched in comments" hint — both require threading per-field match info through the row components; out of scope for v1, annotated on the checkboxes.

**Ordering:** 1 → 2 → 3 (engine → route → client), 4 independent, 5 needs 3, 6 needs 4+5, 7+8 need 6.

**Tests:** engine unit tests for each index-only field (description, AC, labels, notes, PO comment, Jira comment), case-insensitivity, 2-char min, no-cap, status-excluded tickets (`src/lib/local-search-engine.test.ts`); route test (new); hook tests for notes match, index fold-in, scope intersection, count, 2-char clear (`useSprintBoardFilters.test.ts`); `ExpandableSearch` count prop; `TicketTable` search empty-state copy.

## Acceptance Criteria

### Core — deeper field coverage
- [x] The inline "Search tickets…" field matches ticket **description** and **acceptance criteria** in addition to title, key and assignee. <!-- via index-backed key match; these fields are not on the board ticket object -->
- [x] The inline field matches **labels** and **PO notes**. <!-- labels via index; notes via instant tier (on the board object) and index -->
- [x] The inline field matches **comment bodies** (PO comments and Jira comments) via the index-backed part of the hybrid approach.
- [x] Matching is case-insensitive and the 2-character minimum is preserved.

### Behaviour & feedback
- [x] The local-field match (title/key/assignee/notes) updates **instantly as you type**; the index-backed matches (description/AC/labels/comments) are debounced (~150ms, abortable) and fold in without ever blocking typing.
- [x] A result count is shown for the active query (e.g. "7 of 21") so it is clear the filter is applied and how many matched.
- [x] An empty-result state reads clearly ("No tickets match your search") rather than an unexplained empty list.

### Scope — search within the current filter only
- [x] The inline search runs **on top of the already-filtered set**, not the full ticket list. It narrows whatever is currently visible given the active scope (selected sprint / All / backlog) and every active filter dropdown (Status, Epic, Assignee, Readiness, Changes, Type, Gaps, Team, Sprint). A ticket excluded by a filter is never surfaced by the search. <!-- the filter iterates scopeFiltered, so an index hit can never reintroduce a filtered-out ticket -->
- [x] This holds for the deep fields too: a description/comment match only appears if that ticket already passes the current filters.

### Consistency
- [x] Inline results are consistent with the Cmd+K modal for the same query (no ticket that the modal finds by description/comment is silently missing from the inline filter), within the limits of the chosen approach — *within the currently filtered scope* (the inline field intentionally does not search across hidden scopes the way the modal can). <!-- both reuse the same search index/cache -->

### Nice-to-have — WON'T DO (per PO, 2026-06-15)
The PO confirmed these are not needed; dropped from scope.
- [ ] ~~Matched terms are highlighted in the row.~~ Won't do.
- [ ] ~~A subtle "matched in comments" hint when a ticket matches only on a non-visible field.~~ Won't do.

### Tests
- [x] Tests cover matching on each newly-supported field (description, acceptance criteria, labels, notes, comments), the case-insensitive behaviour, the 2-char minimum, the result count, the empty state, and that scope/other filters still compose correctly.

## Technical Notes

- Today the inline search already runs **after** the filters: `filteredTickets` (`useSprintBoardFilters.ts:248`) filters `scopeFiltered`, which is the result of all filter dropdowns + scope. The deep-field change must preserve this ordering — only the *match condition* widens, not the input set.
- For the comment part, the index is **global**; the resulting key set must be **intersected** with the current `scopeFiltered` list, otherwise filtered-out tickets would reappear. Do not search the whole index and replace the list.
- Prefer reusing `local-search-engine.ts` / `search-index-cache.ts` and the `/api/search/local` endpoint for the comment match rather than duplicating field-matching logic, so the inline and modal searches stay in sync as the index evolves.
- The instant local-field match should strip ADF from `description` / `acceptanceCriteria` before matching (see `stripAdf` in `local-search-engine.ts`).
- Remember comments are not on the board ticket object — only the index can reach them.
- Keep the change isolated to `useSprintBoardFilters.ts` (filter logic), `ExpandableSearch.tsx` (input + count/empty feedback) and the row component if highlighting is included. Do not alter the modal search behaviour.
- Related prior work: BRDG-032 (original sprint board search), BRDG-053/084/324 (search improvements), BRDG-252 (ticket-ref pills in search results).
