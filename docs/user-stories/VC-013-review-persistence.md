# VC-013: Persist and Display Story Review Results

**Status:** Not Started
**Priority:** High

## Description

When a `/review-story` is executed (either from the ticket detail page or from Chat mode), the resulting JSON review data must be persisted and linked to the specific story version it was based on. The stored review should be viewable from the sprint board by clicking on the quality score. It must be immediately clear whether the review reflects the current version of the story or an older one.

Additionally, when a story is fetched or reviewed in Chat mode, the results must flow back into the sprint board data so the quality score stays in sync across all views.

## Scope

### 1. Review data model

- [ ] Define a `StoredReview` type that extends `ReviewResult` with metadata:
  - `id` (unique identifier)
  - `ticketKey` (linked story)
  - `createdAt` (timestamp)
  - `source` ("ticket-detail" | "chat" | "bulk-action")
  - `storyVersionHash` (content hash of the story at review time)
  - `storyVersionNumber` (version number at review time)
- [ ] Store reviews in a persistent collection (DB table or local store), not just component state
- [ ] Link each review to the `StoryVersion.contentHash` so freshness can be determined by comparing against the current version hash

### 2. Persist reviews from all entry points

- [ ] **Ticket detail page**: after `reviewStory()` completes, save the `StoredReview` and update the ticket's `qualityScore`
- [ ] **Chat mode**: when a `/review-story <key>` command returns JSON results, parse and save as `StoredReview`, update the ticket's `qualityScore` and `qualityStale` flag
- [ ] **Chat mode (story fetch)**: when a story is fetched in chat and quality data is included, sync it to the sprint board data
- [ ] **Bulk action bar**: after bulk review, persist each individual review result

### 3. Sprint board score click-through

- [ ] Make the `QualityBadge` in the sprint board clickable (currently display-only)
- [ ] On click, open a popover or slide-out panel showing the most recent `StoredReview`:
  - Overall score with color indicator
  - Per-dimension scores (clarity, testability, completeness, technical feasibility) with feedback
  - Summary and suggestions
  - Timestamp of the review
  - Version indicator (see below)
- [ ] If no review exists for the ticket, show an empty state with a "Run Review" action

### 4. Version freshness indicator

- [ ] Compare `StoredReview.storyVersionHash` against the current `StoryVersion.contentHash`
- [ ] If they match: show a "Current version" label (e.g. green check + "Based on v3 (current)")
- [ ] If they differ: show a "Outdated" warning (e.g. amber clock + "Based on v2, story is now at v3") with a "Re-review" action button
- [ ] The `qualityStale` flag on the `Ticket` type should be derived from this hash comparison, not set manually

### 5. Cross-view sync

- [ ] Reviews saved from Chat mode must be immediately reflected in the sprint board without requiring a page refresh
- [ ] Reviews saved from the ticket detail page must update the sprint board score
- [ ] Use shared state (context, SWR cache, or event bus) so all views stay in sync

## Acceptance Criteria

- [ ] Running `/review-story VPL-123` in Chat persists the result and updates the sprint board score for VPL-123
- [ ] Clicking a quality score in the sprint board opens a panel showing the full review breakdown
- [ ] The review panel clearly shows whether the review matches the current story version or an older one
- [ ] An outdated review shows which version it was based on and offers a re-review action
- [ ] Fetching a story in Chat with quality data syncs that data to the sprint board
- [ ] Multiple reviews for the same ticket are stored (history), but the sprint board always shows the most recent
- [ ] The `qualityStale` flag is automatically derived from version hash comparison

## Technical Notes

- The `ReviewResult` type in `src/lib/agent-client.ts` already has the right shape; `StoredReview` wraps it with persistence metadata
- `StoryVersion` in `src/types/ticket.ts` already has `contentHash` and `versionNumber` which can be used for freshness comparison
- The `QualityBadge` component in `src/components/sprint-board/TicketTable.tsx` is the click target; wrap it or extend it
- Consider a shared review store (React context or Zustand) that both Chat and sprint board can read/write
- Reviews are currently only in component state on the ticket detail page; this story moves them to a persistent layer

## Dependencies

- Depends on VC-011 (Jira integration) for real story content hashes from synced data
