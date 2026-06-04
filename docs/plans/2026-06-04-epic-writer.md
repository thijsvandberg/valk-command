# Epic Writer

Plan for an AI-assisted epic breakdown feature, built as an "epic mode" of the existing Story
Writer rather than a separate surface. It produces a set of child-story drafts and refines the
epic itself, as a long-lived, resumable, phase-based session rather than a single top-to-bottom run.

Status: proposed (awaiting "go ahead" before implementation)

## Goal

Take an existing or near-empty epic and, using all context known within it (the epic itself,
its child stories, linked Confluence pages and attachments, plus relevant codebase research),
work it out collaboratively with AI over time: feed content, spar and answer questions, get a
first breakdown, refine it, detail individual stories, and slot stories into sprints. The PO can
leave and resume the session later; nothing has to be finished in one sitting.

## Entry point and surface

- Opens from **epic detail** ("Work out Epic"), the same way "Write Story" opens on a ticket.
- The epic may be near-empty; that is a supported starting point.
- Implemented as an **epic mode of the existing Story Writer** (extend, do not fork): reuse its
  full-screen canvas so there is room for chat + breakdown board. The epic is the session's
  subject ticket.
- **The epic itself is refined via the regular draft flow**: it gets a draft like any single story
  (local edit -> PO pushes to Jira explicitly), in parallel with generating child stories.

## Core principle: phases, not a pipeline

The work moves through phases, but it is NOT linear. The PO can jump back, redo a phase, or work
on several stories at different depths at once. "Sparring" (free chat with the AI) is available in
every phase, not a separate step. The session persists and is resumable across days.

```
[1] Feed content        gather + add epic context, Confluence, attachments, codebase, notes
        | spar
[2] Discovery           AI asks questions <-> PO answers; align on what needs to be done
        | spar
[3] First breakdown     AI proposes story titles (skeleton list, e.g. ~10)
        | spar
[4] Refine breakdown    process feedback -> each story gets a bullet list of its content
        | spar
[5] Detail stories      work out one or more stories in full (description + AC), in parallel
        | spar
[6] Sprint planning     create-in-jira + assign to sprints; a story must be live in Jira to be
                        placed, so this runs at/after Create-in-Jira (interleaved with [4]/[5])

         (resumable at any phase; leave and continue later)
```

A `phase` field on the session records where the PO is; the UI lets the PO move between phases
freely. Each phase has its own AI affordance but shares the same chat thread and breakdown board.

## Product decisions (confirmed)

- **DRAFT first, then explicit "Create in Jira":** generated child stories live as local DRAFT
  cards in Bridge while being worked out. A per-card **"Create in Jira"** button promotes a card to
  a real Jira issue under the epic. Nothing lands in Jira until the PO presses it.
- **Create-in-Jira placement choice:** when promoting, the PO chooses where it goes:
  a specific sprint, "to be planned" (backlog / no sprint), or a default sprint.
- **Sprint assignment requires a Jira issue:** a DRAFT cannot be assigned to a real sprint. From
  the moment a story needs a sprint it must already live in Jira; so sprint placement happens at
  (or after) the Create-in-Jira step, never on a pure DRAFT.
- **Default detail level:** title + bullet list per story. Full description/AC only on demand,
  per card (the "Detail stories" phase). The breakdown is not fully worked out in one pass.
- **Inter-story links:** the AI proposes dependencies/order (e.g. blocks, relates to) as
  suggestions; the PO confirms each link before it is created. Epic-child links are always created.
- **Resumable:** the session is long-lived. The PO can close the tab mid-phase and pick up later;
  chat history, draft cards, per-story depth, and sprint allocation all persist.

## Layout

```
Epic Detail -> "Work out Epic" -> Epic Writer session
   top:    Phase rail (1 Feed | 2 Discovery | 3 Breakdown | 4 Refine | 5 Detail | 6 Sprints)
   left:   Chat (ask, answer, spar, steer)              [reuse StoryWriterChat]
   right:  Breakdown board
           - Epic summary (refined / sharpened, pushable to the epic as a draft)
           - Child-story cards: title -> bullets -> full body, each with a depth badge
             per card: [deepen] [link to...] [Create in Jira v]   (v = placement menu)
           - state per card: DRAFT (local) -> created (live in Jira, shows Jira key + sprint)
```

The **Create in Jira** button carries a placement menu: pick a sprint, "to be planned" (backlog),
or the default sprint. Sprint controls only appear once a card is live in Jira.

## Reuse (already exists)

- **Session / chat / agent streaming:** `story_writer_session`, `agent-proxy`,
  `task-stream-handler` (SSE), `useStoryWriter`, `StoryWriterChat`. Full plumbing for
  send-to-workspace / stream-back / retry / execution-log is in place, and sessions already
  persist (the resume model is a natural extension).
