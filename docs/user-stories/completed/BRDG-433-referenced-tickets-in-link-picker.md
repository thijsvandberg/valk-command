# BRDG-433: Surface already-referenced tickets in the Link-issue picker

**Status:** Done
**Priority:** Medium
**Type:** Feature

## Status

Implemented and shipped to `dev`. New pure helper `extractIssueKeys`, new
`GET /api/tickets/[key]/referenced-issues` endpoint, `tickets.referencedIssues`
client + `referencedResults` in `useLinkIssueSearch`, and a `REFERENCED IN THIS
TICKET` section above `RECENTLY UPDATED` in `LinkIssueDialog` (de-duped, with
keyboard traversal spanning both lists). Section label kept as drafted
(`REFERENCED IN THIS TICKET`).

`npm run lint`, `npm run typecheck` and `npm run build` are green; the full
`npx vitest run` suite passes except one pre-existing, unrelated failure
(`focus-ring-guard` flags `StoryWriterChat.tsx`, introduced by an earlier
story-writer commit and untouched here). E2E-verified in the running app on the
test story VPL-1337: the referenced section renders above recently-updated, a
ticket present in both lists shows only once (referenced wins), already-linked
and unknown keys are excluded, and clicking a referenced row creates the link.

Note for the PO: in the expanded modal the picker auto-applies your default Team
filter on open, which (as for `RECENTLY UPDATED`) hides the referenced section
until filters are cleared. This is pre-existing picker behaviour.

**Follow-up (PO request after first ship):** the section was also mirrored into
the **inline composer** in `LinkedIssuesSection` (the dropdown that expands under
"Linked Issues"), since that is where the PO actually links. Same behaviour
(referenced above recently-updated, de-duped, keyboard traversal), and the inline
composer applies no default-team filter, so it shows immediately on focus.
E2E-verified on VPL-46442 (referenced VPL-46339/VPL-46340, already-linked
VPL-46337 excluded).

## Description

When the PO opens the **Link issue** picker on a ticket to add a related issue, the picker only suggests "Recently updated" tickets. But the current ticket often already *mentions* other issues in its description or comments (as bare keys like `VPL-47038` or as Jira links), without those mentions being formal Jira issue links. Today the PO has to spot those keys by eye and re-type them into the search box.

This story adds a dedicated **"Referenced in this ticket"** section at the **top** of the picker (above "Recently updated"), listing every issue that is referenced in the current ticket's **description and/or comments** but is **not yet formally linked**. The PO can then one-click any of them to create the formal link.

**Decided behaviour (confirmed with PO):**
- Placement: a **separate heading** `REFERENCED IN THIS TICKET` rendered above `RECENTLY UPDATED` (not mixed into the recent list).
- Sources scanned: **description + Jira comments + PO comments** of the current ticket.
- Reference detection: bare issue keys *and* Jira browse URLs (a URL contains the key, so one key-extraction pass covers both).
- The section lists only references we can resolve to a **known ticket** and that are **not already formally linked** (and never the ticket itself).
- **No duplicates:** a referenced ticket that would otherwise also appear in "Recently updated" is shown **only once**, in the referenced section at the top.
- One-click add uses the picker's **existing default relation** (`relates to`); no special relation for referenced rows.

## Current Behaviour

