import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { cache } from "@/lib/cache";

export interface EpicListItem {
  key: string;
  name: string;
  status: string;
  childCount: number;
  summary: string | null;
  summaryStale: boolean;
}

export async function GET() {
  const cacheKey = "/api/epics";
  const cached = cache.get<EpicListItem[]>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } });
  }

  const epicRows = await db
    .select({
      jiraKey: ticket.jiraKey,
      title: ticket.title,
      status: ticket.status,
      summary: ticket.summary,
      summaryUpdatedAt: ticket.summaryUpdatedAt,
      jiraUpdatedAt: ticket.jiraUpdatedAt,
    })
    .from(ticket)
    .where(eq(ticket.type, "epic"))
    .all();

  // Count children and get most recent child update per epic in one query
  const childStats = await db
    .select({
      epicKey: ticket.epicKey,
      count: sql<number>`count(*)`.as("count"),
      lastChildUpdated: sql<string | null>`max(${ticket.jiraUpdatedAt})`.as("last_child_updated"),
    })
    .from(ticket)
    .where(sql`${ticket.epicKey} IS NOT NULL`)
    .groupBy(ticket.epicKey)
    .all();

  const countMap = new Map(childStats.map((r) => [r.epicKey, r.count]));
  const lastUsedMap = new Map(childStats.map((r) => [r.epicKey, r.lastChildUpdated]));

  const epicKeySet = new Set(epicRows.map((e) => e.jiraKey));

  const epics: EpicListItem[] = epicRows.map((e) => {
    const summaryStale = !e.summaryUpdatedAt
      || (e.jiraUpdatedAt != null && e.jiraUpdatedAt > e.summaryUpdatedAt);
    return {
      key: e.jiraKey,
      name: e.title,
      status: e.status ?? "TO DO",
      childCount: countMap.get(e.jiraKey) ?? 0,
      summary: e.summary ?? null,
      summaryStale: e.summary != null && summaryStale,
    };
  });

  // Include epics referenced by tickets but not synced as type='epic'
  const referencedEpics = await db
    .selectDistinct({
      epicKey: ticket.epicKey,
      epicName: ticket.epic,
    })
    .from(ticket)
    .where(sql`${ticket.epicKey} IS NOT NULL AND ${ticket.type} != 'epic'`)
    .all();

  for (const ref of referencedEpics) {
    if (ref.epicKey && ref.epicName && !epicKeySet.has(ref.epicKey)) {
      epicKeySet.add(ref.epicKey);
      epics.push({
        key: ref.epicKey,
        name: ref.epicName,
        status: "Unknown",
        childCount: countMap.get(ref.epicKey) ?? 0,
        summary: null,
        summaryStale: false,
      });
    }
  }

  // Sort: most recently active epics first, then by child count
  epics.sort((a, b) => {
    const aDate = lastUsedMap.get(a.key) ?? "";
    const bDate = lastUsedMap.get(b.key) ?? "";
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    return b.childCount - a.childCount;
  });

  cache.set(cacheKey, epics, 300_000);

  return NextResponse.json(epics, { headers: { "X-Cache": "MISS" } });
}