- **Context gathering:** epic + children via `ticket.epicKey` (`/api/epics`); Confluence via
  `confluence-client` + `ticketConfluenceLink`; attachments via `ticketAttachment`; codebase
  research flag already exists in the story-writer message flow.
- **Create + link:** DRAFT tickets via `create-draft` -> `syncDraftToJira`; `ticketLink` for
  epic-child and story-story relations (bidirectional, as split mode already does).
- **Detailing a story** reuses the existing single-story `write-story-draft` path, so a child can
  graduate into a full Story Writer session.
- **EpicSuggestionCard** exists (child -> epic); Epic Writer inverts this (epic -> children).
- **Sprint support is already complete** and reused as-is:
  - Read available sprints: `GET /api/jira/sprints` / `jiraClient.getSprintsLightweight()`.
  - Assign an issue to a sprint: `POST /api/jira/move-sprint` -> `jiraClient.moveToSprint()`
    (sets `customfield_10007`); backlog via `moveToBacklog()`.
  - A ticket's current sprint is stored locally in `ticket.sprintName` (id) + `sprintNameCache`.
- **Epic enrichment** uses the regular single-story draft flow (`ticketLocalEdit` + push-to-Jira)
  with the epic as subject ticket.

## AI runs on VRW

All AI runs on the remote workspace (valk-remote-workspace), never as a direct LLM call in Bridge,
exactly like the Story Writer. Bridge only gathers context, parses skill output, and persists.

New workspace skill **`break-down-epic`** (alongside `write-story-draft`). It is phase-aware: the
request carries the current phase and the existing breakdown state; the skill responds with the
output block relevant to that phase. Codebase research happens in VRW (it has the repo).

Tagged output blocks:
- `<epic-questions>`  - discovery phase: targeted questions to the PO.
- `<epic-breakdown>`  - breakdown/refine phase: JSON array of stories
  `{ title, bullets[], body?, suggestedLinks[], suggestedSprint? }`.
- `<story-detail>`    - detail phase: full body + AC for one or more named stories.
- `<sprint-plan>`     - sprint phase: proposed allocation of stories across sprints.

## New work

1. **Workspace skill (VRW): `break-down-epic`** - phase-aware, emits the tagged blocks above.

2. **Database**
   - Reuse `story_writer_session` with `mode: "epic"` and a new `phase` column (keyed by epic key).
   - New table `epic_child_draft`: `sessionId`, `index`, `title`, `bullets` (JSON),
     `body` (nullable, filled in detail phase), `status` (draft | created),
     `jiraKey` (after Create-in-Jira), `suggestedSprintId` (AI suggestion, nullable),
     `suggestedLinks` (JSON: targetIndex + relation + confirmed flag).
     (Once created, the live sprint lives on `ticket.sprintName`, not duplicated here.)

3. **API routes** under `/api/epics/[key]/writer/...`
   - `session` - GET/create/resume; returns phase, chat, cards, and live sprint state per card.
   - `phase` - PATCH the current phase.
   - `messages` - chat turn -> invoke phase-aware `break-down-epic` skill.
   - `apply-output` - parse `<epic-questions>` / `<epic-breakdown>` / `<story-detail>` /
     `<sprint-plan>` into session state and `epic_child_draft`.
   - `create-in-jira` - promote one card to a real Jira issue under the epic, with placement
     (specific sprint | backlog | default sprint). Links it to the epic. Sprint set via the
     existing `moveToSprint` path; backlog leaves the sprint empty.
   - `link-children` - create confirmed inter-story links (local DB + Jira).
   - Sprint reassignment after creation reuses the existing `POST /api/jira/move-sprint`.

4. **UI** in `src/components/epic-writer/`
   - `EpicWriterLayout` - phase rail + chat + board (reuses `StoryWriterChat`).
   - `PhaseRail` - phase navigation showing progress and allowing free movement.
   - `BreakdownBoard` / `ChildStoryCard` - per-card actions (deepen, confirm suggested links,
     **Create in Jira** with placement menu) and a depth badge (title / bullets / full).
     Cards show DRAFT vs created (Jira key + current sprint) state.
   - `SprintPlacementMenu` - sprint picker (fed by `GET /api/jira/sprints`) with
     "to be planned" (backlog) and "default sprint" options. "Default sprint" reuses the existing
     setting `appSetting.default_sprint_id` via `GET /api/settings/default-sprint`
     (`apiClient.getDefaultSprint()`); an empty value there means backlog.

## Open / later

- Empty-epic handling: when the epic body is thin, the discovery phase carries more weight; the AI
  proposes a sharpened epic summary the PO pushes back to the epic via the regular draft flow.
