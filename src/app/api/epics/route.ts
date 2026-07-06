import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { cache } from "@/lib/cache";
import { jiraClient } from "@/lib/jira-client";
import { markdownToAdf } from "@/lib/markdown-to-adf";
import { env } from "@/lib/env";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

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

// Create a standalone epic from the Epics page. Unlike POST /api/tickets (which is
// board-oriented and excludes epics), an epic carries no sprint and no parent. The
// optional description is authored as markdown and stored as ADF, the same way the
// epic writer's create-in-jira path does it.
export async function POST(request: Request) {
  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as { title?: string; description?: string };

  const title = body.title?.trim();
  if (!title) {
    return errorResponse("title is required", 400);
  }

  const descriptionText = typeof body.description === "string" ? body.description.trim() : "";

  let jiraResult: { key: string; id: string };
  try {
    jiraResult = await jiraClient.createIssue({
      summary: title,
      issueType: "Epic",
      projectKey: env.JIRA_PROJECT_KEY,
      ...(descriptionText ? { description: markdownToAdf(descriptionText) } : {}),
    });
  } catch (err) {
    logger.error("epic-create", `Jira create failed: ${err}`);
    const message = err instanceof Error ? err.message : "Jira API error";
    return errorResponse(message, 502);
  }

  // Persist the description locally as markdown (BRDG-478) so the Epic Writer
  // session seeds its draft from it on first open, before any Jira sync lands.
  // Jira stores the ADF form above; the local mirror stays markdown like every
  // other ticket.description.
  await db.insert(ticket).values({
    jiraKey: jiraResult.key,
    jiraId: jiraResult.id,
    title,
    type: "epic",
    status: "TO DO",
    flagged: false,
    ...(descriptionText ? { description: descriptionText } : {}),
  });

  // Prefix-clears /api/epics and /api/epics/progress so the new epic surfaces.
  cache.invalidate("/api/epics");

  await logActivity({
    type: "metadata-update",
    scope: jiraResult.key,
    summary: `Created epic ${jiraResult.key}: ${title}`,
  });

  return NextResponse.json({ key: jiraResult.key });
}
