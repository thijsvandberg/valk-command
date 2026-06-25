import { db } from "@/db";
import { ticket, sprintNameCache } from "@/db/schema";
import { inArray } from "drizzle-orm";

// Related-story candidates only carry the Jira key. The sprint a candidate sits in
// is looked up from the locally-mirrored ticket (ticket.sprintName holds the sprint
// id) and resolved to a human name via sprintNameCache. This is an enriched response
// field, NOT a stored column on related_story_candidate. A candidate whose ticket is
// not yet synced (background sync is fire-and-forget) resolves to null and fills in
// on the next read once the sync lands. (BRDG-397)
export async function enrichCandidatesWithSprintName<T extends { jiraKey: string }>(
  rows: T[],
): Promise<(T & { sprintName: string | null })[]> {
  if (rows.length === 0) return [];

  const keys = [...new Set(rows.map((r) => r.jiraKey))];
  const ticketRows = await db
    .select({ jiraKey: ticket.jiraKey, sprintName: ticket.sprintName })
    .from(ticket)
    .where(inArray(ticket.jiraKey, keys))
    .all();
  const keyToSprintId = new Map(ticketRows.map((t) => [t.jiraKey, t.sprintName]));

  const numericIds = [
    ...new Set(
      ticketRows
        .map((t) => t.sprintName)
        .filter((s): s is string => !!s && /^\d+$/.test(s)),
    ),
  ];
  const nameRows = numericIds.length
    ? await db
        .select()
        .from(sprintNameCache)
        .where(inArray(sprintNameCache.sprintId, numericIds))
        .all()
    : [];
  const idToName = new Map(nameRows.map((n) => [n.sprintId, n.displayName]));

  return rows.map((r) => {
    const sid = keyToSprintId.get(r.jiraKey);
    // Numeric id -> resolve via cache; a legacy non-numeric value is itself the name;
    // empty/backlog/unknown -> null (rendered as "no sprint").
    const sprintName = !sid ? null : /^\d+$/.test(sid) ? (idToName.get(sid) ?? null) : sid;
    return { ...r, sprintName };
  });
}
