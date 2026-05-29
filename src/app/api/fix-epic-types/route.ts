import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { cache } from "@/lib/cache";
import { applyRateLimit } from "@/lib/rate-limiter";

/**
 * One-time fix: identify tickets that are epics (referenced as epicKey by other
 * tickets) but were stored with type "task" due to a missing normalizeIssueType
 * rule. Updates their type to "epic" and clears their sprintName.
 */
export async function POST() {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  // Find all distinct epicKey values that reference existing tickets
  const epicKeys = await db
    .selectDistinct({ epicKey: ticket.epicKey })
    .from(ticket)
    .where(sql`${ticket.epicKey} IS NOT NULL`);

  const keys = epicKeys.map((r) => r.epicKey).filter(Boolean) as string[];

  if (keys.length === 0) {
    return NextResponse.json({ fixed: 0, keys: [] });
  }

  let fixed = 0;
  const fixedKeys: string[] = [];

  for (const key of keys) {
    const row = await db.query.ticket.findFirst({
      where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
      columns: { jiraKey: true, type: true, sprintName: true },
    });

    if (!row) continue;

    const needsTypeUpdate = row.type !== "epic";
    const needsSprintClear = row.sprintName !== null;

    if (needsTypeUpdate || needsSprintClear) {
      await db
        .update(ticket)
        .set({
          ...(needsTypeUpdate ? { type: "epic" } : {}),
          ...(needsSprintClear ? { sprintName: null } : {}),
        })
        .where(eq(ticket.jiraKey, key));

      fixed++;
      fixedKeys.push(key);
    }
  }

  cache.invalidate(/^\/api\/tickets/);

  return NextResponse.json({ fixed, keys: fixedKeys });
}
