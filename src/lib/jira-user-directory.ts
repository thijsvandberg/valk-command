import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { jiraUser } from "@/db/schema";
import type { JiraUserLookup } from "@/lib/person-ref";

/**
 * Build a jira_user label lookup for a set of accountIds (BRDG-363). One batched
 * read backs an in-memory map, so a caller resolving many people (a board, a
 * detail page) hits the directory once rather than per person. Unknown ids return
 * undefined, letting the resolver fall back to the ticket's cached name.
 */
export async function getJiraUserLookup(accountIds: Array<string | null | undefined>): Promise<JiraUserLookup> {
  const ids = [...new Set(accountIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return () => undefined;

  const rows = await db
    .select({ accountId: jiraUser.accountId, displayName: jiraUser.displayName, email: jiraUser.email, avatar: jiraUser.avatar })
    .from(jiraUser)
    .where(inArray(jiraUser.accountId, ids));

  const map = new Map(rows.map((r) => [r.accountId, { displayName: r.displayName, email: r.email, avatar: r.avatar }]));
  return (accountId: string) => map.get(accountId);
}
