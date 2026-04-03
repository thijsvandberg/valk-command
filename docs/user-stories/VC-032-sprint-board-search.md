# VC-032: Sprint Board Search

**Status:** Done
**Priority:** Medium

---

## Description

As the PO, I want a fast, fuzzy full-text search across all tickets in the local database, and a separate Jira JQL search that queries live Jira data, so I can quickly find any ticket regardless of which sprint it is in.

---

## Core Concepts

- **Inline search bar** is always visible in the sprint board toolbar. Typing in it triggers local DB search immediately. This covers 90% of use cases without any modal.
- **Cmd+K / Ctrl+K** (or clicking the inline bar when already focused) opens an expanded **search modal** with more screen real estate, mode switching, and advanced options.
- **Local search** queries the local SQLite database via a dedicated API route. This means it searches all tickets ever synced, not just those currently visible on the board.
- **Fuzzy matching** is used for all text fields: minor typos and partial matches still surface results.
- **Jira search** fires a JQL query via the Jira REST API and returns live results from Jira, including tickets not in the local DB.

---

## Interaction Model

```
Sprint board toolbar
┌─────────────────────────────────────────────────────┐
│  [Sprints] [Filters]   [ Search tickets...  ⌘K ]   │
└─────────────────────────────────────────────────────┘
         │ typing here shows a small inline dropdown
         │ Cmd+K (or click icon) → expands to full modal
```

### Inline bar (always visible)

- Compact search input in the sprint board toolbar, right-aligned.
- Placeholder: "Search tickets... ⌘K"
- Typing shows a small dropdown (max 6 results) directly below the bar.
- Results in the dropdown are the same weighted/fuzzy local DB results.
- Pressing `Enter` or `Cmd+K` while the bar is focused opens the full modal with the current query pre-filled.
- Pressing `Escape` clears the inline bar and closes the dropdown.

### Full search modal (Cmd+K)

- Full-width modal, vertically centred in the viewport, max-width ~680px.
- Backdrop blur overlay, opens with a smooth scale+fade animation (transform + opacity only).
- Input auto-focused, pre-filled with current inline query (if any).
- Mode tabs at the top: **Local** (default) | **Jira**
- Results list below input: max 8 visible at once, scrollable.
- Keyboard navigation: `Arrow Up/Down` through results, `Enter` to open, `Escape` to close.
- Closes on Escape, backdrop click, or after navigating to a result.

---

## Local Search

### Data source

Queries the **local SQLite database** via `GET /api/search/local?q={query}`. This is not filtered to the current sprint slots — it searches all synced tickets.

Fields searched (from `ticket`, `ticketMetadata`, `jiraComment`, `poComment`, `ticketLocalEdit` tables):

| Field | Source table | Notes |
|---|---|---|
| `jiraKey` | `ticket` | Exact key match, e.g. VPL-42 |
| `summary` | `ticket` | Primary title field |
| `description` | `ticket` | Strip ADF to plain text before search |
| `localEdit.value` | `ticketLocalEdit` | Local overrides for title/description |
| `jiraComment.body` | `jiraComment` | Strip ADF to plain text |
| `poComment.body` | `poComment` | Plain text |
| `labels` | `ticket` | Comma-joined array |
| `assignee` | `ticket` | Display name |
| `reporter` | `ticket` | Display name |
| `status` | `ticket` | |
| `priority` | `ticket` | |
| `notes` | `ticketMetadata` | PO internal notes |
| `tags` | `ticketMetadata` | PO tags |

### Fuzzy matching

