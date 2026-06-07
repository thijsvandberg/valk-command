# BRDG-293: Epic breakdown generation

**Epic:** [BRDG-291](BRDG-291-epic-writer.md)
**Status:** Done
**Priority:** High

## Description

As a PO, I want the AI to ask clarifying questions and then propose a breakdown of the epic into
child stories (titles, then bullet lists), which I can refine by sparring, so I can shape the set
of stories before anything is created.

## Acceptance Criteria

- [x] New phase-aware VRW skill `break-down-epic` (alongside `write-story-draft`), receiving epic
      context + children + Confluence text + attachments + optional codebase research
- [x] Discovery phase: AI emits `<epic-questions>`; PO answers in chat
- [x] Breakdown phase: AI emits `<epic-breakdown>` (JSON array: `title`, `bullets[]`, optional
      `body`, `suggestedLinks[]`, `suggestedSprintId?`)
- [x] New table `epic_child_draft` stores cards (status `draft`); parsed from skill output
- [x] `BreakdownBoard` renders `ChildStoryCard`s (title + bullets) with a depth badge
- [x] Default detail level is title + bullets (not fully worked out in one pass)
- [x] Sparring updates the breakdown ("split card 3", "add a story for X", "remove card 5")
- [x] AI may propose a sharpened epic summary (handled via the BRDG-292 epic draft flow)
- [x] Tests for: skill output parsing (questions + breakdown), card persistence, board rendering

## Technical Notes

- Route `apply-output` parses `<epic-questions>` / `<epic-breakdown>` into session state + cards.
- Phase-aware request: send current phase + existing breakdown so the skill returns the right block.
- Codebase research happens in VRW (it has the repo).

## Dependencies

[BRDG-292](BRDG-292-epic-writer-foundation.md) (session, phases, chat).
