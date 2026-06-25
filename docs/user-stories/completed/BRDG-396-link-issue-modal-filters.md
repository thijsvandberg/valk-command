# BRDG-396: Filters for the "Link issue" (find related) modal

**Status:** Not Started
**Priority:** Medium
**Type:** Feature (UX)

## Description

As a PO, when I link a related issue from the ticket detail panel, I want to **filter the candidate list** so I can find the right issue without scrolling past noise. Today the modal is text-search only, with status chips that are derived from whatever the search happened to return.

I want real filters: **issue type** (default: hide subtasks), **sprint** (with its status), **epic**, **last updated**, plus **project/board**, **assignee**, and one-click **"same epic / same sprint as this ticket"** presets. I also want to be able to **browse with filters but no search text** — e.g. open the modal, pick "current sprint" + "no subtasks" and see results immediately.

## Why

- The list currently mixes issue types, projects, statuses and sprints with no way to narrow it. The most-related candidates (same epic, same sprint) are buried.
- **Subtasks leak into the list today** because of a type-name bug (see below), making the list noisier than intended.
- When linking work, the relevant candidate is almost always in the same epic or sprint, so presets and a sprint/epic filter cut the search down fast.

## Current state (where the pieces are)

- **Modal:** [src/components/ticket-detail/LinkIssueDialog.tsx](../../src/components/ticket-detail/LinkIssueDialog.tsx). Receives only `ticketKey` (plus relation/query defaults) — it does **not** currently know the current ticket's epic or sprint.
- **Hook:** [src/hooks/useLinkIssueSearch.ts](../../src/hooks/useLinkIssueSearch.ts). Debounced text search; status filtering is **client-side** over the fetched page (`filteredResults`, lines 164-166); statuses are derived from results (`availableStatuses`, lines 140-149).
- **Status chips UI:** [src/components/ticket-detail/StatusFilterChips.tsx](../../src/components/ticket-detail/StatusFilterChips.tsx) — All + one chip per status found, with counts.
- **Search route:** [src/app/api/tickets/search/route.ts](../../src/app/api/tickets/search/route.ts). Returns a **bounded set**: 25 local rows (`PAGE_SIZE`) + up to 10 Jira fallback rows when local results are sparse. Also has a `recent=1` "recently updated" browse path (used for the empty state).
- **Payload:** `LinkSearchResult` = `{ key, title, type, status, sprintName, source }` ([api-client.ts](../../src/lib/api-client.ts)). **Epic and last-updated date are not returned** and must be added to the query + payload.

### Bug to fix as part of this work