- Use [Fuse.js](https://www.fusejs.io/) on the server side (Node environment) for fuzzy scoring.
- Fuse.js `threshold: 0.35` — permissive enough to catch typos, strict enough to avoid noise.
- `includeScore: true`, `includeMatches: true` so matched substrings can be highlighted in the UI.
- `minMatchCharLength: 2`

### Weighting / ranking

Fuse.js field weights (higher = more important):

| Field | Weight | Reasoning |
|---|---|---|
| `jiraKey` | 1.0 | Exact key lookup must always win |
| `summary` | 0.8 | Primary ticket identifier |
| `tags` / `labels` | 0.5 | Short tokens, high signal |
| `notes` | 0.5 | PO context, high value |
| `localEdit.value` (title) | 0.7 | Overridden title is what the PO sees |
| `assignee` / `reporter` | 0.3 | Person-based queries |
| `status` / `priority` | 0.2 | Usually handled via filter bar |
| `description` | 0.15 | Long text, many partial matches |
| `jiraComment.body` | 0.1 | Historical, lowest priority |
| `poComment.body` | 0.2 | Slightly more curated than Jira comments |
| `localEdit.value` (description) | 0.15 | Same weight as raw description |

Results capped at 25, sorted by Fuse score ascending (lower = better match).

### Match highlighting

- The API returns `matches` from Fuse.js indicating which character ranges matched.
- The result row uses these to render `<mark>` highlights on the summary.

### API route

- `GET /api/search/local?q={query}` (new route)
- Loads all tickets + related rows from DB, runs Fuse.js, returns top 25.
- ADF stripping happens server-side before indexing.
- Returns `{ results: LocalSearchResult[] }` where `LocalSearchResult` includes: `key`, `summary`, `status`, `priority`, `assignee`, `sprintName`, `matches`, `score`.
- Route added to `EXPECTED_ROUTES`.

---

## Jira Search

### Mode

When the user switches to the "Jira" tab in the modal:

- The main input is used to construct a JQL query automatically.
- A collapsible **"JQL"** toggle below the input reveals a raw JQL override field. When filled, it overrides the auto-generated query entirely.
- Results are not live-as-you-type. A "Search" button (or `Enter`) fires the request.
- Loading spinner while in-flight; error message on failure.

### Auto-generated JQL from free text

```
project = VPL AND text ~ "{query}" ORDER BY updated DESC
```

`text ~` searches summary, description, and comments in Jira. Results limited to 25.

### API route

- `GET /api/search/jira?q={query}&jql={override}` (new route)
- Calls `jiraClient.searchIssues(jql, fields)` (new method on existing client).
- Returns `{ issues: JiraSearchResult[] }` where `JiraSearchResult`: `key`, `summary`, `status`, `assignee`, `sprintName`, `url`.
- Rate-limit guard: 429 if a request is already in flight.
- Route added to `EXPECTED_ROUTES`.

---

## Visual Design

The search UI should feel polished and fast, not generic.

### Inline bar

- Pill-shaped input with a subtle inset shadow and a faint search icon on the left.
- On focus: border brightens with a soft glow using the brand accent color.
- Dropdown: floating card with layered shadow (not flat `shadow-md`). Each row has hover state with a brand-tinted background.
- Match highlights: `<mark>` styled with accent color at low opacity, no underline.

### Modal

- Backdrop: `backdrop-blur-sm` + dark overlay at low opacity.
- Modal card: slightly elevated surface (distinct from page background), rounded-xl.
- Mode tabs: pill-style toggle, not full-width tabs.
- Result rows: left-aligned ticket key in monospace with muted color, summary in normal weight, right-aligned sprint name + status badge.
- Status badges: same color scheme as the sprint board ticket table.
- Active/selected row: brand-accent left border + subtle background tint.
- Empty state: centered illustration or icon + short hint text, not just "No results".
- Loading state: animated skeleton rows (not a spinner in the middle of the list).

---

## Acceptance Criteria

### Phase 1: Inline search bar

- [x] Search input added to sprint board toolbar (right side, pill-shaped)
- [x] Typing triggers `GET /api/search/local` with debounce at 150ms, min 2 chars
- [x] Inline dropdown shows max 6 results with key, summary, status badge
- [x] Match highlights rendered in summary text
- [x] Keyboard nav in dropdown (up/down/enter/escape)
- [x] `Escape` clears input and closes dropdown
- [x] `Cmd+K` / `Ctrl+K` while focused opens full modal with query pre-filled

### Phase 2: Local search API

- [x] `GET /api/search/local` route at `src/app/api/search/local/route.ts`
- [x] Loads ticket + metadata + comments + local edits from SQLite
- [x] ADF stripped server-side before Fuse.js indexing
- [x] Fuse.js used with field weights as specified
- [x] Returns top 25 results with `matches` (character ranges) and `score`
- [x] Route added to `EXPECTED_ROUTES`
- [x] Inline bar wires up to this route

### Phase 3: Search modal shell

- [x] `SearchModal` component at `src/components/sprint-board/SearchModal.tsx`
- [x] Opens via `Cmd+K` / `Ctrl+K` from anywhere on the sprint board page
- [x] Pre-fills query from inline bar if present
- [x] Input auto-focused on open
- [x] Closes on `Escape`, backdrop click, or after navigating to a result
- [x] Mode tabs: "Local" and "Jira"
- [x] Keyboard navigation (up/down/enter) across results
- [x] Visual design as specified (layered shadow, brand accent, skeleton loading, empty state)

### Phase 4: Local mode in modal

- [x] Same `GET /api/search/local` used, shows up to 25 results
- [x] Each row: key (monospace), summary with highlights, sprint name, status badge, assignee
- [x] Active row has brand-accent left border

### Phase 5: Jira search API

- [x] `jiraClient.searchIssues(jql: string, fields?: string[]): Promise<JiraIssue[]>` added to `src/lib/jira-client.ts`
- [x] Uses existing `jiraGet()` helper, `/rest/api/3/search/jql`, max 25 results
- [x] `GET /api/search/jira` route at `src/app/api/search/jira/route.ts`
- [x] Accepts `q` and optional `jql` override
- [x] Returns `{ issues: JiraSearchResult[] }`
- [x] Route added to `EXPECTED_ROUTES`

### Phase 6: Jira mode in modal

- [x] "Jira" tab fires request on Enter / button click (not live)
- [x] Collapsible JQL override field
- [x] Loading state: skeleton rows
- [x] Error state if Jira returns an error
- [x] Results rendered with same row format + "Jira" badge
- [x] Clicking a result: if ticket is locally loaded, open detail panel; otherwise open Jira URL in new tab

### Phase 7: Tests

- [x] Unit tests for `GET /api/search/local`: returns weighted results, fuzzy match, ADF stripping
- [x] Unit test for `jiraClient.searchIssues` (mocked HTTP)
- [x] Unit test for `GET /api/search/jira` (valid query, JQL override, missing params)
- [x] Component test for `SearchModal`: open/close, keyboard nav, mode switching, pre-fill from inline bar

---

## Out of Scope

- Saved / recent search history
- Autocomplete suggestions
- Searching across multiple Jira projects
- Real-time indexing / change feed (a full re-fetch on each query is acceptable given SQLite speed)
