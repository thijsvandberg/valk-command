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
    })
    .from(ticket)
    .where(eq(ticket.type, "epic"))
    .all();

  // Count children per epic in one query
  const childCounts = await db
    .select({
      epicKey: ticket.epicKey,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(ticket)
    .where(sql`${ticket.epicKey} IS NOT NULL`)
    .groupBy(ticket.epicKey)
    .all();

  const countMap = new Map(childCounts.map((r) => [r.epicKey, r.count]));

  const epics: EpicListItem[] = epicRows.map((e) => ({
    key: e.jiraKey,
    name: e.title,
    status: e.status ?? "TO DO",
    childCount: countMap.get(e.jiraKey) ?? 0,
  }));

  // Sort: most children first (active epics tend to have more)
  epics.sort((a, b) => b.childCount - a.childCount);

  cache.set(cacheKey, epics, 300_000);

  return NextResponse.json(epics, { headers: { "X-Cache": "MISS" } });
}
