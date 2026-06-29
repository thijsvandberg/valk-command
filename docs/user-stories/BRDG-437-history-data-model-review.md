# BRDG-437: Review the history / audit data model (scope-change + burnup)

**Status:** Placeholder
**Priority:** Low
**Type:** Investigation / Tech-debt

> Placeholder. Captured while investigating production DB-size warnings (the SQLite file reached ~100MB). Not yet refined; do not start without refinement and approval.

## Why this exists
Several "history" tables grow without bound and have no retention policy. The largest on production is `ticket_scope_change` (~162k rows / ~28MB incl. indexes). Unlike `story_version` (handled in [[BRDG-436-story-version-retention]]), scope-change cannot simply be pruned, because its growth pattern and consumers are entangled with how the burnup chart is seeded. This story is a placeholder to review that data model **as a whole** rather than bolt on another ad-hoc cleanup.

## What to review
- **`ticket_scope_change`** (`src/db/schema.ts`): one row per "ticket added to / removed from a sprint" event, with the story points + business value at that moment. Only consumer is the burnup chart (`src/app/api/burnup/route.ts`).
- **Seeding behaviour** (`src/app/api/burnup/seed/route.ts`): opening a burnup chart backfills the entire sprint history from the Jira changelog in one pass — added + removed + synthetic "added at sprint start" + detection-based removals. This is the main reason the row count is so high, and it can re-create rows.
- **Burnup status history** (`ticket_status_change`): the completion line's source; same "grows forever" question.

## Open questions (to answer during refinement)
- Can scope-change rows for **closed/old sprints** be pruned or compacted once a sprint is finished, given burnup is regenerated on demand from the Jira changelog anyway? What is actually lost?
- Should burnup data be **derived/cached** rather than persisted as raw event rows, or materialised per sprint and frozen when the sprint closes?
- Is the synthetic / detection-based seeding producing duplicate or redundant rows that could be deduplicated?
- Do we want a single, consistent retention story across all history tables (`story_version`, `ticket_scope_change`, `ticket_status_change`, `activity_log`)?
- After any pruning, plan a one-off `VACUUM` to actually reclaim disk space, and decide whether the DB-size warning threshold (currently hardcoded 100MB in `src/db/index.ts`) should be raised.

## Non-goals
- No code changes under this placeholder. Implementation only after refinement and explicit approval.

## Related
- [[BRDG-436-story-version-retention]] — sibling cleanup, already implemented for `story_version`.
- `src/app/api/burnup/route.ts` / `src/app/api/burnup/seed/route.ts` — the burnup consumer + seeder.
- `src/db/index.ts` — the `[db-maintenance]` size warning and (absent) VACUUM.
