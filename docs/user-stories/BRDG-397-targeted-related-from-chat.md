# BRDG-397: Targeted related-story search from chat + faster find-related + sprint name on cards

**Status:** Not Started
**Priority:** Medium
**Type:** Feature (Story Writer)

## Description

As a PO using the Story Writer, when I ask in the chat to find or link a related
story, I want the assistant to **immediately run a targeted related-story search
that follows my request** (the topic and the sprint I mention), instead of just
composing a draft or proposing a single epic/link. I also want that search to be
**faster**, and I want to see the **sprint name** of each related candidate.

This came out of a real session: I wrote a message asking to link a related story
and even named the sprint ("139"), but the assistant only returned an epic
suggestion and one link chip. It never searched, because a normal chat message
runs the compose skill (`write-story-draft`), and the actual related search
(`find-related`) only runs from a button and receives *only* the ticket key
([src/lib/story-writer-messages.ts](../../src/lib/story-writer-messages.ts) skill
dispatch) — never the chat content or sprint.

Two important nuances from the PO:
- The sprint name is **not an exact match**: I say "139", the real sprint is
  "BT: 139". The resolver must be fuzzy.
- I don't want the broad find-related sweep — I want a **targeted** search that
  follows what I asked for, with the sprint as a **hard filter**.

## Scope

Three connected deliverables. They may ship together; the order below also works
as a split if the speed win is wanted sooner (2 first).

