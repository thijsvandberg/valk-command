# BRDG-237: Confluence Integration v2 (Sync, Search & Story Writer)

**Status:** Placeholder
**Priority:** TBD
**Type:** Epic
**Builds on:** BRDG-073 (Confluence connection + ticket linking), BRDG-105 (Confluence as investigation source)

> Placeholder epic. Scope and sub-stories are sketched but not yet refined. Details to be discussed before any implementation.

## Description

As the PO, I want Confluence to be a first-class, deeply integrated knowledge source in Bridge so that the documentation, specs, and decisions living in Confluence are searchable, surfaced contextually, and usable while writing stories without leaving the app.

Today (BRDG-073/BRDG-105) Confluence is connected: pages can be linked to tickets, previewed inline, auto-detected from URLs, and searched on-demand during investigations. This epic moves from "on-demand lookup" to "synced, searchable, contextual knowledge layer."

## Goals / Candidate Sub-Stories

These are the building blocks. Each will likely become its own BRDG-237x story once refined.

### A. Local sync of Confluence content
Store/sync Confluence page content locally (not just link metadata) so it is available for fast search, related-page discovery, and offline-ish display.
- Decide sync strategy: full-text store vs. metadata + excerpt only
- Which spaces to sync, how often (watermark/incremental, similar to Jira sync)
- Storage shape (new DB table) and content freshness/staleness handling

### B. Confluence in app-wide search
Include Confluence pages in Bridge's existing search (command palette / advanced search) alongside tickets.
- Mixed result set: tickets + Confluence pages, grouped/labelled
- Rank/relevance, jump-to-page, open-in-Confluence

### C. Find related Confluence pages
Surface Confluence pages related to the current ticket/epic/context automatically (beyond manually linked or URL-mentioned pages).
- Relatedness by ticket key references, shared terms, labels, AI similarity
- Where to surface: ticket sidebar, refinement view, story writer

### D. Show Confluence content in the app
Richer in-app rendering of Confluence content (extends the BRDG-073 inline preview).
- Full content view vs. truncated preview
- Faithful rendering of Atlassian storage format (tables, panels, images, links)

### E. Use Confluence content in Story Writer
Let the Story Writer pull in and reference synced Confluence content as context when drafting/refining stories.
- Inject relevant page content into story-writer context/prompts
- Cite or link source pages; let PO pick which pages to include

## Open Questions (to resolve during refinement)

- Sync scope: all spaces or a configured subset? How much content do we actually store?
- Reuse existing `confluence-client.ts` and search infra, or build a dedicated index?
- Relatedness: heuristic (keyword/ticket-key) first, AI similarity later?
- Privacy/permissions: any Confluence pages that should not be synced/shown?
- Sequencing/dependencies between A-E (A likely underpins B, C, E).

## Acceptance Criteria (high-level, to be split per sub-story)

- [ ] A. Confluence content is synced and stored locally with a defined freshness strategy
- [ ] B. Confluence pages appear in Bridge search results alongside tickets
- [ ] C. Related Confluence pages are surfaced automatically in relevant contexts
- [ ] D. Confluence content renders well inside the app
- [ ] E. Story Writer can use Confluence content as drafting context

## Related

- BRDG-073: Confluence Integration (connection, ticket linking, preview, URL auto-detect)
- BRDG-105: Confluence as Investigation Source (CQL search in investigate skill)
- See `src/lib/confluence-client.ts`, `src/app/api/confluence/*` for current foundation
