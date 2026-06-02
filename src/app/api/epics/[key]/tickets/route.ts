import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, appSetting } from "@/db/schema";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { Assignee, IssueType, JiraStatus } from "@/types/ticket";
import { safeJsonParse } from "@/lib/api-validation";
import { selectRecentSprintIds, type RecentSprintInput } from "@/lib/epic-progress";

const EXCLUDED_STATUSES = ["DEPRECATED", "DRAFTING", "REPLACED", "DRAFT_FAILED"];

function userInitials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

function userColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 55%, 50%)`;
}

function buildAssignee(name: string | null): Assignee | null {
  if (!name) return null;
  return { name, initials: userInitials(name), color: userColor(name) };
}

export interface EpicChildTicket {
  key: string;
  title: string;
  type: IssueType;
  jiraStatus: JiraStatus;
  storyPoints: number | null;
  assignee: Assignee | null;
  sprintId: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  const settingRow = await db.query.appSetting.findFirst({
    where: (r, { eq: eqFn }) => eqFn(r.key, "jira_sprints"),
  });
  const sprints = settingRow
    ? safeJsonParse<RecentSprintInput[]>(settingRow.value, [], "jira-sprints-epic-tickets")
    : [];
  const sprintFilter = [...selectRecentSprintIds(sprints), ""];

  const rows = await db
    .select({
      jiraKey: ticket.jiraKey,
      title: ticket.title,
      type: ticket.type,
      status: ticket.status,
      storyPoints: ticket.storyPoints,
      assignee: ticket.assignee,
      sprintName: ticket.sprintName,
    })
    .from(ticket)
    .where(
      and(
        eq(ticket.epicKey, key),
        sql`${ticket.type} != 'epic'`,
        sql`${ticket.removedFromJiraAt} IS NULL`,
        notInArray(ticket.status, EXCLUDED_STATUSES),
        inArray(ticket.sprintName, sprintFilter),
      ),
    )
    .all();

  const tickets: EpicChildTicket[] = rows.map((r) => ({
    key: r.jiraKey,
    title: r.title,
    type: (r.type ?? "task") as IssueType,
    jiraStatus: (r.status ?? "TO DO") as JiraStatus,
    storyPoints: r.storyPoints,
    assignee: buildAssignee(r.assignee),
    sprintId: r.sprintName ?? "",
  }));

  return NextResponse.json(tickets);
}
