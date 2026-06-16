import { sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";

type Db = typeof defaultDb;

/**
 * One-off backfill (BRDG-364): fill the new accountId on existing favourite and
 * team-assignment rows by resolving their display name against the jira_user
 * directory. Best-effort — a name that was never seen on a synced issue (so has
 * no jira_user row) stays name-only and keeps matching by name. Only touches rows
 * whose accountId is still null, so it is safe to run repeatedly.
 *
 * Returns how many rows of each kind were updated.
 */
export function backfillPeopleAccountIds(database: Db = defaultDb): { favourites: number; teams: number } {
  const favResult = database.run(sql`
    UPDATE favorite_user
    SET account_id = (
      SELECT ju.account_id FROM jira_user ju
      WHERE ju.display_name = favorite_user.display_name AND ju.account_id IS NOT NULL
      LIMIT 1
    )
    WHERE account_id IS NULL
      AND EXISTS (
        SELECT 1 FROM jira_user ju
        WHERE ju.display_name = favorite_user.display_name AND ju.account_id IS NOT NULL
      )
  `);

  const teamResult = database.run(sql`
    UPDATE user_team_assignment
    SET account_id = (
      SELECT ju.account_id FROM jira_user ju
      WHERE ju.display_name = user_team_assignment.display_name AND ju.account_id IS NOT NULL
      LIMIT 1
    )
    WHERE account_id IS NULL
      AND EXISTS (
        SELECT 1 FROM jira_user ju
        WHERE ju.display_name = user_team_assignment.display_name AND ju.account_id IS NOT NULL
      )
  `);

  return {
    favourites: (favResult as { changes?: number }).changes ?? 0,
    teams: (teamResult as { changes?: number }).changes ?? 0,
  };
}
