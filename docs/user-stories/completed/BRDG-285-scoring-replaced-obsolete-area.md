# BRDG-285: Scoring Topic — Replaced / Obsolete Area

**Status:** Planned
**Priority:** Medium
**Type:** Feature
**Epic:** [Backlog Deprecation Review](../plans/2026-06-04-backlog-deprecation-review-epic.md)

## Description

Scores how likely a ticket is obsolete because it concerns a **product/tech area that has been
replaced** (e.g. CWI, RezExchange, IDPMS, hybrid cloud — all superseded and no longer relevant). This
is the cheapest Tier-2 topic: an editable **deprecated-keyword/domain list** does most of the work, and
AI is used only to confirm context (avoid false hits where the term appears incidentally).

## Requirements

- **Editable list** of deprecated areas/keywords (name + optional aliases + optional note), managed in
  the UI — not hard-coded — so the PO can grow it over time. Stored locally.
- Keyword matcher over ticket title/description/labels/components produces a base score + records which
  terms matched (evidence).
- **AI confirmation step** (via the workspace agent) for matched tickets: confirm the ticket is really
  about the retired area (not an incidental mention), and write a one-line rationale
  (e.g. "About RezExchange, which has been replaced — no longer relevant").
- Writes `scanScores.replacedArea` + evidence; contributes to `scanOverall` and `scanRationale`.
- Runs inside the Tier-2 deep-dive runner (BRDG-284); throttled with the other AI topics.

## Testing

- Keyword matcher: hits, aliases, incidental-mention vs real, no-match.
- List editor CRUD (add/edit/remove keyword).
- AI confirmation result parsed into score + rationale (mock the agent).

## Implementation Plan

The topic plugs into the BRDG-284 registry. Components:

1. **Storage** — new table `deprecated_area_keyword` (`id`, `term`, `aliases` CSV, `note`,
   `createdAt`). A drizzle migration creates it and seeds CWI, RezExchange, IDPMS, hybrid cloud when
   the table is empty (idempotent seed-on-create inside the migration).
2. **Keyword matcher** (`src/lib/deprecated-area-matcher.ts`) — pure function over
   title/description/labels/components. Case-insensitive, word-boundary matching (no substring false
   hits), alias-aware, short-term safe. Returns a base score (0..1) + matched terms as evidence.
3. **AI confirmation** (`src/lib/agent-task-result.ts` + topic scorer) — reuse the proven
   submit-then-poll pattern from `epics/generate-summaries` (`POST /api/tasks`, then poll
   `GET /api/tasks/:id` until `status === "completed"`, read `task.output`). Extracted into a small,
   fully mockable `runAgentTaskToCompletion()` helper so BRDG-286/287/288 can reuse it. The scorer
   asks the agent to confirm the ticket is really ABOUT the retired area and return a one-line
   rationale. On any agent failure the scorer degrades to the matcher score at lower confidence and
   never throws.
4. **Scorer** (`src/lib/topics/replaced-area-topic.ts`) — `run()` abstains (null) on no match;
   otherwise returns score + evidence (matched terms, AI confirmation) + rationale. Registered at
   import; the topic key is `replaced` (matches SCAN_TOPICS, now flipped to `live: true`). The
   `EXAMPLE_RETIRED_AREA_SCORER` stub is superseded by this real scorer; it stays in
   `deprecation-topics.ts` only as a documented reference template (no longer the production path and
   not registered by default — the real scorer replaces it under the same `replaced` key).
5. **CRUD API** (`/api/cleanup/deprecated-areas`) + **management UI** at
   `/settings/deprecated-areas` (mirrors the Quick Prompts settings page convention).
6. **Registration** — imported once from the deep-scan runner module so the scorer registers before
   `runDeepScan` executes.

## Checklist

- [x] Invoke the `frontend-design` skill before any frontend work
- [x] Editable deprecated-keyword/domain list in the UI (seeded with CWI, RezExchange, IDPMS, hybrid cloud)
- [x] Keyword matcher over title/description/labels/components with matched-term evidence
- [x] AI confirmation step writes a one-line rationale; guards against incidental mentions
- [x] Writes `scanScores.replaced`; contributes to overall score + rationale
- [x] Runs within the Tier-2 runner; throttled <!-- throttling inherited from the BRDG-284 batched runner; this topic adds no new throttle -->
- [x] Tests (matcher, list CRUD, AI parse)
- [x] Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` <!-- build skipped per task instructions; lint+typecheck+targeted tests run -->
- [x] Update docs and reference the epic
