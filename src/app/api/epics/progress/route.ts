import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, appSetting } from "@/db/schema";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { cache } from "@/lib/cache";
import { safeJsonParse } from "@/lib/api-validation";
import { selectRecentSprintIds, type RecentSprintInput } from "@/lib/epic-progress";
import { getEpicTeamsMap } from "@/lib/epic-metadata";
import { normalizeEpicStatus } from "@/lib/epic-filters";
import type { JiraStatus } from "@/types/ticket";
import type { Team } from "@/lib/sprint-utils";

// Statuses excluded from totals: deprecated work + transient story-writer drafts.
// Mirrors EXCLUDED_STATUSES in @/lib/epic-progress (kept in sync intentionally).
const EXCLUDED_STATUSES = ["DEPRECATED", "DRAFTING", "REPLACED", "DRAFT_FAILED"];

export interface EpicSprintProgress {
  sprintId: string;
  total: number;
  completed: number;
}

export interface EpicProgressItem {
  key: string;
  name: string;
  totalTickets: number;
  completedTickets: number;
  totalPoints: number;
  completedPoints: number;
  inProgressPoints: number;
  todoPoints: number;
  /** Sprint ids this epic has tickets in (within the recent window), chronological. */
  sprintIds: string[];
  perSprint: EpicSprintProgress[];
  /** True when points-based progress is meaningful; false → ticket-count fallback. */
  pointsBased: boolean;
  /** PO-assigned teams (Bridge metadata, not from Jira). */
  teams: Team[];
  /** The epic's own Jira status, normalized to the standard set. */
  status: JiraStatus;
}

async function getRecentSprintWindow(): Promise<{ ids: string[]; filter: string[] }> {
  const row = await db.query.appSetting.findFirst({
    where: (r, { eq: eqFn }) => eqFn(r.key, "jira_sprints"),
  });
  const sprints = row ? safeJsonParse<RecentSprintInput[]>(row.value, [], "jira-sprints-progress") : [];
  const ids = selectRecentSprintIds(sprints);
  // Backlog ("") always part of the window per the story.
  return { ids, filter: [...ids, ""] };
}

export async function GET() {
  const cacheKey = "/api/epics/progress";
  const cached = cache.get<EpicProgressItem[]>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } });
  }

  const { ids: recentIds, filter: sprintFilter } = await getRecentSprintWindow();

  // Children scoped to the recent-sprint window, excluding epics, deprecated and
  // draft-pipeline tickets, and tickets already removed from Jira.
  const childFilter = and(
    sql`${ticket.epicKey} IS NOT NULL`,
    sql`${ticket.type} != 'epic'`,
    sql`${ticket.removedFromJiraAt} IS NULL`,
    notInArray(ticket.status, EXCLUDED_STATUSES),
    inArray(ticket.sprintName, sprintFilter),
  );

  const agg = await db
    .select({
      epicKey: ticket.epicKey,
      epicName: sql<string | null>`MAX(${ticket.epic})`.as("epic_name"),
      totalTickets: sql<number>`COUNT(*)`.as("total_tickets"),
      completedTickets: sql<number>`SUM(CASE WHEN ${ticket.status} = 'DONE' THEN 1 ELSE 0 END)`.as("completed_tickets"),
      totalPoints: sql<number>`SUM(COALESCE(${ticket.storyPoints}, 0))`.as("total_points"),
      completedPoints: sql<number>`SUM(CASE WHEN ${ticket.status} = 'DONE' THEN COALESCE(${ticket.storyPoints}, 0) ELSE 0 END)`.as("completed_points"),
      inProgressPoints: sql<number>`SUM(CASE WHEN ${ticket.status} IN ('IN PROGRESS', 'TEST') THEN COALESCE(${ticket.storyPoints}, 0) ELSE 0 END)`.as("in_progress_points"),
    })
    .from(ticket)
    .where(childFilter)
    .groupBy(ticket.epicKey)
    .all();

  if (agg.length === 0) {
    cache.set(cacheKey, [], 300_000);
    return NextResponse.json([], { headers: { "X-Cache": "MISS" } });
  }

  // Per-sprint breakdown for the timeline (total + completed per epic per sprint).
  const perSprintRows = await db
    .select({
      epicKey: ticket.epicKey,
      sprintId: ticket.sprintName,
      total: sql<number>`COUNT(*)`.as("total"),
      completed: sql<number>`SUM(CASE WHEN ${ticket.status} = 'DONE' THEN 1 ELSE 0 END)`.as("completed"),
    })
    .from(ticket)
    .where(childFilter)
    .groupBy(ticket.epicKey, ticket.sprintName)
    .all();

  const perSprintByEpic = new Map<string, EpicSprintProgress[]>();
  for (const r of perSprintRows) {
    if (!r.epicKey) continue;
    const list = perSprintByEpic.get(r.epicKey) ?? [];
    list.push({ sprintId: r.sprintId ?? "", total: Number(r.total), completed: Number(r.completed) });
    perSprintByEpic.set(r.epicKey, list);
  }

  // Authoritative epic names from synced epic rows; fall back to the child's epic label.
  const epicKeys = agg.map((a) => a.epicKey).filter((k): k is string => k != null);
  const epicRows = await db
    .select({ jiraKey: ticket.jiraKey, title: ticket.title, status: ticket.status })
    .from(ticket)
    .where(and(eq(ticket.type, "epic"), inArray(ticket.jiraKey, epicKeys)))
    .all();
  const epicTitleMap = new Map(epicRows.map((e) => [e.jiraKey, e.title]));
  const epicStatusMap = new Map(epicRows.map((e) => [e.jiraKey, e.status]));

  // PO-assigned teams per epic (Bridge metadata).
  const epicTeamsMap = getEpicTeamsMap(epicKeys);

  // Order sprint ids within an epic by the recent-window order (oldest first), backlog last.
  const orderIndex = new Map<string, number>(recentIds.map((id, i) => [id, i]));
  function sortSprintIds(sprintIds: string[]): string[] {
    return [...sprintIds].sort((a, b) => {
      if (a === "") return 1;
      if (b === "") return -1;
      return (orderIndex.get(a) ?? 99) - (orderIndex.get(b) ?? 99);
    });
  }

  const items: EpicProgressItem[] = agg
    .filter((a) => a.epicKey != null)
    .map((a) => {
      const key = a.epicKey as string;
      const totalPoints = Number(a.totalPoints);
      const completedPoints = Number(a.completedPoints);
      const inProgressPoints = Number(a.inProgressPoints);
      const todoPoints = Math.max(0, totalPoints - completedPoints - inProgressPoints);
      const perSprint = perSprintByEpic.get(key) ?? [];
      const sprintIds = sortSprintIds(perSprint.map((p) => p.sprintId));
      return {
        key,
        name: epicTitleMap.get(key) ?? a.epicName ?? key,
        totalTickets: Number(a.totalTickets),
        completedTickets: Number(a.completedTickets),
        totalPoints,
        completedPoints,
        inProgressPoints,
        todoPoints,
        sprintIds,
        perSprint,
        pointsBased: totalPoints > 0,
        teams: epicTeamsMap.get(key) ?? [],
        status: normalizeEpicStatus(epicStatusMap.get(key)),
      };
    });

  // Most complete-by-volume epics first: more tickets, then higher completion.
  items.sort((a, b) => {
    if (b.totalTickets !== a.totalTickets) return b.totalTickets - a.totalTickets;
    return b.completedTickets - a.completedTickets;
  });

  cache.set(cacheKey, items, 300_000);
  return NextResponse.json(items, { headers: { "X-Cache": "MISS" } });
}
