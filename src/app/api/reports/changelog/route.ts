import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, pipelineRun, appSetting } from "@/db/schema";
import { eq, and, or, inArray, like, isNotNull, sql } from "drizzle-orm";
import { adfToMarkdown } from "@/lib/adf-to-markdown";

interface StoredSprint {
  id: number;
  name: string;
  state: string;
  startDate: string | null;
  endDate: string | null;
  goal: string | null;
}

export interface ChangelogTicketPr {
  url: string;
  title: string;
  author: string | null;
}

export interface ChangelogTicketEntry {
  key: string;
  title: string;
  type: string;
  description: string;
  storyPoints: number | null;
  assignee: string | null;
  prs: ChangelogTicketPr[];
}

export interface ChangelogEpicGroup {
  epic: string;
  epicKey: string | null;
  tickets: ChangelogTicketEntry[];
}

export interface ChangelogVelocityStats {
  completedPoints: number;
  totalPoints: number;
  completedTickets: number;
  totalTickets: number;
}

export interface ChangelogResponse {
  sprint: {
    id: number;
    name: string;
    startDate: string | null;
    endDate: string | null;
    state: string;
    goal: string | null;
  };
  velocityStats: ChangelogVelocityStats;
  epicGroups: ChangelogEpicGroup[];
}

function extractDescriptionSummary(descriptionJson: string | null | undefined): string {
  if (!descriptionJson) return "";
  try {
    const adf = JSON.parse(descriptionJson);
    const md = adfToMarkdown(adf);
    const plain = md
      .replace(/```[\s\S]*?```/g, "")
      .replace(/#{1,6}\s+/g, "")
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/_/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/`([^`]*)`/g, "$1")
      .replace(/^[-*+]\s+/gm, "")
      .replace(/^\d+\.\s+/gm, "")
      .replace(/^>\s+/gm, "")
      .replace(/\|[^\n]*/g, "")
      .replace(/\n+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!plain) return "";
    return plain.length > 200 ? plain.slice(0, 200) + "..." : plain;
  } catch {
    return "";
  }
}

function cleanTitle(title: string): string {
  // Strip leading Jira key prefix like "VPL-123: " or "VPL-123 " if present
  return title.replace(/^[A-Z]+-\d+[:\s]+/, "").trim();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sprintParam = searchParams.get("sprint");

  if (!sprintParam) {
    return NextResponse.json({ error: "sprint parameter required" }, { status: 400 });
  }

  // Load sprint metadata
  const sprintRow = await db.query.appSetting.findFirst({
    where: (r, { eq: eqFn }) => eqFn(r.key, "jira_sprints"),
  });

  let sprintMeta: StoredSprint | undefined;
  if (sprintRow) {
    try {
      const allSprints = JSON.parse(sprintRow.value) as StoredSprint[];
      sprintMeta = allSprints.find((s) => String(s.id) === sprintParam);
    } catch {
      // malformed cache — proceed without metadata
    }
  }

  // Query all tickets in the sprint (for velocity stats)
  const allSprintTickets = await db
    .select({
      jiraKey: ticket.jiraKey,
      title: ticket.title,
      type: ticket.type,
      status: ticket.status,
      epic: ticket.epic,
      epicKey: ticket.epicKey,
      description: ticket.description,
      storyPoints: ticket.storyPoints,
      assignee: ticket.assignee,
    })
    .from(ticket)
    .where(
      and(
        eq(ticket.sprintName, sprintParam),
        // exclude subtasks from changelog
        sql`COALESCE(${ticket.type}, '') != 'subtask'`,
      ),
    )
    .all();

  const doneTickets = allSprintTickets.filter((t) => t.status === "DONE");
  const doneKeys = doneTickets.map((t) => t.jiraKey);

  // Velocity stats
  const completedPoints = doneTickets.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
  const totalPoints = allSprintTickets.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);

  // Query PRs from pipeline_run for done tickets
  const prsByKey = new Map<string, ChangelogTicketPr[]>();

  if (doneKeys.length > 0) {
    const ticketKeysConds = doneKeys.map((k) => like(pipelineRun.ticketKeys, `%"${k}"%`));
    const pipelineRows = await db
      .select({
        ticketKey: pipelineRun.ticketKey,
        ticketKeys: pipelineRun.ticketKeys,
        prUrl: pipelineRun.prUrl,
        prTitle: pipelineRun.prTitle,
        prAuthor: pipelineRun.prAuthor,
      })
      .from(pipelineRun)
      .where(
        and(
          isNotNull(pipelineRun.prUrl),
          or(inArray(pipelineRun.ticketKey, doneKeys), ...ticketKeysConds)!,
        ),
      )
      .all();

    // Deduplicate PRs by URL and associate with ticket keys
    const seenPrUrls = new Set<string>();
    for (const row of pipelineRows) {
      if (!row.prUrl || seenPrUrls.has(row.prUrl)) continue;
      seenPrUrls.add(row.prUrl);

      const pr: ChangelogTicketPr = {
        url: row.prUrl,
        title: row.prTitle ?? row.prUrl,
        author: row.prAuthor ?? null,
      };

      // Determine which ticket keys this PR belongs to
      const relatedKeys = new Set<string>();
      if (row.ticketKey && doneKeys.includes(row.ticketKey)) {
        relatedKeys.add(row.ticketKey);
      }
      if (row.ticketKeys) {
        try {
          const parsed = JSON.parse(row.ticketKeys) as string[];
          for (const k of parsed) {
            if (doneKeys.includes(k)) relatedKeys.add(k);
          }
        } catch {
          // malformed JSON, skip
        }
      }

      for (const k of relatedKeys) {
        const existing = prsByKey.get(k) ?? [];
        existing.push(pr);
        prsByKey.set(k, existing);
      }
    }
  }

  // Group done tickets by epic
  const epicMap = new Map<string, { epicKey: string | null; tickets: ChangelogTicketEntry[] }>();

  for (const t of doneTickets) {
    const epicName = t.epic ?? "Other";
    if (!epicMap.has(epicName)) {
      epicMap.set(epicName, { epicKey: t.epicKey ?? null, tickets: [] });
    }
    epicMap.get(epicName)!.tickets.push({
      key: t.jiraKey,
      title: cleanTitle(t.title),
      type: t.type ?? "task",
      description: extractDescriptionSummary(t.description),
      storyPoints: t.storyPoints ?? null,
      assignee: t.assignee ?? null,
      prs: prsByKey.get(t.jiraKey) ?? [],
    });
  }

  // Sort epics: "Other" last, rest alphabetically
  const epicGroups: ChangelogEpicGroup[] = Array.from(epicMap.entries())
    .sort(([a], [b]) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    })
    .map(([epic, data]) => ({
      epic,
      epicKey: data.epicKey,
      tickets: data.tickets,
    }));

  const response: ChangelogResponse = {
    sprint: {
      id: sprintMeta ? sprintMeta.id : parseInt(sprintParam, 10),
      name: sprintMeta?.name ?? sprintParam,
      startDate: sprintMeta?.startDate ?? null,
      endDate: sprintMeta?.endDate ?? null,
      state: sprintMeta?.state ?? "closed",
      goal: sprintMeta?.goal ?? null,
    },
    velocityStats: {
      completedPoints,
      totalPoints,
      completedTickets: doneTickets.length,
      totalTickets: allSprintTickets.length,
    },
    epicGroups,
  };

  return NextResponse.json(response);
}
