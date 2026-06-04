# BRDG-292: Epic Writer foundation

**Epic:** [BRDG-291](BRDG-291-epic-writer.md)
**Status:** Not Started
**Priority:** High

## Description

As a PO, I want to open an Epic Writer session from epic detail, spar with AI about the epic, and
refine the epic's own description, so I have a resumable working surface before any breakdown
exists. This is the foundation the other Epic Writer stories build on.

## Acceptance Criteria

- [ ] "Work out Epic" entry point on epic detail (mirrors "Write Story" on a ticket)
- [ ] Works on a near-empty epic (thin/empty description is a valid starting point)
- [ ] Implemented as an epic mode of the existing Story Writer (`story_writer_session` with
      `mode: "epic"`); reuses the full-screen canvas and `StoryWriterChat`
- [ ] New `phase` column on the session; a `PhaseRail` shows phases and allows free movement
- [ ] Session is resumable: closing and reopening restores phase + chat history
- [ ] Context feeding: epic, child stories, linked Confluence pages, attachments available to the AI
- [ ] AI runs on VRW; chat turns invoke the workspace (no direct LLM call in Bridge)
- [ ] Epic enrichment via the regular single-story draft flow (epic as subject ticket;
      local edit -> explicit push to Jira)
- [ ] Tests for: session create/resume, phase persistence, epic-mode context assembly

## Technical Notes

- Reuse `story_writer_session`, `agent-proxy`, `task-stream-handler`, `useStoryWriter`.
- New route group `/api/epics/[key]/writer/...`: `session` (GET/create/resume), `phase` (PATCH),
  `messages` (chat -> skill).
- Epic enrichment reuses `ticketLocalEdit` + push-to-Jira with the epic as subject.

## Dependencies

None (first story of the epic).
