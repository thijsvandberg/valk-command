# VC-025: Story Writer

**Status:** In Progress
**Priority:** High

## Description

As the PO, I want to improve Jira story descriptions by chatting with the remote workspace's AI while editing in a markdown editor, so I can iteratively refine stories with AI assistance and push the result to Jira.

## Core Concepts

- **Conversational**: First message triggers the `write-story-draft` skill on the workspace, follow-ups resume the same CLI session
- **Two-draft model**: Remote draft (from workspace) and local draft (user edits), with merge UI when they diverge
- **Hybrid session persistence**: Workspace is stateful (CLI sessions on disk), VC stores conversation mirror, recovery on session loss sends current state (not full history)
- **Push from VC**: Uses existing markdown-to-ADF conversion and push-to-jira endpoint

## Acceptance Criteria

### Phase 1: Foundation (backend)
- [x] `storyWriterSession` table in schema with migration
- [x] Types for story writer (`/src/types/story-writer.ts`)
- [x] Draft parser utility (`extractStoryDraft` from `<story-draft>` tags)
- [x] Session CRUD API (`GET/POST/PATCH/DELETE /api/tickets/[key]/story-writer`)
- [x] Active sessions API (`GET /api/story-writer/active-sessions`)
- [x] Unit tests for parser and session CRUD

### Phase 2: Workspace communication
- [x] Message proxy API (`POST /api/tickets/[key]/story-writer/messages`)
- [x] Apply-draft API (`POST /api/tickets/[key]/story-writer/apply-draft`)
- [x] First message vs follow-up routing (skill invocation vs session resume)
- [x] Session recovery on workspace 410 (lost session)
- [x] Tests for proxy and apply-draft

### Phase 3: Frontend
- [x] `useStoryWriter` hook (session, messages, drafts, streaming)
- [x] `StoryWriterChat` component (chat panel with streaming)
- [x] `StoryWriterEditor` component (RichEditor + diff tab)
- [x] `MergeBar` component (accept remote / keep local / merge)
- [x] `StoryWriterLayout` component (split view)
- [x] Page at `/tickets/[key]/write`
- [x] Route manifest updated

### Phase 4: Integration
- [x] "Write Story" buttons on SidePanel and ticket detail page
- [ ] Sprint board session indicator badges
- [x] Review Story integration (existing ReviewPopover)
- [x] Push to Jira from editor (uses existing endpoint, session stays active)
- [x] Delete session functionality

### Phase 5: Remote workspace (separate repo)
- [x] `POST /api/conversations/:id/messages` endpoint
- [x] `enqueueMessage()` on TaskQueue (resume session, no skill prompt)
- [x] `write-story-draft.md` skill (stripped-down story writer)
- [x] Skill registration

## Technical Notes

- Plan file: `~/.claude/plans/wiggly-frolicking-tarjan.md`
- Two systems kept strictly separate: valk-command (this repo) and valk-remote-workspace
- Reuses: RichEditor, StoryDiff (interactive mode), MessageList/Input, ReviewPopover, useWorkspaceTask, push-to-jira
- `<story-draft>` tags as contract between workspace skill and VC frontend

## Dependencies

- Existing push-to-jira flow (VC-017, VC-024)
- Existing review system (VC-013)
- Existing rich editor (VC-006)
- Existing story diff (VC-004)
