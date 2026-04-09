# BRDG-026: Import Jira Description History

**Status:** Done
**Priority:** Medium

## Description

As the PO, I want to fetch the full description change history from Jira for a ticket, so I can see all historical description versions in the History tab, not just the ones captured during sync.

Currently, Bridge only stores a new StoryVersion when a sync cycle detects a content hash change. This means description changes that happened before Bridge was set up, or between sync intervals, are invisible. The Jira changelog API has the complete history, but we only fetch the most recent entry (`getLastChangeAuthor`).

This feature adds a button to the History tab that imports all historical description changes from Jira's changelog into the local version store.

## Scope

Only description field changes. Title/summary changes are out of scope.

## Acceptance Criteria

### 1. Jira client: fetch full description changelog
- [x] New method `getDescriptionChangelog(key)` on `JiraClient`
- [x] Fetches `/rest/api/3/issue/{key}/changelog` with pagination (handles `startAt`/`maxResults`)
- [x] Filters changelog entries to only those containing a `description` field change
- [x] Returns array of `{ description: string, author: string, avatar: string | null, created: string }` for each description change
- [x] Unit test for filtering logic

### 2. API endpoint: import description history
- [x] `POST /api/tickets/[key]/versions/import` endpoint
- [x] Calls `getDescriptionChangelog` to get all historical description changes
- [x] Converts Jira ADF description to markdown (or stores raw, consistent with existing version format)
- [x] Computes content hash for each version and skips duplicates already in `storyVersion` table
- [x] Inserts new StoryVersion records with correct `updatedBy`, `updatedByAvatar`, and `createdAt` from changelog
- [x] Returns `{ imported: number, skipped: number, total: number }`
- [x] Unit test for deduplication logic

### 3. UI: Import button in History tab
- [x] "Import Jira history" button in TicketHistory component, visible when the History tab is open
- [x] Button shows loading state during import
- [x] After import, version list refreshes automatically to include new versions
- [x] Success feedback showing how many versions were imported
- [x] If no new versions found, show "History is up to date" message
- [x] Button disabled/hidden if no Jira connection configured

## Technical Notes

- Existing `getLastChangeAuthor` fetches `/rest/api/3/issue/{key}/changelog?maxResults=1`. The new method needs full pagination.
- Each Jira changelog entry contains multiple `items` (e.g. Summary, Sprint, Description in one entry). Each item has `{ field, fieldType, fromString, toString }`. We filter for `field === "description"` items only.
- The changelog `fromString`/`toString` fields contain **plaintext** representations of the description (not ADF). This is the simplified text version Jira provides in the changelog. We want the `toString` value (the new description after the change).
- Since changelog only provides plaintext (not the full ADF), the imported versions will be plaintext. This is fine for diff comparison purposes. Document this difference from sync-captured versions (which go through ADF-to-markdown conversion).
- Content hash must match the format used by existing StoryVersion records (SHA256 of `description|acceptanceCriteria`) for deduplication to work. Since changelog plaintext differs from ADF-converted markdown, hash collisions with existing versions are unlikely. This means some versions may appear as "duplicates" in the timeline even though they represent the same change captured via both sync and import.
- Historical changelog entries will only have description, not acceptance criteria, since AC is a custom field and may not appear in the changelog. Handle this gracefully (null AC for imported versions).

## Dependencies

- Existing version storage (BRDG-004, BRDG-024)
- Jira client (`src/lib/jira-client.ts`)
- TicketHistory component (`src/components/ticket-detail/TicketHistory.tsx`)
