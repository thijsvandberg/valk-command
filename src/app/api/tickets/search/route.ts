import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, sprintNameCache } from "@/db/schema";
import { or, ne, and, desc, isNull, sql, eq, type SQL } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { escapeLikePattern } from "@/lib/api-validation";
import { escapeJql } from "@/lib/jql";

const JIRA_KEY_RE = /^[A-Z][A-Z0-9]+-\d+$/i;
const SPARSE_THRESHOLD = 5;
const PAGE_SIZE = 25;
const RECENT_LIMIT = 10;

interface SearchResult {
  key: string;
  title: string;
  type: string;
  status: string;
  sprintName: string | null;
  epicKey: string | null;
  assignee: string | null;
  jiraUpdatedAt: string | null;
  project: string | null;
  source: "local" | "jira" | "recent";
}

interface SearchFacets {
  types: string[];
  statuses: string[];
  projects: string[];
  assignees: string[];
}

const notDeleted = and(
  sql`LOWER(${ticket.status}) != 'deleted'`,
  isNull(ticket.removedFromJiraAt),
);

// Sub-tasks are hidden by default. The VPL subtask issue type is "Subtask" (one
// word), so the comparison must match that, not the old "sub-task" (BRDG-396).
const notSubTask = sql`LOWER(${ticket.type}) != 'subtask'`;

// Columns selected for every candidate row, in both browse and text modes.
const candidateColumns = {
  key: ticket.jiraKey,
  title: ticket.title,
  type: ticket.type,
  status: ticket.status,
  sprintId: ticket.sprintName,
  sprintDisplayName: sprintNameCache.displayName,
  epicKey: ticket.epicKey,
  assignee: ticket.assignee,
  jiraUpdatedAt: ticket.jiraUpdatedAt,
};

type CandidateRow = {
  key: string;
  title: string;
  type: string | null;
  status: string;
  sprintId: string | null;
  sprintDisplayName: string | null;
  epicKey: string | null;
  assignee: string | null;
  jiraUpdatedAt: string | null;
};

function projectOf(key: string): string | null {
  const idx = key.indexOf("-");
  return idx > 0 ? key.slice(0, idx) : null;
}

function mapRow(r: CandidateRow, source: "local" | "recent"): SearchResult {
  return {
    key: r.key,
    title: r.title,
    type: r.type ?? "task",
    status: r.status,
    sprintName: r.sprintDisplayName ?? r.sprintId,
    epicKey: r.epicKey ?? null,
    assignee: r.assignee ?? null,
    jiraUpdatedAt: r.jiraUpdatedAt ?? null,
    project: projectOf(r.key),
    source,
  };
}

// Relative "last updated" buckets -> ISO cutoff. jiraUpdatedAt is stored as
// ISO-8601 text, so a lexicographic `>=` compares correctly.
function updatedCutoff(bucket: string | null): string | null {
  if (!bucket || bucket === "any") return null;
  const day = 86_400_000;
  const spans: Record<string, number> = { "24h": day, "7d": 7 * day, "30d": 30 * day };
  const span = spans[bucket];
  if (!span) return null;
  return new Date(Date.now() - span).toISOString();
}

interface ParsedFilters {
  types: string[];
  statuses: string[];
  sprints: string[];
  teams: string[];
  epics: string[];
  assignees: string[];
  projects: string[];
  updatedCutoffIso: string | null;
}

// Team is encoded in the sprint-name prefix ("BT: 138" -> BT), matching
// extractTeamPrefix in sprint-utils. The route resolves the primary sprint's
// display name via the sprintNameCache join, so the team can be filtered there.
function teamCondition(team: string): SQL {
  return or(
    sql`${sprintNameCache.displayName} LIKE ${`${team}:%`}`,
    sql`${sprintNameCache.displayName} LIKE ${`${team} %`}`,
  )!;
}

