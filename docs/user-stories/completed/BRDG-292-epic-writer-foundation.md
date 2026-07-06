# BRDG-292: Epic Writer foundation

**Epic:** [BRDG-291](BRDG-291-epic-writer.md)
**Status:** Not Started
**Priority:** High

## Description

As a PO, I want to open an Epic Writer session from epic detail, spar with AI about the epic, and
refine the epic's own description, so I have a resumable working surface before any breakdown
exists. This is the foundation the other Epic Writer stories build on.

## Implementation Plan

Foundation only. Breakdown generation, the `break-down-epic` VRW skill, and the breakdown board are
out of scope (BRDG-293+). No VRW work in this story: chat turns reuse the already-deployed
`write-story-draft` skill with the epic as subject (epic enrichment).

**Reuse, do not fork:** same `story_writer_session` table (new `mode` + `phase` columns), the shared
`story-writer-messages` server lib, `useStoryWriter`, and `StoryWriterChat`. New surface is the epic
route group, phase persistence, epic-mode context assembly, `PhaseRail`, and `EpicWriterLayout`.

### 1. Schema / Migration (AC3, AC4)
- `src/db/schema.ts`: extend `storyWriterSession`:
  - `mode: text("mode", { enum: ["story","epic"] }).notNull().default("story")`
  - `phase: text("phase", { enum: ["feed","discovery","breakdown","refine","detail","sprints"] }).notNull().default("feed")`
  - NOT NULL + defaults keep every existing row and the story-path INSERT valid (backward-compatible).
- Run `npm run db:generate` (drizzle-kit) -> `drizzle/0071_*.sql` + journal, then `npm run db:migrate`.

### 2. API routes (new group `/api/epics/[key]/writer/`)
Thin routes that delegate to the shared lib; the epic is a `ticket` row of type `epic`, so all FKs
resolve and session keying = epic key.
- `session/route.ts`: GET (active epic-mode session + messages + phase + drafts; resume), POST
  (create with `mode:"epic"`, snapshot epic description as `localDraft`; near-empty epic -> `""`),
  reusing the existing active-session conflict guard.
- `phase/route.ts`: PATCH `{ phase }` -> updates `story_writer_session.phase` (free movement, no
  transition guard).
- `messages/route.ts`: POST chat turn -> `sendStoryWriterMessage` (epic-mode context) via
  `agentFetch("/api/tasks")` + `captureTaskStream`. No direct LLM in Bridge.
- Epic enrichment (AC8) reuses existing `apply-draft` + `push-to-jira` keyed by the epic key.

### 3. Context assembly (AC2, AC6, AC8)
- `src/lib/story-writer-messages.ts`: add `buildEpicContext(key)` and branch `buildFirstMessageBody`
  on epic mode to append: child stories (mirror `/api/epics/[key]/tickets` filtering), linked
  Confluence pages (titles + URLs from `ticketConfluenceLink`), attachments (filenames/types from
  `ticketAttachment`). Skip the story-only epic-suggestion block; suppress title suggestions for
  epics. Skill stays `write-story-draft`.

### 4. Entry point + writer page (AC1)
- No epic detail view exists. Add a "Work out Epic" link on `src/app/(app)/epics/EpicRow.tsx`
  (mirrors "Write Story"), routing to a new page `src/app/(app)/epics/[key]/write/page.tsx` that
  renders `EpicWriterLayout`.

### 5. Client hook + components (AC3, AC4, AC5)
- `useStoryWriter(key, { mode })`: thread optional `mode` into `createSession`; add `setPhase(phase)`
  action (PATCH phase + local state update). One hook, no fork.
- `EpicWriterLayout` (`src/components/epic-writer/`): reuses `useStoryWriter(epicKey, {mode:"epic"})`
  and the pane system hosting `StoryWriterChat`; strips split-mode + epic-picker. Keep save / push.
- `PhaseRail`: 6 phase pills, current from `session.phase`, click -> `setPhase` (persisted bookmark
  only in 292; does not gate behavior).

### 6. api-client
- `src/lib/api-client.ts`: thin `epicWriter` object (`getSession`/`createSession`/`patchSession`/
  `sendMessage` against the new group + `setPhase`); reuses existing apiFetch plumbing.

### 7. Tests (AC9) — co-located `*.test.ts`
- session route test: create with `mode:"epic"` -> row has `mode="epic"`, `phase="feed"`, near-empty
  epic -> `localDraft===""`; GET restores session + messages + phase (resume).
- phase route test: PATCH `discovery` -> GET returns it; free movement (feed after detail) succeeds.
- `story-writer-messages` test: seed epic + children + confluence link + attachment, mock
  `agentFetch`; assert task args include child keys/confluence titles/attachment filenames, skill is
  `write-story-draft`, epic-suggestion block omitted, no direct LLM call.

### 8. Build / verify order
Schema -> generate/migrate -> routes + lib + server tests (`npm run test`) -> hook/components ->
page + entry. Final: `npm run verify` + `npm run build`.

### 9. VRW callout
None for BRDG-292. `break-down-epic` skill is BRDG-293.

### 10. Open questions (non-blocking; defaults chosen)
- Phase is a persisted marker only in 292 (no gating) — assumed acceptable.
- Confluence fed as titles + URLs (not full bodies) to bound token cost — full-body feed deferred.
- Push-to-Jira assumes the epic description field is updatable via the existing path; verify against
  Jira during implementation (local edit/draft flow is unaffected either way).

## Acceptance Criteria

- [x] "Work out Epic" entry point on epic detail (mirrors "Write Story" on a ticket)
- [x] Works on a near-empty epic (thin/empty description is a valid starting point)
- [x] Implemented as an epic mode of the existing Story Writer (`story_writer_session` with
      `mode: "epic"`); reuses the full-screen canvas and `StoryWriterChat`
- [x] New `phase` column on the session; a `PhaseRail` shows phases and allows free movement
- [x] Session is resumable: closing and reopening restores phase + chat history
- [x] Context feeding: epic, child stories, linked Confluence pages, attachments available to the AI
- [x] AI runs on VRW; chat turns invoke the workspace (no direct LLM call in Bridge)
- [x] Epic enrichment via the regular single-story draft flow (epic as subject ticket;
      local edit -> explicit push to Jira)
- [x] Tests for: session create/resume, phase persistence, epic-mode context assembly

## Technical Notes

- Reuse `story_writer_session`, `agent-proxy`, `task-stream-handler`, `useStoryWriter`.
- New route group `/api/epics/[key]/writer/...`: `session` (GET/create/resume), `phase` (PATCH),
  `messages` (chat -> skill).
- Epic enrichment reuses `ticketLocalEdit` + push-to-Jira with the epic as subject.

## Dependencies

None (first story of the epic).
