# BRDG-215: Support All Jira Link Types in Related Stories

**Status:** Complete
**Priority:** Medium

## Description

As a PO, I want to choose from all available Jira link types when linking related stories, so I can accurately describe the relationship between issues (e.g. "implements", "is caused by", "split from") instead of being limited to a small subset.

## Current State

The link type dropdown currently only offers 7 options (relates to, blocks, is blocked by, clones, is cloned by, duplicates, is duplicated by). Jira supports 30+ link relation types.

## Acceptance Criteria

- [x] Link types are fetched dynamically from Jira (`GET /rest/api/3/issueLinkType`)
- [x] Fetched link types are cached locally for 1 week (re-fetched when cache is empty or expired)
- [x] Both inward and outward labels are available as dropdown options (e.g. "blocks" and "is blocked by")
- [x] The dropdown in `LinkIssueDialog` shows all available link types
- [x] The inline dropdown in `LinkedIssuesSection` also shows all available link types
- [x] The API route correctly maps any chosen relation to the right Jira link type name and direction
- [x] Hardcoded fallback list is available in case the Jira fetch fails
- [x] Existing links with current relation labels continue to display correctly

## Technical Notes

- Add `getIssueLinkTypes()` to `jira-client.ts` calling `GET /rest/api/3/issueLinkType`
- New API endpoint `GET /api/jira/link-types` with 1-week cache TTL
- Jira returns: `{ issueLinkTypes: [{ id, name, inward, outward }] }`
- Each Jira type produces 2 dropdown entries (inward + outward), except symmetric types like "Relates" where inward === outward (1 entry)
- Remove hardcoded `RELATION_OPTIONS` from `LinkIssueDialog.tsx` (keep as fallback)
- Remove hardcoded `VALID_LINK_TYPES` and `RELATION_TO_JIRA` from the links API route; derive dynamically from the cached link types
- Shared hook `useLinkTypes()` to avoid duplicate fetch logic between components

## Implementation Plan

1. **Add `getIssueLinkTypes()` to jira-client.ts** - New method calling `GET /rest/api/3/issueLinkType`, returns `{ id, name, inward, outward }[]`
2. **Create `GET /api/jira/link-types` route** - Server-side 1-week cache, transforms Jira types into flat list of `{ value, label, jiraTypeName, direction }` dropdown options
3. **Add `getLinkTypes()` to api-client.ts** - Frontend fetch method for the new endpoint
4. **Create `useLinkTypes()` hook** - SWR-based hook with hardcoded fallback, shared by both UI components
5. **Update `LinkIssueDialog.tsx`** - Use dynamic link types from hook instead of hardcoded `RELATION_OPTIONS`
6. **Update `LinkedIssuesSection.tsx`** - Same: use hook instead of imported `RELATION_OPTIONS`
7. **Update links POST route** - Derive Jira type mapping dynamically from cached link types, with hardcoded fallback
8. **Tests** - API route tests, hook tests, verify existing tests pass
9. **Cleanup** - Remove the old `RELATION_OPTIONS` export

## Dependencies

None
