# Drizzle schema drift (pre-existing)

**Date:** 2026-05-29
**Found during:** BRDG-231 (dependency vulnerability fix) baseline verification

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

## Recommendation

Open a separate story to either (a) commit a migration capturing these index changes,
or (b) revert the schema if the index changes were unintentional. Whoever last edited
the index definitions in `src/db/schema.ts` should confirm intent before a migration is
committed.

The baseline migration artifacts generated during investigation were moved to
`deleted/drizzle-baseline-2026-05-29/` rather than committed.