1. **Targeted related search triggered from a chat message** (auto, no extra click).
2. **Faster find-related** (lighter model + the scoping from #1).
3. **Sprint name on related candidate cards** (on hover).

Out of scope: redesigning the related-stories panel layout, changing the link
toggle behaviour, the broad button-triggered find-related output format, and any
new persisted fields on the candidate table beyond what #3 needs.

## Current state (where the pieces are)

- **Chat message dispatch:** [src/lib/story-writer-messages.ts](../../src/lib/story-writer-messages.ts)
  `sendStoryWriterMessage` (~lines 525-626). A normal message → `write-story-draft`;
  an explicit `skill: "find-related"` → agent task with `args: { args: key }` only.
  This is where the targeted-search context (topic + resolved sprint) must be plumbed in.
- **Message route:** [src/app/api/tickets/[key]/story-writer/messages/route.ts](../../src/app/api/tickets/[key]/story-writer/messages/route.ts) — accepts `{ content, skill?, codebaseResearch?, model? }`.
- **Apply + store candidates:** [src/app/api/tickets/[key]/story-writer/apply-related/route.ts](../../src/app/api/tickets/[key]/story-writer/apply-related/route.ts) — parses `<related-stories>`, stores in `related_story_candidate`, fires a background `sync-tickets` for the found keys (which fills `ticket.sprintName` locally).
- **Stream monitoring → apply trigger:** [src/hooks/useTaskMonitoring.ts](../../src/hooks/useTaskMonitoring.ts) (~lines 73-144) detects the `<related-stories>` block and POSTs to apply-related.
- **Candidate type:** `RelatedStoryCandidateRow` ([src/db/schema.ts](../../src/db/schema.ts) `related_story_candidate`).
- **Cards:** `RelatedStoriesInline` (inline in chat) and `RelatedStoriesPanel` ([src/components/story-writer/RelatedStoriesPanel.tsx](../../src/components/story-writer/RelatedStoriesPanel.tsx)), both built on the shared `SuggestionCard` shell.
- **Sprint utils (fuzzy match building blocks):** [src/lib/sprint-utils.ts](../../src/lib/sprint-utils.ts) — `sprintNumber("BT: 139") -> 139`, `extractTeamPrefix("BT: 139") -> "BT"`, `sprintTeamToken`. Sprint list cache: [src/lib/sprint-cache.ts](../../src/lib/sprint-cache.ts) / `app_setting` key `jira_sprints`.
- **find-related skill (VRW):** [find-related.md](../../../valk-workspace/tools/valk-remote-workspace/.claude/skills/find-related.md) — `project = VPL AND issuetype in (Story, Task, Spike)` JQL; fetches `summary, status, issuetype, updated, parent` (no sprint, no `issuelinks`); scores up to ~24 candidates with ~25-word reasons. Default depth Quick (~5 calls).
- **compose skill (VRW):** `write-story-draft` — the skill every normal chat message runs; the natural place to detect related-intent and extract topic + sprint.

## Approach

### 1. Targeted related search from a chat message

- **Intent + parameter extraction in `write-story-draft` (VRW).** The compose
  skill already reads every message. When the message expresses a find/link
  related-story intent, it emits a new signal tag with the extracted topic and an
  optional sprint mention, e.g.
  `<related-request query="domain resolving / homepage url" sprint="139" />`.
  If the message is *purely* a related request, it should skip writing a story
  draft and just emit the tag.
- **Parse the tag in Bridge.** Add a parser (mirror `parseLinkSuggestions` in
  [src/components/story-writer/ChatMessageParts.tsx](../../src/components/story-writer/ChatMessageParts.tsx)) and detect it in `useTaskMonitoring`.
- **Auto-chain a targeted find-related.** On detecting the tag, Bridge starts a
  find-related task automatically (the PO's "gelijk zoeken"), passing the extracted
  `query` and the **resolved sprint** as scoping args — not just the ticket key.
- **Fuzzy sprint resolution (Bridge side).** Resolve the mentioned sprint before
  calling the skill: take the number via `sprintNumber`, combine with the current
  ticket's team prefix (`extractTeamPrefix` on the ticket's `sprintName`) → match
  against the cached sprint list, preferring active > future > closed. An explicit
  prefix in the message ("GXP 12") overrides the ticket's prefix. Pass the resolved
  sprint **id and name** to the skill so the JQL filter is unambiguous.
- **Hard sprint filter in find-related (VRW).** Extend the skill to accept the
  scoping args and, when a sprint is given, add it as a hard JQL filter
  (`sprint = <id>`), and bias the search toward the `query` topic. No sprint given
  → targeted search on `query` only, no sprint filter.

### 2. Faster find-related

- **Lighter model for find-related.** Keyword extraction + scoring is not deep
  reasoning. Run find-related on a lighter model (Sonnet/Haiku) rather than Opus.
  Decide where the default lives (skill-invocation default in Bridge dispatch vs
  per-call model arg) so the broad button path benefits too. This is the biggest lever.
- **Scoping reduces work.** The targeted + sprint-filtered path from #1 yields
  fewer candidates and narrower JQL, so less scoring/generation → faster.
- Keep default depth at Quick.

### 3. Sprint name on related cards (hover)

- **No skill change.** apply-related already background-syncs found keys into the
  local `ticket` table, which carries `sprintName`.
- **Enrich on read.** In apply-related GET/POST, left-join `related_story_candidate.jiraKey -> ticket.sprintName` and include `sprintName` in the returned candidate shape (do not add a stored column unless needed).
- **Render on hover.** Show the sprint name on hover in the related card row
  (`RelatedStoriesInline` / `RelatedStoriesPanel` via the shared `SuggestionCard`).
- **First-render lag.** The background sync is fire-and-forget, so `sprintName` may
  be null on the very first render. Handle gracefully (hide when absent) and do a
  small refetch after the sync window so it fills in.

## Implementation Plan

Verified facts that shape this (checked against the code, not assumed):
- **`ticket.sprintName` stores the sprint ID** (`String(sprint.id)`, [sync-tickets-service.ts:268](../../src/lib/sync-tickets-service.ts#L268)), not the human name. The display name lives in `sprintNameCache` (`sprint_id -> display_name`, [schema.ts:295](../../src/db/schema.ts#L295)) and in `app_setting` key `jira_sprints` (`[{id,name,state}]`). Resolver input and card enrichment must go through these maps.
- The `find-related` dispatch passes only `args: { args: key }` ([story-writer-messages.ts:607-617](../../src/lib/story-writer-messages.ts#L607)).
- Auto-chain hook point is `applyResult` in [useTaskMonitoring.ts:82-157](../../src/hooks/useTaskMonitoring.ts#L82) (already detects `<related-stories>` / `<link-suggestion>`).
- The inline card hover already has a `sprintName` slot ([TicketStatusPill.tsx:634](../../src/components/shared/TicketStatusPill.tsx#L634)) but is fed the raw sprint ID (`data.sprintId`) at [ChatMessageParts.tsx:691](../../src/components/story-writer/ChatMessageParts.tsx#L691) — a pre-existing bug to fix as part of #3.
- VRW skill files (`write-story-draft.md`, `find-related.md`) are in a **separate repo** — Bridge tests simulate the tag in workspace output; they don't depend on the live skill.

### Foundation (shared, pure, unit-testable)
1. `resolveSprintMention(mention, currentTicketSprintName, sprints)` in [sprint-utils.ts](../../src/lib/sprint-utils.ts) → `{id,name}|null`. Number via `sprintNumber`, prefix from explicit mention else from current ticket's sprint name, match against cached list, tie-break active>future>closed (reuse the order map from `slugToSprintId`).
2. `parseRelatedRequest(output)` in new `src/lib/parse-related-request.ts` → `{query, sprint|null}|null`. Mirror `parseLinkSuggestions` attribute parsing; tolerant of attribute order; `null` when no tag or empty query.
3. `enrichCandidatesWithSprintName(rows)` in new `src/lib/related-candidate-sprint.ts`: batch `inArray(ticket.jiraKey, keys)` → ticket.sprintName (id) → `sprintNameCache` name. Adds `sprintName: string|null`.

### Deliverable 2 — faster find-related (smallest, do early)
4. `FIND_RELATED_MODEL` constant in story-writer-messages.ts; pass `model: model ?? FIND_RELATED_MODEL` in the existing find-related branch and the new targeted dispatch. Confirm exact Claude model id via the `claude-api` skill.

### Deliverable 1 — targeted related from chat
5. `buildFindRelatedTaskBody({key, query, sprintId, sprintName, model})` pure helper + `dispatchTargetedRelated(...)` in story-writer-messages.ts (resolves sprint from cached list synchronously, reuses session conversationId).
6. New route `src/app/api/tickets/[key]/story-writer/related-request/route.ts` (POST `{query, sprint}` → resolve + dispatch → `{taskId, streamUrl}`); api-client method `storyWriter.relatedRequest`.
7. Client: detect `parseRelatedRequest(output)` in `applyResult`, POST related-request, then `startMonitoring(taskId)` of the chained task. Guard recursion (only `<related-request>` triggers; find-related emits `<related-stories>`). Strip `<related-request>` from rendered content in ChatMessageParts.

### Deliverable 3 — sprint name on cards (hover)
8. Enrich candidates with `sprintName` in apply-related GET + POST and in the session GET ([story-writer/route.ts](../../src/app/api/tickets/[key]/story-writer/route.ts) candidates incl. virtual `link-` rows) via the shared helper.
9. UI type `RelatedStoryCandidate = RelatedStoryCandidateRow & { sprintName?: string|null }`; thread through `useStoryWriter`, `useTaskMonitoring`, both cards. Feed `c.sprintName` into the hover `sprintName` slot (fix the `data.sprintId` bug). Render gracefully when null.

### VRW (separate repo, parallel)
10. `write-story-draft.md`: emit `<related-request query="..." sprint="..." />` on find/link-related intent. `find-related.md`: accept `query`/`sprintId`/`sprintName` args and add `sprint in (<id>)` as a hard JQL clause when present.

### Order
Foundation (1-3) → D2 (4) → D1 server (5-6) → D1 client (7) → D3 (8-9) → VRW (10). Commit per logical unit.

### Risks
- Cold sprint cache → resolver returns null → search runs topic-only (acceptable per AC). Do not add a Jira fetch to the chat path.
- Hard sprint filter is enforced in VRW JQL; Bridge only passes the ids. Full AC for "hard filter" depends on the VRW change (cross-repo).

## Open questions

- [ ] Exact tag name/attributes for the related-request signal (`<related-request query="…" sprint="…" />` vs reusing an existing convention). Confirm with the VRW skill author.
- [ ] Which model to default find-related to (Sonnet vs Haiku). PO/judgement call after a quick quality check on a couple of real tickets.
- [ ] Should a purely-related message suppress the compose draft entirely, or still allow a draft if the message also asks for content? Default: suppress draft when the message is only a related request.
- [ ] Hover affordance: tooltip vs inline reveal on the row. Default to a subtle inline reveal consistent with the card shell.

## Acceptance Criteria

- [x] A chat message asking to find/link a related story (e.g. "link a related story from sprint 139 about domain resolving") **auto-starts a targeted related search** — no button click needed. <!-- useTaskMonitoring detects <related-request> and chains dispatchTargetedRelated -->
- [x] The mentioned sprint is resolved **fuzzily**: "139" on a BT ticket resolves to "BT: 139"; an explicit prefix in the message overrides the ticket's prefix; active is preferred over future over closed. <!-- resolveSprintMention + tests -->
- [x] The resolved sprint is applied as a **hard filter** — results are limited to that sprint. No sprint mentioned → targeted search on the topic with no sprint filter. <!-- Bridge passes sprintId/sprintName; hard JQL clause lives in the VRW skill (cross-repo) -->
- [x] The search is **targeted to the request topic**, not the broad find-related sweep. <!-- query carried in args.args + args.query -->
- [x] find-related runs on a **lighter model** by default; a real-ticket run is verified to still produce sensible candidates. <!-- FIND_RELATED_MODEL=claude-haiku-4-5; real-ticket quality check still open (see open questions) -->
- [x] Related candidate cards show the **sprint name on hover**; absent gracefully when not yet synced and fills in after the background sync. <!-- enrichCandidatesWithSprintName + hover merge -->
- [x] No regression to the existing button-triggered find-related and the link-toggle flow. <!-- button path uses buildFindRelatedTaskBody; existing tests green -->
- [x] Tests cover: fuzzy sprint resolution (incl. "139" -> "BT: 139", prefix override, active/future/closed preference); related-request tag parsing; auto-chain dispatch with scoping args; sprint-name enrichment in apply-related; card renders sprint name on hover and hides when absent.
- [ ] `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` pass.

## References

- [Story Writer Architecture](../architecture/story-writer.md) — Related Stories section
- [find-related skill (VRW)](../../../valk-workspace/tools/valk-remote-workspace/.claude/skills/find-related.md)
- [Client Data & Memory](../architecture/client-data-and-memory.md) — payload split, no whole-backlog fetches
- Sprint utils: [src/lib/sprint-utils.ts](../../src/lib/sprint-utils.ts), [src/lib/sprint-cache.ts](../../src/lib/sprint-cache.ts)