// Filter conditions shared by browse and text modes so they compose identically.
// Each multi-value facet is an OR within itself and ANDs with the others.
function buildFilterConditions(f: ParsedFilters, isKeySearch: boolean): SQL[] {
  const conds: SQL[] = [];

  if (f.types.length > 0) {
    // OR of equals keeps the lowercased comparison explicit and portable.
    conds.push(or(...f.types.map((t) => sql`LOWER(${ticket.type}) = ${t}`))!);
  } else if (!isKeySearch) {
    // Default: hide subtasks. Key searches bypass the type filter entirely so a
    // subtask can always be linked by its exact key.
    conds.push(notSubTask);
  }

  if (f.statuses.length > 0) conds.push(or(...f.statuses.map((s) => sql`LOWER(${ticket.status}) = ${s}`))!);
  if (f.sprints.length > 0) conds.push(or(...f.sprints.map((s) => eq(ticket.sprintName, s)))!);
  if (f.teams.length > 0) conds.push(or(...f.teams.map(teamCondition))!);
  if (f.epics.length > 0) conds.push(or(...f.epics.map((e) => eq(ticket.epicKey, e)))!);
  if (f.assignees.length > 0) conds.push(or(...f.assignees.map((a) => eq(ticket.assignee, a)))!);
  if (f.projects.length > 0) conds.push(or(...f.projects.map((p) => sql`${ticket.jiraKey} LIKE ${`${p}-%`}`))!);
  if (f.updatedCutoffIso) conds.push(sql`${ticket.jiraUpdatedAt} >= ${f.updatedCutoffIso}`);

  return conds;
}

// Splits a comma-separated query param into a trimmed, non-empty list.
function csv(value: string | null, lower = false): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => (lower ? v.trim().toLowerCase() : v.trim()))
    .filter(Boolean);
}

