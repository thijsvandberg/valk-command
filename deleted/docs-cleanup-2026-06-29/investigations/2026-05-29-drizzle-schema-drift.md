# Drizzle schema drift (pre-existing) — RESOLVED

**Date:** 2026-05-29
**Found during:** BRDG-231 (dependency vulnerability fix) baseline verification
**Status:** Resolved 2026-05-29 — migration `drizzle/0057_composite_indexes_brdg230.sql`
committed; `npx drizzle-kit generate` now reports "No schema changes, nothing to migrate".

## Summary

Running `npx drizzle-kit generate` on a clean `dev` checkout (before any code change)
produces a new migration, meaning `src/db/schema.ts` has drifted from the latest
committed migration snapshot (`drizzle/meta/0056_*`). This is independent of the
BRDG-231 Clerk/Next/drizzle-kit upgrade.

## The diff drizzle wants to emit

```sql
DROP INDEX `stored_review_ticket_key_idx`;
DROP INDEX `stored_review_created_at_idx`;
CREATE INDEX `stored_review_ticket_key_created_at_idx` ON `stored_review` (`ticket_key`,`created_at`);
DROP INDEX `story_version_jira_key_idx`;
CREATE INDEX `story_version_jira_key_created_at_idx` ON `story_version` (`jira_key`,`created_at`);
CREATE INDEX `conversation_related_ticket_idx` ON `conversation` (`related_ticket`);
```

So the schema currently defines composite indexes on `stored_review` and
`story_version` (replacing single-column ones), plus a `related_ticket` index on
`conversation`, that were never captured in a committed migration.

## Why this matters

The BRDG-231 acceptance criterion "verify Drizzle migrations still work
(`npx drizzle-kit generate` produces no diff)" cannot be satisfied verbatim because
the diff is pre-existing, not caused by the upgrade. For BRDG-231 we instead verified
that drizzle-kit still *functions* (it reads the schema and emits the same pre-existing
diff before and after the upgrade).

## Resolution

The index changes were intentional: commit `7aed8811` ("perf: add composite indexes
for reviews, story versions, and conversation lookups (BRDG-230)") added them to
`src/db/schema.ts` but never generated the accompanying migration. The missing
migration was generated and committed as `drizzle/0057_composite_indexes_brdg230.sql`,
realigning the migration history with the schema. `npx drizzle-kit generate` now
reports "No schema changes, nothing to migrate".

The throwaway migration artifacts generated during investigation were moved to
`deleted/drizzle-baseline-2026-05-29/` rather than committed.
