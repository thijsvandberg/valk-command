import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, appSetting } from "@/db/schema";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { cache } from "@/lib/cache";
import { safeJsonParse } from "@/lib/api-validation";
import { selectRecentSprintIds, type RecentSprintInput } from "@/lib/epic-progress";
import { getEpicTeamsMap, getEpicColorMap } from "@/lib/epic-metadata";
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
  /** PO-assigned base color (Bridge metadata). null → derived default. */
  color: string | null;
  /** The epic's own Jira status, normalized to the standard set. */
  status: JiraStatus;
  /**
   * True when the epic has tickets in the recent-sprint window. The view shows
   * only these by default; epics without recent activity (e.g. done/deprecated)
   * surface when a filter is active, so old epics can be cleaned up.
   */
  recentActivity: boolean;
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

  // Epics with recent-window activity (full progress stats + timeline).
  const recentKeys = agg.map((a) => a.epicKey).filter((k): k is string => k != null);
  const recentKeySet = new Set(recentKeys);

  // All synced epic rows — for authoritative names/status and so done/deprecated
  // epics (no recent children) can surface when a filter is active.
  const epicRows = await db
    .select({ jiraKey: ticket.jiraKey, title: ticket.title, status: ticket.status })
    .from(ticket)
    .where(eq(ticket.type, "epic"))
    .all();
  const epicTitleMap = new Map(epicRows.map((e) => [e.jiraKey, e.title]));
  const epicStatusMap = new Map(epicRows.map((e) => [e.jiraKey, e.status]));

  // PO-assigned teams for every epic we might show (recent children + all epic rows).
  const allKeys = Array.from(new Set([...recentKeys, ...epicRows.map((e) => e.jiraKey)]));
  const epicTeamsMap = getEpicTeamsMap(allKeys);
  const epicColorMap = getEpicColorMap(allKeys);

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
        color: epicColorMap.get(key) ?? null,
        status: normalizeEpicStatus(epicStatusMap.get(key)),
        recentActivity: true,
      };
    });

  // Most complete-by-volume epics first: more tickets, then higher completion.
  items.sort((a, b) => {
    if (b.totalTickets !== a.totalTickets) return b.totalTickets - a.totalTickets;
    return b.completedTickets - a.completedTickets;
  });

  // Epics without recent activity: minimal rows so the filters can reveal them
  // (e.g. cleaning up old done/deprecated epics). Children aren't necessarily
  // synced, so progress is left at zero.
  const inactive: EpicProgressItem[] = epicRows
    .filter((e) => !recentKeySet.has(e.jiraKey))
    .map((e) => ({
      key: e.jiraKey,
      name: e.title,
      totalTickets: 0,
      completedTickets: 0,
      totalPoints: 0,
      completedPoints: 0,
      inProgressPoints: 0,
      todoPoints: 0,
      sprintIds: [],
      perSprint: [],
      pointsBased: false,
      teams: epicTeamsMap.get(e.jiraKey) ?? [],
      color: epicColorMap.get(e.jiraKey) ?? null,
      status: normalizeEpicStatus(e.status),
      recentActivity: false,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const all = [...items, ...inactive];
  cache.set(cacheKey, all, 300_000);
  return NextResponse.json(all, { headers: { "X-Cache": "MISS" } });
}