async function computeFacets(): Promise<SearchFacets> {
  const [typeRows, statusRows, projectRows, assigneeRows] = await Promise.all([
    db.selectDistinct({ type: ticket.type }).from(ticket).where(notDeleted),
    db.selectDistinct({ status: ticket.status }).from(ticket).where(notDeleted),
    db
      .selectDistinct({
        project: sql<string>`substr(${ticket.jiraKey}, 1, instr(${ticket.jiraKey}, '-') - 1)`,
      })
      .from(ticket)
      .where(notDeleted),
    db.selectDistinct({ assignee: ticket.assignee }).from(ticket).where(notDeleted),
  ]);

  return {
    types: typeRows.map((r) => r.type).filter((t): t is string => !!t).sort(),
    statuses: statusRows.map((r) => r.status).filter((s): s is string => !!s).sort(),
    projects: projectRows.map((r) => r.project).filter((p): p is string => !!p).sort(),
    assignees: assigneeRows.map((r) => r.assignee).filter((a): a is string => !!a).sort(),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const exclude = url.searchParams.get("exclude");
  const jiraEnabled = url.searchParams.get("jira") !== "0";
  const recentOnly = url.searchParams.get("recent") === "1";
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10) || 0;

  const preset = url.searchParams.get("preset"); // "epic" | "sprint"

  const filters: ParsedFilters = {
    types: csv(url.searchParams.get("types"), true),
    statuses: csv(url.searchParams.get("status"), true),
    sprints: csv(url.searchParams.get("sprint")),
    teams: csv(url.searchParams.get("team")),
    epics: csv(url.searchParams.get("epic")),
    assignees: csv(url.searchParams.get("assignee")),
    projects: csv(url.searchParams.get("project")),
    updatedCutoffIso: updatedCutoff(url.searchParams.get("updatedWithin")),
  };

  // Facets describe the whole candidate pool, independent of the current filter,
  // so the option lists never collapse to what the filter already selected. Only
  // needed on the first page; load-more keeps the previously fetched facets.
  const facets = offset === 0 ? await computeFacets() : undefined;
  const empty = (extra?: Partial<{ facets: SearchFacets }>) =>
    NextResponse.json({ results: [], hasMore: false, facets, ...extra });

  // Presets resolve against the current ticket (the excluded key): "same epic" /
  // "same sprint" read that ticket's epicKey / sprintName and apply it as a
  // filter. They override any explicit epic/sprint param.
  if (preset && exclude) {
    const [row] = await db
      .select({ epicKey: ticket.epicKey, sprintName: ticket.sprintName })
      .from(ticket)
      .where(eq(ticket.jiraKey, exclude))
      .limit(1);
    if (preset === "epic") {
      if (!row?.epicKey) return empty();
      filters.epics = [row.epicKey];
    } else if (preset === "sprint") {
      if (!row?.sprintName) return empty();
      filters.sprints = [row.sprintName];
    }
  }

  const hasUserFilters = Boolean(
    filters.types.length > 0 ||
      filters.statuses.length > 0 ||
      filters.sprints.length > 0 ||
      filters.teams.length > 0 ||
      filters.epics.length > 0 ||
      filters.assignees.length > 0 ||
      filters.projects.length > 0 ||
      filters.updatedCutoffIso,
  );
  const hasQuery = Boolean(q && q.length >= 2);
  const isKeySearch = hasQuery ? JIRA_KEY_RE.test(q!) : false;

  // Browse mode: the explicit "recently updated" empty state, or any time filters
  // are set without a usable text query. Filtered browse paginates like search;
  // the bare recent state keeps its small fixed window.
  if (recentOnly || (!hasQuery && hasUserFilters)) {
    const conditions = [notDeleted, ...buildFilterConditions(filters, false)];
    if (exclude) conditions.push(ne(ticket.jiraKey, exclude));

    const paginated = hasUserFilters;
    const rows = await db
      .select(candidateColumns)
      .from(ticket)
      .leftJoin(sprintNameCache, eq(ticket.sprintName, sprintNameCache.sprintId))
      .where(and(...conditions))
      .orderBy(desc(ticket.jiraUpdatedAt))
      .limit(paginated ? PAGE_SIZE + 1 : RECENT_LIMIT)
      .offset(paginated ? offset : 0);

    const hasMore = paginated && rows.length > PAGE_SIZE;
    if (hasMore) rows.pop();

    return NextResponse.json({
      results: rows.map((r) => mapRow(r, "recent")),
      hasMore,
      facets,
    });
  }

  if (!hasQuery) {
    return empty();
  }

  // Escape the LIKE escape char first, then the % / _ wildcards, so a query
  // containing those characters matches them literally (see ESCAPE clause below).
  const pattern = `%${escapeLikePattern(q!.replace(/\\/g, "\\\\"))}%`;
  const conditions = [
    or(
      sql`${ticket.jiraKey} LIKE ${pattern} ESCAPE '\\'`,
      sql`${ticket.title} LIKE ${pattern} ESCAPE '\\'`,
    ),
    notDeleted,
    ...buildFilterConditions(filters, isKeySearch),
  ];

  if (exclude) {
    conditions.push(ne(ticket.jiraKey, exclude));
  }

  const localResults = await db
    .select(candidateColumns)
    .from(ticket)
    .leftJoin(sprintNameCache, eq(ticket.sprintName, sprintNameCache.sprintId))
    .where(and(...conditions))
    .limit(PAGE_SIZE + 1)
    .offset(offset);

  const hasMore = localResults.length > PAGE_SIZE;
  if (hasMore) localResults.pop();

  const results: SearchResult[] = localResults.map((r) => mapRow(r, "local"));

  // Skip Jira fallback on paginated requests, when we have enough, when disabled,
  // or when user filters are active (the Jira text search can't honor them, so it
  // would surface results that violate the chosen filters).
  if (offset > 0 || results.length >= SPARSE_THRESHOLD || !jiraEnabled || hasUserFilters) {
    return NextResponse.json({ results, hasMore, facets });
  }

  // Fallback to Jira when local results are sparse
  const localKeys = new Set(results.map((r) => r.key));
  try {
    if (isKeySearch) {
      const issue = await jiraClient.getIssue(q!.toUpperCase());
      if (issue && (!exclude || issue.key !== exclude) && !localKeys.has(issue.key)) {
        results.push({
          key: issue.key,
          title: issue.fields.summary,
          type: issue.fields.issuetype?.name?.toLowerCase() ?? "task",
          status: issue.fields.status?.name ?? "To Do",
          sprintName: null,
          epicKey: null,
          assignee: issue.fields.assignee?.displayName ?? null,
          jiraUpdatedAt: null,
          project: projectOf(issue.key),
          source: "jira",
        });
      }
    } else {
      const jql = `text ~ "${escapeJql(q!)}" ORDER BY updated DESC`;
      const issues = await jiraClient.searchIssues(jql, ["summary", "status", "issuetype"], 10);
      for (const i of issues) {
        if (i.key === exclude || localKeys.has(i.key)) continue;
        results.push({
          key: i.key,
          title: i.fields.summary,
          type: i.fields.issuetype?.name?.toLowerCase() ?? "task",
          status: i.fields.status?.name ?? "To Do",
          sprintName: null,
          epicKey: null,
          assignee: null,
          jiraUpdatedAt: null,
          project: projectOf(i.key),
          source: "jira",
        });
      }
    }
  } catch {
    // Jira unavailable: return whatever local results we have
  }

  return NextResponse.json({ results, hasMore, facets });
}
