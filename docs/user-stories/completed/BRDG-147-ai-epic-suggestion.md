# BRDG-147: AI Epic Suggestion in Epic Picker

**Status:** Not Started
**Priority:** Medium

## Description

As a Product Owner, I want the epic picker in the ticket sidebar to suggest the most relevant epic using AI, so that I can quickly and consistently link tickets to the right epic without manually scanning the full list.

## Context

The epic picker (`EpicPicker.tsx`) currently shows a flat list of all epics with search. For a growing backlog, manually finding the right epic is slow and error-prone. By storing a short summary per epic locally and sending those summaries (along with the ticket context) to VRW, we can get a ranked AI suggestion in seconds.

## Implementation Plan

1. **Phase 1 (Schema + API):** Add `summary` and `summaryUpdatedAt` columns to `ticket` table, generate migration, extend `GET /api/epics` response, create `PATCH /api/epics/[key]/summary` endpoint
2. **Phase 2 (VRW summarize-epics):** Create `summarize-epics` skill prompt + register in VRW `skills.ts`, create `POST /api/epics/generate-summaries` endpoint with stream capture, add Refresh summaries button to EpicPicker
3. **Phase 3 (VRW suggest-epic):** Create `suggest-epic` skill prompt + register in VRW `skills.ts`
4. **Phase 4 (Frontend):** Create `POST /api/tickets/[key]/suggest-epic` endpoint, add suggest button to EpicPicker with streaming, display suggestions with confidence/reason, dismiss on search
5. **Phase 5 (Staleness):** Compute staleness from `jiraUpdatedAt` vs `summaryUpdatedAt` in `GET /api/epics`, expose `summaryStale` boolean, show indicator in EpicPicker with refresh action

**Files touched:** `src/db/schema.ts`, `src/app/api/epics/route.ts`, `src/app/api/epics/[key]/summary/route.ts` (new), `src/app/api/epics/generate-summaries/route.ts` (new), `src/app/api/tickets/[key]/suggest-epic/route.ts` (new), `src/components/shared/EpicPicker.tsx`, `src/components/ticket-detail/TicketSidebar.tsx`, `src/lib/api-client.ts`, VRW `src/skills.ts` + 2 new skill prompts

## Acceptance Criteria

### Phase 1: Epic Summaries Storage

- [x] Add a `summary` text column to the `ticket` table (nullable, used primarily for epics)
- [x] Create a migration for the new column
- [x] Extend `GET /api/epics` response to include the `summary` field per epic
- [x] Add `PATCH /api/epics/[key]/summary` endpoint for manually editing a summary

### Phase 2: AI Summary Generation (VRW)

- [x] Create a `summarize-epics` skill in VRW that generates a 1-2 sentence summary per epic
  - Input: list of epic keys (or "all" for a full refresh)
  - Per epic: reads title, description, and child ticket titles from Jira
  - Output: JSON array of `{ key, summary }` pairs
- [x] Create a skill prompt file `.claude/skills/summarize-epics.md` in VRW
- [x] Add `POST /api/epics/generate-summaries` endpoint in valk-command that:
  - Triggers the `summarize-epics` skill via the workspace task system
  - Streams progress back to the client
  - On completion, upserts summaries into the local DB
- [x] Add a "Refresh summaries" button in a suitable location (e.g., Sprint Board settings or epic management)

### Phase 3: AI Epic Suggestion (VRW)

- [x] Create a `suggest-epic` skill in VRW
  - Input: ticket key, title, description/acceptance criteria, and the full epic summary list
  - Output: JSON with top 3 suggested epics, each with a `key`, `name`, `confidence` (high/medium/low), and a short `reason`
  - The skill prompt should instruct the model to match based on domain, scope, and thematic fit
- [x] Create a skill prompt file `.claude/skills/suggest-epic.md` in VRW
- [x] Register both new skills in VRW's `src/skills.ts` with appropriate tools and timeouts

### Phase 4: Frontend Integration

- [x] Add a "Suggest epic" button (sparkle/wand icon) to the `EpicPicker` popover header
- [x] On click: call `POST /api/tickets/[key]/suggest-epic` which:
  - Gathers ticket context (title, description, acceptance criteria)
  - Loads all epic summaries from local DB
  - Sends both to VRW via the `suggest-epic` skill
- [x] Show a loading state in the picker while the suggestion streams
- [x] Display suggestions as a highlighted section at the top of the epic list:
  - Each suggestion shows the epic name, confidence indicator, and short reason
  - Clicking a suggestion selects it as the epic (same as normal selection)
- [x] Suggestions should dismiss/hide when the user starts typing in the search field

### Phase 5: Summary Staleness Detection

- [x] Track `summaryUpdatedAt` timestamp per epic (new column or reuse existing updated fields)
- [x] During epic sync (`POST /api/jira/sync-epics`), compare the Jira `updated` timestamp with `summaryUpdatedAt`
- [x] If an epic was updated in Jira since its last summary generation, mark it as stale
- [x] Show a subtle indicator in the epic management UI when summaries are stale
- [ ] Optionally: auto-trigger summary regeneration for stale epics after a sync (configurable) <!-- skipped: marked as optional, can be added as follow-up if needed -->

## Technical Notes

### Database Changes
- New column on `ticket` table: `summary TEXT` (nullable)
- New column on `ticket` table: `summaryUpdatedAt INTEGER` (nullable, epoch ms)
- Single migration file for both columns

### VRW Skills

**`summarize-epics`** skill:
- Tools: `BASE_TOOLS` + `JIRA_READ_TOOLS`
- Timeout: 5 minutes (may need to read many epics)
- Output format: `json`
- Prompt strategy: for each epic, read title + description + child ticket titles, produce a concise domain-focused summary (max 2 sentences, ~150 chars)

**`suggest-epic`** skill:
- Tools: `BASE_TOOLS` (no Jira needed, summaries are passed in args)
- Timeout: 90 seconds (lightweight matching task)
- Output format: `json`
- Prompt strategy: given the ticket context and epic summaries, rank epics by relevance. Return top 3 with confidence and reasoning.

### Epic Summary Content Guidelines
Summaries should capture:
- The domain/area the epic covers (e.g., "Authentication and session management")
- The goal or outcome (e.g., "Migrate to OAuth2 for all API consumers")
- NOT status, dates, or sprint info (those change too often)

### API Response Shape

```typescript
// GET /api/epics (extended)
interface EpicListItem {
  key: string;
  name: string;
  status: string;
  childCount: number;
  summary: string | null;       // New
  summaryStale: boolean;        // New
}

// POST /api/tickets/[key]/suggest-epic response (after VRW completes)
interface EpicSuggestion {
  key: string;
  name: string;
  confidence: "high" | "medium" | "low";
  reason: string;               // 1 sentence why this epic fits
}
```

### Performance Considerations
- Epic summaries are sent as a single string blob in VRW args (~2-5KB for 30-50 epics). This is well within prompt limits.
- The `suggest-epic` skill should be fast (no Jira lookups, no file reads) since all context is passed in args.
- Summary generation is heavier but runs infrequently (on-demand or after major syncs).

## Out of Scope (for now)

- Auto-suggesting epic on ticket creation (could be a follow-up)
- Suggesting creation of a NEW epic if none fit well
- Bulk re-assignment of tickets to suggested epics
- Summary generation triggered by Jira webhooks (manual/on-sync only for now)