The Link-issue picker:
- Dialog: [LinkIssueDialog.tsx](src/components/ticket-detail/LinkIssueDialog.tsx), opened from [LinkedIssuesSection.tsx](src/components/ticket-detail/LinkedIssuesSection.tsx).
- State/data: [useLinkIssueSearch.ts](src/hooks/useLinkIssueSearch.ts). On mount it fetches `tickets.recentlyUpdated(ticketKey)` and stores it in `recentResults` ([useLinkIssueSearch.ts:133-141](src/hooks/useLinkIssueSearch.ts#L133-L141)).
- Render: when there is no active query/filter, the dialog renders the `RECENTLY UPDATED` block from `recentResults` ([LinkIssueDialog.tsx:347-371](src/components/ticket-detail/LinkIssueDialog.tsx#L347-L371)). Each row is a [LinkSearchResultRow.tsx](src/components/ticket-detail/LinkSearchResultRow.tsx) over a `LinkSearchResult`.
- The query box already extracts a key from a pasted Jira URL via `/atlassian\.net\/browse\/([A-Z][A-Z0-9]+-\d+)/i` ([useLinkIssueSearch.ts:233](src/hooks/useLinkIssueSearch.ts#L233)) — so the Jira URL shape is already known in the codebase.
- Recently-updated source: `/api/tickets/search?recent=1` ([route.ts:175-259](src/app/api/tickets/search/route.ts#L175-L259)), rows shaped by `mapRow()` ([route.ts:73-86](src/app/api/tickets/search/route.ts#L73-L86)).

Source text is all available server-side in SQLite (no client fetch of comments needed):
- `ticket.description` ([schema.ts:66](src/db/schema.ts#L66)).
- `jiraComment.content` (markdown) ([schema.ts:485-503](src/db/schema.ts#L485-L503)).
- `poComment.content` ([schema.ts:471-483](src/db/schema.ts#L471-L483)).

Existing formal links live in `ticketLink` ([schema.ts:538-554](src/db/schema.ts#L538-L554)) and are surfaced as `TicketDetail.linkedIssues` ([ticket-detail-builder.ts:171-179](src/lib/ticket-detail-builder.ts#L171-L179), type [ticket.ts:213-221](src/types/ticket.ts#L213-L221)).

**No key-extraction utility exists.** `jql.ts` only *validates* a single key: `JIRA_KEY_RE = /^[A-Z][A-Z0-9]+-\d+$/i` ([jql.ts:25](src/lib/jql.ts#L25)). There is no helper that scans a block of text for *all* mentioned keys. Project key is `VPL` (`NEXT_PUBLIC_JIRA_PROJECT_KEY`, [env.ts:11-16](src/lib/env.ts#L11-L16)).

## Proposed Approach

Do the work **server-side** in one new endpoint, because all source text (description + both comment tables) and the existing links already live in the local DB. This avoids loading comments to the client just for scanning, and returns rows in the exact `LinkSearchResult` shape so the existing row component renders them unchanged.

### 1. Key-extraction helper (new, pure)
New util `extractIssueKeys(text: string): string[]` in `src/lib/` (e.g. `src/lib/issue-keys.ts`):
- Global match on the multi-occurrence form of the existing pattern: `/[A-Z][A-Z0-9]+-\d+/gi`.
- Uppercase, dedupe, preserve first-seen order.
- Matches bare keys and keys inside Jira browse URLs alike (the URL substring contains the key).
- Co-located unit test (pure function, easy to cover).

### 2. Referenced-issues endpoint (new)
`GET /api/tickets/[key]/referenced-issues`:
- Load the source ticket's `description`, all `jiraComment.content`, all `poComment.content` from the DB (reuse prepared statements where they exist).
- Concatenate and run `extractIssueKeys`.
- Exclude: the ticket's own key; any key already in `ticketLink` for this ticket (already formally linked — nothing to add).
- Resolve the remaining keys against the local `ticket` table; **drop keys with no known ticket** (e.g. unsynced or other-project mentions). Shape each hit with the same field set `mapRow()` produces (`key, title, type, status, sprintName, epicKey, assignee, jiraUpdatedAt, project`) so the response is `LinkSearchResult[]`.
- Order: first-seen order from the source text (description before comments) is a sensible default; can be revisited.
- Returns `{ results: LinkSearchResult[] }`. Private, `no-store` (mirrors the comments route).

### 3. Wire into the hook
In [useLinkIssueSearch.ts](src/hooks/useLinkIssueSearch.ts): add a parallel mount fetch (next to the `recentlyUpdated` effect) that populates new state `referencedResults: LinkSearchResult[]`, exposed on `UseLinkIssueSearchReturn`. Add a `tickets.referencedIssues(key)` helper in [api-client.ts](src/lib/api-client.ts).

### 4. Render the section
In [LinkIssueDialog.tsx](src/components/ticket-detail/LinkIssueDialog.tsx), inside the default (no query, no filter) branch ([LinkIssueDialog.tsx:347-371](src/components/ticket-detail/LinkIssueDialog.tsx#L347-L371)), render a `REFERENCED IN THIS TICKET` block **above** the `RECENTLY UPDATED` block, reusing `LinkSearchResultRow` and the same `HoverDataProvider` wrapper. Use a distinct lucide icon (e.g. `Link2` / `Quote`) and the same `text-caption uppercase tracking-widest` header style as "Recently updated". Hide the block entirely when `referencedResults` is empty. Keyboard highlight indexing must account for the referenced rows preceding the recent rows.

**De-dupe:** filter the `RECENTLY UPDATED` list to drop any key that is already in `referencedResults` (referenced section wins), so no ticket shows twice. Do the filter once and feed the de-duped recent list to both the render and the highlight indexing.

### Non-goals / out of scope
- No background scanning or persistence of references (computed on demand when the picker opens; no new table).
- No change to how formal links are created — selecting a referenced row goes through the existing `handleSubmit` / `tickets.createLink` path unchanged.
- No cross-project resolution beyond what is already synced locally.

## Open Questions

- **Section label wording.** Drafted as `REFERENCED IN THIS TICKET`. Alternatives: `MENTIONED IN THIS TICKET`, `REFERENCED HERE`. Cosmetic; easy to change.

## Implementation Plan

1. **Helper + tests** — `src/lib/issue-keys.ts` (`extractIssueKeys`) + `src/lib/issue-keys.test.ts`.
2. **Endpoint** — `src/app/api/tickets/[key]/referenced-issues/route.ts` + route test (description-only, comment-only, already-linked-excluded, self-excluded, unknown-key-dropped).
3. **API client + hook** — `tickets.referencedIssues` in `api-client.ts`; `referencedResults` state + mount fetch in `useLinkIssueSearch.ts`.
4. **UI** — `REFERENCED IN THIS TICKET` section in `LinkIssueDialog.tsx`; fix highlight indexing across both sections.

## Acceptance Criteria

- [x] Opening the Link-issue picker on a ticket whose description mentions `VPL-XXXX` shows that ticket under a `REFERENCED IN THIS TICKET` heading above `RECENTLY UPDATED`. <!-- LinkIssueDialog.tsx default branch + new endpoint -->
- [x] Issues mentioned only in a Jira comment or a PO comment are also surfaced. <!-- endpoint scans jiraComment + poComment -->
- [x] Both bare keys (`VPL-47038`) and Jira browse URLs (`.../browse/VPL-47038`) are detected. <!-- extractIssueKeys global regex -->
- [x] An issue that is already formally linked (`ticketLink`) does NOT appear in the referenced section. <!-- endpoint excludes existing links -->
- [x] The ticket's own key never appears, and mentioned keys with no known local ticket are silently dropped. <!-- endpoint self-exclude + resolve-or-drop -->
- [x] When there are no resolvable references, the section is not rendered (no empty header). <!-- conditional render, mirrors recentResults -->
- [x] A ticket that is both referenced and recently-updated appears only in the referenced section, not in "Recently updated". <!-- de-dupe filter on recentResults -->
- [x] Clicking a referenced row creates the formal link via the existing flow, exactly like a recently-updated row. <!-- reuse handleSelect/handleSubmit -->
- [x] Keyboard up/down highlight traverses referenced rows then recent rows in visual order. <!-- highlightIndex spans both lists -->

## Tests

- [x] `extractIssueKeys` unit: bare keys, URLs, mixed case, dedupe, order, no-match. <!-- src/lib/issue-keys.test.ts -->
- [x] Endpoint: pulls keys from description, Jira comment, and PO comment; excludes already-linked; excludes self; drops unknown keys; returns `LinkSearchResult` shape. <!-- src/app/api/tickets/[key]/referenced-issues/route.test.ts -->
- [x] Dialog render: referenced section appears above recently-updated when `referencedResults` is non-empty and is absent when empty; a ticket in both lists is rendered only in the referenced section. <!-- LinkIssueDialog test -->
- [x] Hook: `referencedResults` populated from the endpoint on mount; stays empty on fetch failure. <!-- useLinkIssueSearch.test.ts -->

## Related
- [LinkIssueDialog.tsx](src/components/ticket-detail/LinkIssueDialog.tsx), [useLinkIssueSearch.ts](src/hooks/useLinkIssueSearch.ts), [LinkSearchResultRow.tsx](src/components/ticket-detail/LinkSearchResultRow.tsx) — the picker this extends.
- `/api/tickets/search` ([route.ts](src/app/api/tickets/search/route.ts)) — `mapRow()` is the row-shape reference the new endpoint mirrors.
- `JIRA_KEY_RE` ([jql.ts:25](src/lib/jql.ts#L25)) — the single-key validator the new multi-match helper is derived from.
- `relatedSuggestionCache` ([schema.ts:937-956](src/db/schema.ts#L937-L956)) — separate AI-scored "related suggestions" feature; this story is deterministic text-reference detection, not scoring.
