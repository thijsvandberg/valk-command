# BRDG-073: Confluence Integration

**Status:** In Progress
**Priority:** Medium

## Description

As the PO, I want to link Confluence pages to tickets and view page summaries inline in the ticket detail so technical specs and design docs are accessible without leaving Bridge.

## Implementation Plan

### Phase 1 (foundation, no dependencies)
1. `src/lib/env.ts` - add `CONFLUENCE_BASE_URL`, `CONFLUENCE_EMAIL`, `CONFLUENCE_API_TOKEN`, `CONFLUENCE_SPACE_KEY`
2. `src/lib/confluence-client.ts` - new client, mirrors jira-client pattern. Basic auth, `isLive`, `checkHealth`, `searchPages` (CQL v1), `getPage` (API v2), `getPageMetadata`
3. `src/lib/rate-limiter.ts` - add `confluence` to `outboundCounters` + union types
4. `src/app/api/confluence/health/route.ts` - follows jira health route pattern
5. `src/app/(app)/settings/integrations/page.tsx` + add tab to layout - shows connection status for all integrations (Jira, Confluence, Bitbucket)
6. `src/hooks/useSprintBoard.ts` - add `useConfluenceHealth` hook

### Phase 2 (depends on Phase 1)
7. `src/db/schema.ts` - add `ticketConfluenceLink` table; run `npm run db:generate`
8. `src/app/api/confluence/search/route.ts` - `GET ?q=` CQL search proxy
9. `src/app/api/tickets/[key]/confluence-links/route.ts` - GET/POST/DELETE CRUD
10. `src/hooks/useSprintBoard.ts` - add `useTicketConfluenceLinks` hook
11. `src/components/ticket-detail/ConfluencePagesSection.tsx` - new component with search popover and linked pages list
12. `src/components/ticket-detail/TicketSidebar.tsx` - wire in ConfluencePagesSection

### Phase 3 (depends on Phase 2)
13. `src/app/api/confluence/pages/[pageId]/route.ts` - GET page content, truncate to ~500 words, sanitize HTML
14. `ConfluencePagesSection.tsx` - extend with expand/collapse inline preview

### Phase 4 (depends on Phase 2, parallel with Phase 3)
15. `src/lib/confluence-url-detector.ts` - regex detector for Confluence URLs in text
16. `src/app/api/tickets/[key]/confluence-mentions/route.ts` - scan ticket + comments, resolve metadata
17. `ConfluencePagesSection.tsx` - add "Mentioned pages" sub-section

---

## Acceptance Criteria

### Phase 1: Confluence connection
- [ ] Confluence API credentials in settings (base URL + API token)
- [ ] Health check endpoint: `GET /api/confluence/health`
- [ ] Connection test on settings page

### Phase 2: Link Confluence pages to tickets
- [ ] "Link Confluence page" button in ticket detail
- [ ] Search Confluence by title (CQL search)
- [ ] Select a page to link; store mapping in DB (`ticketConfluenceLink` table: ticketKey, pageId, pageTitle, pageUrl)
- [ ] Show linked pages in ticket sidebar

### Phase 3: Page preview
- [ ] Click linked page to expand an inline preview
- [ ] Fetch page content via Confluence API (convert from Atlassian storage format to HTML)
- [ ] Show title, last modified date, author
- [ ] Truncate to first 500 words with "Open in Confluence" link

### Phase 4: Auto-detection
- [ ] Scan ticket description and comments for Confluence URLs
- [ ] Auto-suggest linking detected Confluence pages
- [ ] Show as "Mentioned pages" section (separate from manually linked)

## Technical Notes

- Confluence Cloud REST API v2: `GET /wiki/api/v2/pages/{id}?body-format=view`
- CQL search: `GET /wiki/rest/api/content/search?cql=title~"search term"`
- Same Atlassian API token may work for both Jira and Confluence (same cloud instance)
- Store page metadata locally for quick display; fetch full content on expand
- Rate limit Confluence API calls (similar pattern to Jira)

## Out of Scope (for now)
- Creating Confluence pages from Bridge
- Editing Confluence pages inline
- Confluence page templates
- Bidirectional linking (Bridge link in Confluence)
