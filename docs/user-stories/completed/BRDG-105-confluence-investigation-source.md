# BRDG-105: Confluence as Investigation Source

**Status:** Done
**Priority:** Medium
**Depends on:** BRDG-073 (Confluence connection), BRDG-104 (Code Investigation Skill)

## Description

As the PO, I want the code investigation skill (BRDG-104) to also search Confluence for relevant documentation, specs, and decisions alongside the codebase, so I get a complete picture that includes both what is built and what was designed or decided.

Currently the investigate skill only searches code repos. Many questions ("why does X work this way?", "what was decided about Y?") have answers documented in Confluence pages (technical specs, architecture decisions, meeting notes, PRDs) that are not reflected in code comments.

## Implementation Plan

1. **Extend `confluence-client.ts`** - Add `searchByText()`, `searchByCql()` methods; refactor shared response mapping into private helper; strip HTML from excerpts
2. **Extend `/api/confluence/search` route** - Add `mode=title|text|cql` param; `space` param passthrough; test file
3. **Extend `/api/confluence/pages/[pageId]` route** - Add `format=html|text` and `maxWords` params; plain-text extraction helper; test file
4. **Update VRW investigate skill Phase 1** - Add Step 3b (Confluence search via WebFetch); add Documentation references section to output format; update synthesis step to weave findings
5. **Update VRW investigate skill Phase 2** - Extend Step 5 (cross-reference Jira keys against Confluence); add discrepancy surfacing in synthesis
6. **Update VRW investigate skill Phase 3** - Extend Step 7 (explain mode uses Confluence content for business context; cites pages by title)

## Prerequisites

- BRDG-073 Phase 1 must be complete: Confluence API connection and credentials configured
- BRDG-104 must be complete: the investigate skill exists and works for code-only searches

## Acceptance Criteria

### Phase 1: Confluence Search in Investigations

- [x] VRW investigate skill can search Confluence via CQL when running an investigation
- [x] Search terms are derived from the user's question (key domain terms, feature names, ticket keys)
- [x] Confluence results include: page title, space, last modified date, relevant excerpt
- [x] Confluence findings are integrated into the investigation output (not a separate section dump, but woven into the narrative where relevant)

### Phase 2: Documentation Cross-Reference

- [x] When the investigation finds relevant code, also search Confluence for pages that reference the same ticket keys, service names, or feature names
- [x] Surface discrepancies between what the code does and what Confluence documents say it should do
- [x] Include a "Documentation references" section in the output linking to relevant Confluence pages

### Phase 3: Explain Mode Enhancement

- [x] In explain mode, use Confluence content to enrich the non-technical summary with business context, original requirements, and design rationale
- [x] Cite Confluence pages by title (not URL) in the non-technical summary where relevant

## Output Format Addition

Add to the investigation output (BRDG-104 format):

```markdown
## Documentation references

| Page | Space | Relevance |
|------|-------|-----------|
| [Rate Calculation Architecture](confluence-url) | Engineering | Describes the original design |
| [Q3 Pricing Changes PRD](confluence-url) | Product | Requirements that led to current implementation |
```

## Technical Notes

- Uses the Confluence connection established by BRDG-073 (same API credentials)
- CQL search via `GET /wiki/rest/api/content/search?cql=...`
- Search strategies: title match, text search, label search
- VRW needs access to Confluence API (either directly via MCP tool, or proxied through Bridge)
- Rate limiting: Confluence API calls should respect same limits as BRDG-073
- Page content should be fetched selectively (only pages that look relevant based on title/excerpt), not bulk-fetched

## Related

- BRDG-073: Confluence Integration (provides the API connection)
- BRDG-104: Code Investigation Skill (the skill being extended)