The route tries to hide subtasks with `LOWER(type) != 'sub-task'` ([route.ts:29](../../src/app/api/tickets/search/route.ts#L29)), but the VPL subtask issue type is `"Subtask"` (one word) — so the comparison never matches and **subtasks currently leak into the list**. The new issue-type filter (default: exclude subtasks) replaces this and must use the correct type name.

## Key design decision (agreed)

**Filters are server-side**, passed as query params to `/api/tickets/search` and applied in SQL — not client-side over the ~25 fetched rows (client-side would only filter the current page, which is misleading). This also enables **browse-without-query**: the route must support returning filtered results when there is no text term (extend the `recent`/browse path so it accepts the same filter params).

> See [Client Data & Memory](../architecture/client-data-and-memory.md): keep results bounded and paginated; do not fetch the whole backlog. Filters must compose with the existing `PAGE_SIZE` + `offset` pagination.

## Scope — the filters

1. **Issue type** — multi-select of types present (Story, Task, Bug, Epic, Subtask, …). **Default excludes Subtask.** When a user explicitly opts subtasks back in, they appear. Searching for a specific Jira key still bypasses the type filter (so you can always link a subtask by key, matching today's key-search behaviour).
2. **Sprint (with status)** — pick a sprint; the filter also carries the sprint's state (active / future / closed) so the label reads e.g. "Sprint 42 (active)". Sprint names come from `sprintNameCache`.
3. **Epic** — filter to candidates under a chosen epic.
4. **Last updated** — relative buckets (e.g. last 24h / 7d / 30d / any). Requires returning `jiraUpdatedAt` in the payload; the route already orders by it.
5. **Project / board** — filter by project key (the BT / GXP / BO style prefixes seen in results).
6. **Assignee** — filter by the candidate's assignee.
7. **Presets: "Same epic" / "Same sprint as this ticket"** — one click. Implemented server-side: pass the current `ticketKey`; the route looks up that ticket's epic/sprint and filters by it (the modal doesn't need to know them client-side).

Status filtering: keep the existing status chips, but they should reflect the **server-filtered** set, not just the current page.

## Approach

1. **Extend the search route** ([route.ts](../../src/app/api/tickets/search/route.ts)) to accept filter params (`types`, `sprint`, `epic`, `updatedSince`, `project`, `assignee`, `sameEpicAs`/`sameSprintAs`) and apply them in SQL for both the text-search path and the browse (`recent`) path. Add `epicKey` and `jiraUpdatedAt` to the SELECT and the response. Replace the broken `'sub-task'` exclusion with a correct, filter-driven type condition (default excludes `Subtask`).
2. **Extend `LinkSearchResult`** ([api-client.ts](../../src/lib/api-client.ts)) with `epicKey`, `updatedAt`, `project` (and assignee if not already derivable), and thread them through `tickets.searchForLink*`.
3. **Extend the hook** ([useLinkIssueSearch.ts](../../src/hooks/useLinkIssueSearch.ts)) to hold filter state, send it to the route, and re-fetch on change (debounced). Browse mode: when there's no query but at least one filter is set, fetch the filtered browse path instead of clearing results. Keep pagination working with filters applied.
4. **Filter UI in the modal** ([LinkIssueDialog.tsx](../../src/components/ticket-detail/LinkIssueDialog.tsx)): a compact filter bar above the result list (type / sprint / epic / updated / project / assignee controls + the two presets). Reuse existing dropdown/popover patterns from the board where possible. Status chips stay.
5. **Wire the current ticket's context** for the presets — pass `ticketKey` through so the route can resolve same-epic / same-sprint.

## Implementation Plan

Resolved ambiguities (sensible defaults, will confirm on visual check):
- **Project filter** auto-hides when only one project is present (the pool is VPL-only today).
- **Assignee** matched by display name (`ticket.assignee`), matching the existing local filter-options pattern.
- **Status chips** stay client-side over the now-server-filtered results (satisfies "chips reflect server-filtered set").
- **Preset overrides** any manually-set epic/sprint filter.
- Sprint options come from the existing `/api/jira/sprints` endpoint (carries `state` for the label). Epics from `/api/epics`. Type/project/assignee facets are computed server-side by the search route.

### 1. Route — `src/app/api/tickets/search/route.ts` (first; defines the contract)

- **1a.** Fix subtask bug: `notSubTask` becomes `LOWER(type) != 'subtask'` (was `'sub-task'`). Applies to both browse and text modes.
- **1b.** Parse new params: `types` (CSV, lowercased), `sprint` (sprint id → `eq(sprintName, sprint)`), `epic` (→ `eq(epicKey, epic)`), `updatedWithin` (`24h|7d|30d|any` → ISO cutoff, `jiraUpdatedAt >= cutoff`), `project` (→ `jiraKey LIKE 'KEY-%'`), `assignee` (→ `eq(assignee, assignee)`), `preset` (`epic|sprint`).
- **1c.** `buildFilterConditions(params, { isKeySearch })` helper shared by both modes. Type filter: if `types` given → `inArray(LOWER(type), types)`; else default `notSubTask` unless `isKeySearch` (key search bypasses type filter). `types` containing `subtask` opts subtasks back in.
- **1d.** Browse-without-query: treat as browse when (`q` absent/short AND ≥1 filter/preset set) OR `recent=1`. Browse runs the filtered select, `orderBy(desc(jiraUpdatedAt))`, `limit(PAGE_SIZE+1)`, `offset` → real pagination. Plain `recent=1` with no filters keeps `RECENT_LIMIT=10`/`hasMore:false`. No Jira fallback in browse mode.
- **1e.** Preset resolution: if `preset` + `exclude`, look up the excluded ticket's `epicKey`/`sprintName` and apply as the epic/sprint condition (empty results if the excluded ticket has no epic/sprint). Preset overrides explicit epic/sprint params.
- **1f.** Payload: add `epicKey`, `jiraUpdatedAt`, `project` (`jiraKey.split('-')[0]`), `assignee` to every result (null/derived for Jira-fallback rows). Allowed — search route ≠ list endpoint.
- **1g.** Add `facets: { types, projects, assignees }` via `selectDistinct` over the `notDeleted` base.

### 2. API client — `src/lib/api-client.ts`

- **2a.** Extend `LinkSearchResult` with `epicKey`, `jiraUpdatedAt`, `project`, `assignee` (all nullable).
- **2b.** Add `LinkSearchFilters` type + response type with `facets`. Update `searchForLink`, `searchForLinkWithJira`, `recentlyUpdated` to accept a `filters` object serialized via `qs()` (types pre-joined CSV).

### 3. Hook — `src/hooks/useLinkIssueSearch.ts`

- **3a.** Add `filters` state + `setFilter`/`clearFilters`/`applyPreset`, and `facets` state from responses.
- **3b.** Thread filters through `doSearch`; store `facets`.
- **3c.** Re-run on filter change (reset offset to 0). Allow empty-query search when filters active → use the browse/`recentlyUpdated`-with-filters path; keep `loadMore` working via offset.
- **3d.** `availableStatuses` already derives from `results` (now server-filtered) → chips auto-reflect the filtered set; keep client-side status narrowing on top.
- **3e./3f.** `resetSearch` clears filters; extend `UseLinkIssueSearchReturn` with the new fields.

### 4. Modal UI — `LinkIssueDialog.tsx` + new `LinkIssueFilterBar.tsx`

- **4a.** New `LinkIssueFilterBar.tsx`: issue-type multi-select (default excludes Subtask; opt-in to show), sprint dropdown (label `Sprint 7 (active)` from `/api/jira/sprints`), epic dropdown (`/api/epics`), last-updated segmented control (24h/7d/30d/Any), project dropdown (hidden if ≤1), assignee dropdown, two preset buttons.
- **4b.** Styling: `cursor-pointer`, hover/focus-visible/active/selected states; only `transform`/`opacity`/`color`/`border-color` transitions via inline `style`; no `transition-all`. Mirror the existing relation-dropdown look.
- **4c.** Mount between search input and results list; fetch sprints/epics via SWR inside the bar.
- **4d.** Results-list gating opens when filters active with no query. `StatusFilterChips` + `ScrollSentinel` keep working off `results`/`hasMore`.
- **4e.** Reset filters on modal open.

### 5. Tests — `src/app/api/tickets/search/route.test.ts`

Subtask exclusion default + opt-in + key-search bypass; type filter; sprint; epic; updatedWithin (+`any`); project (2-prefix seed); assignee; filters compose with text; browse-without-query (+offset); preset epic (+empty when no epic); preset sprint; payload shape (`epicKey`/`jiraUpdatedAt`/`project`/`assignee` + `facets`); pagination+filters & Jira-fallback gating. Update the test's local `SearchResult`/`SearchResponse` interfaces.

## Open questions

- [x] Filter bar layout: inline chips/dropdowns vs. a collapsible "Filters" panel. **Decision:** compact inline `flex-wrap` bar reusing the board's `FilterDropdown`/`FilterChip` idiom.
- [x] Should filters **persist** across modal opens (per session), or reset each open? **Decision:** reset on open (via `resetSearch`); the subtask exclusion is always the default when no type is picked.
- [x] "Last updated" bucket boundaries — **Decision:** 24h / 7d / 30d, click again to clear (= any).
- [x] "subtasks hidden" hint — **Decision:** deferred; subtasks are simply opt-in via the Type dropdown (selecting "subtask" shows them). Can add a hint later if discoverability is an issue. <!-- not built: optional nicety -->

## Acceptance Criteria

- [x] The modal shows a filter bar with: issue type, sprint (with status), epic, last updated, project/board, assignee, and "same epic" / "same sprint as this ticket" presets.
- [x] **Subtasks are hidden by default** and only appear when the user opts them in (or searches by a specific key). The underlying type-name bug is fixed (uses `Subtask`, not `sub-task`).
- [x] Filters are applied **server-side** and compose with each other and with the text search.
- [x] **Browse without a query works:** with no search text but one or more filters set, the modal returns matching results.
- [x] Sprint filter labels include the sprint's status (active/future/closed).
- [x] "Same epic" / "same sprint" presets return only candidates sharing the current ticket's epic / sprint.
- [x] Status chips reflect the server-filtered result set; existing status filtering still works.
- [x] Pagination (`load more`) and the Jira fallback still work with filters applied (Jira fallback is intentionally skipped when user filters are active, since the Jira text search can't honor them).
- [x] Every filter control has hover / focus-visible / active states and `cursor: pointer`; transitions scoped to `color`/`background-color`/`border-color`/`transform` (no `transition-all`) — inherited from the shared `FilterDropdown`/`FilterChip`.
- [x] Tests cover: subtask exclusion by default + opt-in, each server-side filter, browse-without-query, presets resolving the current ticket's epic/sprint, and the payload carrying `epicKey` + `updatedAt`. Plus a `LinkIssueFilterBar` component test.
- [x] `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` pass.

## References

- [Client Data & Memory](../architecture/client-data-and-memory.md) — bounded fetches, pagination, list-vs-detail payload split.
- [Jira subtask type name](../../) — VPL subtask type is `Subtask` (one word), not `Sub-task`.
- [Story Writer](../architecture/story-writer.md) — related issues live in the ticket detail panel alongside this modal.
