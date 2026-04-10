# BRDG-073: Confluence Integration

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want to link Confluence pages to tickets and view page summaries inline in the ticket detail so technical specs and design docs are accessible without leaving Bridge.

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
