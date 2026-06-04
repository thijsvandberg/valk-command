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

## Checklist

- [ ] Invoke the `frontend-design` skill before any frontend work
- [ ] Editable deprecated-keyword/domain list in the UI (seeded with CWI, RezExchange, IDPMS, hybrid cloud)
- [ ] Keyword matcher over title/description/labels/components with matched-term evidence
- [ ] AI confirmation step writes a one-line rationale; guards against incidental mentions
- [ ] Writes `scanScores.replacedArea`; contributes to overall score + rationale
- [ ] Runs within the Tier-2 runner; throttled
- [ ] Tests (matcher, list CRUD, AI parse)
- [ ] Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`
- [ ] Update docs and reference the epic
