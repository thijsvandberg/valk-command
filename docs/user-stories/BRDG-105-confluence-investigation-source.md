# BRDG-105: Confluence as Investigation Source

**Status:** Open
**Priority:** Medium
**Depends on:** BRDG-073 (Confluence connection), BRDG-104 (Code Investigation Skill)

## Description

As the PO, I want the code investigation skill (BRDG-104) to also search Confluence for relevant documentation, specs, and decisions alongside the codebase, so I get a complete picture that includes both what is built and what was designed or decided.

Currently the investigate skill only searches code repos. Many questions ("why does X work this way?", "what was decided about Y?") have answers documented in Confluence pages (technical specs, architecture decisions, meeting notes, PRDs) that are not reflected in code comments.

## Prerequisites

- BRDG-073 Phase 1 must be complete: Confluence API connection and credentials configured
- BRDG-104 must be complete: the investigate skill exists and works for code-only searches

## Acceptance Criteria

### Phase 1: Confluence Search in Investigations

- [ ] VRW investigate skill can search Confluence via CQL when running an investigation
- [ ] Search terms are derived from the user's question (key domain terms, feature names, ticket keys)
- [ ] Confluence results include: page title, space, last modified date, relevant excerpt
- [ ] Confluence findings are integrated into the investigation output (not a separate section dump, but woven into the narrative where relevant)

### Phase 2: Documentation Cross-Reference

- [ ] When the investigation finds relevant code, also search Confluence for pages that reference the same ticket keys, service names, or feature names
- [ ] Surface discrepancies between what the code does and what Confluence documents say it should do
- [ ] Include a "Documentation references" section in the output linking to relevant Confluence pages

### Phase 3: Explain Mode Enhancement

- [ ] In explain mode, use Confluence content to enrich the non-technical summary with business context, original requirements, and design rationale
- [ ] Cite Confluence pages by title (not URL) in the non-technical summary where relevant

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
