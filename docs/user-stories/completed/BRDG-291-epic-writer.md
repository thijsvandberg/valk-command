# BRDG-291: Epic Writer (EPIC)

**Type:** Epic
**Status:** Completed
**Priority:** High

## Description

As a Product Owner, I want to work out an epic collaboratively with AI, the way the Story Writer
works for a single story, so I can take an existing or near-empty epic, spar about what is needed,
break it down into child stories, detail them, and place them into sprints, over multiple sessions.

This is implemented as an "epic mode" of the existing Story Writer (extend, do not fork). It is a
long-lived, resumable, phase-based session opened from epic detail. All AI runs on the remote
workspace (VRW) via a new phase-aware `break-down-epic` skill.

Full plan: [docs/plans/2026-06-04-epic-writer.md](../plans/2026-06-04-epic-writer.md).

## Phases (non-linear, sparring available in every phase)

1. Feed content (epic, children, Confluence, attachments, codebase, notes)
2. Discovery (AI asks questions, PO answers)
3. First breakdown (story titles)
4. Refine breakdown (bullets per story)
5. Detail stories (full body + AC, one or more at a time)
6. Sprint planning (create-in-jira + assign to sprints)

## Confirmed product decisions

- DRAFT-first; a per-card "Create in Jira" button promotes a card to a real Jira issue under the epic.
- Create-in-Jira placement choice: specific sprint, "to be planned" (backlog), or default sprint.
- Sprint assignment requires the story to already live in Jira.
- Default detail level is title + bullets; full detail on demand per card.
- Inter-story links: AI proposes, PO confirms. Epic-child links always created.
- The epic itself is refined via the regular single-story draft flow.
- Default sprint reuses the existing `default_sprint_id` setting.
- Session is resumable across days; chat, cards, depth, and sprint state persist.

## Child stories

- [x] [BRDG-292](../completed/BRDG-292-epic-writer-foundation.md) - Epic Writer foundation (session, phases, chat, epic enrichment)
- [x] [BRDG-293](../completed/BRDG-293-epic-breakdown-generation.md) - Breakdown generation (VRW skill, board, DRAFT cards)
- [x] [BRDG-294](../completed/BRDG-294-epic-child-story-detailing.md) - Child-story detailing (deepen to full body/AC)
- [x] [BRDG-295](../completed/BRDG-295-epic-create-in-jira-linking.md) - Create in Jira + linking
- [x] [BRDG-296](../completed/BRDG-296-epic-sprint-placement.md) - Sprint placement

## Notes

Stories are vertically sliced so each is shippable on its own and builds on the previous one.
BRDG-292 alone delivers value (spar with AI + refine the epic).

## Related: placeholder tickets (BRDG-304)

[BRDG-304](BRDG-304-placeholder-tickets.md) introduces the same underlying concept from a
different angle: a **local-until-promoted ticket** that lives in Bridge, carries content
(and BV/estimate), shows up in the grouped sprint/epic views, and has a **promote / "Create
in Jira"** action that creates the real issue under the epic with sprint placement happening
at/after creation.

The Epic Writer's `epic_child_draft` + `create-in-jira` path (BRDG-292 foundation,
BRDG-295 create-in-jira/linking) and BRDG-304's `placeholderTicket` + promote endpoint are
two models for the same "provisional ticket" abstraction. The difference is origin (AI-
generated breakdown cards vs manually placed forward-planning markers) and surface (writer
canvas vs board/epic rows). If/when both are built, consider a shared provisional-ticket
model + a single promote-to-Jira service that both consume, plus shared "provisional" row
styling. Flagged here for later; not being restructured now.
