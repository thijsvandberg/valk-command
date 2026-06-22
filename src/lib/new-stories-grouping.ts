import { TEAMS, extractTeamPrefix, type Team } from "@/lib/sprint-utils";
import type { NewStoryRow } from "@/lib/new-stories-types";

// New stories inbox grouping (BRDG-356). Pure functions so the team resolution,
// date bucketing and ordering are unit-testable without the page.

export type TeamKey = Team | "unassigned";
export type DateBucket = "today" | "yesterday" | "this_week" | "previous_week" | "older";

export const DATE_BUCKET_LABELS: Record<DateBucket, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This week",
  previous_week: "Previous week",
  older: "Older",
};

const DATE_BUCKET_ORDER: DateBucket[] = ["today", "yesterday", "this_week", "previous_week", "older"];

export const UNASSIGNED_TEAM_LABEL = "Unassigned team";

export interface UserTeamAssignment {
  displayName: string;
  teams: Team[];
}

export interface DateGroup {
  bucket: DateBucket;
  label: string;
  rows: NewStoryRow[];
}

export interface TeamSection {
  /** Resolved team, "unassigned", or null when not grouping by team. */
  team: TeamKey | null;
  /** Heading label, or null in date-only mode. */
  label: string | null;
  isOwnTeam: boolean;
  dateGroups: DateGroup[];
  count: number;
}

export interface NewStoriesGroups {
  /** true = grouped by team (a default team is set); false = date-only. */
  grouped: boolean;
  sections: TeamSection[];
}

// Maps a reporter display name to its team. People can be on several teams, so
// when a default team is set and the reporter belongs to it, that wins (it keeps
// the PO's own work in their section); otherwise the first listed team is used.
export function buildTeamMap(assignments: UserTeamAssignment[]): Map<string, Team[]> {
  const map = new Map<string, Team[]>();
  for (const a of assignments) {
    if (a && typeof a.displayName === "string") map.set(a.displayName, a.teams ?? []);
  }
  return map;
}

export function resolveTeam(
  reporterName: string | null | undefined,
  teamMap: Map<string, Team[]>,
  defaultTeam: Team | null,
): TeamKey {
  if (!reporterName) return "unassigned";
  const teams = teamMap.get(reporterName);
  if (!teams || teams.length === 0) return "unassigned";
  if (defaultTeam && teams.includes(defaultTeam)) return defaultTeam;
  return teams[0];
}

function utcDayNumber(d: Date): number {
  return Math.floor(d.getTime() / 86_400_000);
}

export function dateBucket(iso: string | null | undefined, now: Date): DateBucket {
  if (!iso) return "older";
  const created = new Date(iso);
  if (Number.isNaN(created.getTime())) return "older";
  const diff = utcDayNumber(now) - utcDayNumber(created);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff <= 7) return "this_week";
  if (diff <= 14) return "previous_week";
  return "older";
}

// Splits rows into the four date buckets, preserving incoming order (the
// endpoint already sorts newest-first) and dropping empty buckets.
function toDateGroups(rows: NewStoryRow[], now: Date): DateGroup[] {
  const byBucket = new Map<DateBucket, NewStoryRow[]>();
  for (const row of rows) {
    const bucket = dateBucket(row.jiraCreatedAt, now);
    const list = byBucket.get(bucket) ?? [];
    list.push(row);
    byBucket.set(bucket, list);
  }
  return DATE_BUCKET_ORDER.filter((b) => byBucket.has(b)).map((bucket) => ({
    bucket,
    label: DATE_BUCKET_LABELS[bucket],
    rows: byBucket.get(bucket)!,
  }));
}

export interface GroupOptions {
  assignments: UserTeamAssignment[];
  defaultTeam: Team | null;
  now: Date;
}

export function groupNewStories(rows: NewStoryRow[], opts: GroupOptions): NewStoriesGroups {
  const { assignments, defaultTeam, now } = opts;

  // No default team: plain date-only grouping, no team priority (BRDG-356).
  if (!defaultTeam) {
    return {
      grouped: false,
      sections: [
        {
          team: null,
          label: null,
          isOwnTeam: false,
          dateGroups: toDateGroups(rows, now),
          count: rows.length,
        },
      ],
    };
  }

  const teamMap = buildTeamMap(assignments);
  const byTeam = new Map<TeamKey, NewStoryRow[]>();
  for (const row of rows) {
    const team = resolveTeam(row.reporter?.name, teamMap, defaultTeam);
    const list = byTeam.get(team) ?? [];
    list.push(row);
    byTeam.set(team, list);
  }

  // Own team first, then the remaining known teams in their canonical order,
  // and the "Unassigned team" bucket always last.
  const orderedTeams: TeamKey[] = [
    defaultTeam,
    ...TEAMS.filter((t) => t !== defaultTeam),
    "unassigned",
  ];

  const sections: TeamSection[] = orderedTeams
    .filter((team) => byTeam.has(team))
    .map((team) => {
      const teamRows = byTeam.get(team)!;
      return {
        team,
        label: team === "unassigned" ? UNASSIGNED_TEAM_LABEL : team,
        isOwnTeam: team === defaultTeam,
        dateGroups: toDateGroups(teamRows, now),
        count: teamRows.length,
      };
    });

  return { grouped: true, sections };
}

// --- Flat, configurable grouping (BRDG-358) -------------------------------
// The inbox's group-by control switches between these single-level groupings.
// Unlike the BRDG-356 team+date nesting above, each row lands in exactly one
// group. GroupStatBar/GroupCard render the headers, so a group only needs a
// key, label and its rows.

export type InboxGroupBy = "date" | "epic" | "creator" | "sprint" | "relevance";

// --- Relevance ladder (BRDG-372) ------------------------------------------
// Orders incoming stories by how relevant they are to the PO and their team.
// First-match-wins down the ladder, except `other_pos` is only reached after
// the team/backlog buckets, so a PO-created story that lands on my team's
// board or comes from a teammate keeps that (higher) bucket.

export type RelevanceBucket =
  | "team_board"
  | "teammates"
  | "generic_backlog"
  | "everything_else"
  | "other_pos";

export const RELEVANCE_BUCKETS: RelevanceBucket[] = [
  "team_board",
  "teammates",
  "generic_backlog",
  "everything_else",
  "other_pos",
];

export const RELEVANCE_BUCKET_LABELS: Record<RelevanceBucket, string> = {
  team_board: "On your team's board",
  teammates: "From your teammates",
  generic_backlog: "Generic backlog",
  everything_else: "Everything else",
  other_pos: "From other POs",
};

export interface RelevanceOptions {
  /** The PO's own team ("which team is mine"). */
  myTeam: Team | null;
  /** Reporter-name → teams map (see buildTeamMap). */
  teamMap: Map<string, Team[]>;
  /** AccountIds of people flagged as POs. */
  poAccountIds: Set<string>;
  /** Display names of people flagged as POs (fallback for name-only entries). */
  poNames: Set<string>;
}

function reporterIsPo(row: NewStoryRow, opts: RelevanceOptions): boolean {
  const accountId = row.reporter?.accountId;
  if (accountId && opts.poAccountIds.has(accountId)) return true;
  const name = row.reporter?.name;
  return !!name && opts.poNames.has(name);
}

// Classifies a single row into one relevance bucket. Reuses extractTeamPrefix /
// resolveTeam so no new sprint-naming logic is introduced (BRDG-372 AC7).
export function classifyInboxRelevance(row: NewStoryRow, opts: RelevanceOptions): RelevanceBucket {
  const { myTeam, teamMap } = opts;
  const reporterOnMyTeam = !!myTeam && resolveTeam(row.reporter?.name, teamMap, myTeam) === myTeam;

  // 1. On my team's sprint or backlog ("BT: 138" / "BT: Backlog"), but created
  //    by someone who is not a teammate.
  if (myTeam && row.sprintName && extractTeamPrefix(row.sprintName) === myTeam && !reporterOnMyTeam) {
    return "team_board";
  }
  // 2. Created by a teammate, wherever it sits.
  if (reporterOnMyTeam) return "teammates";
  // 3. On the generic project backlog (no sprint).
  if (row.sprintName == null) return "generic_backlog";
  // 4/5. Remaining rows: another PO's work sinks below everything else.
  return reporterIsPo(row, opts) ? "other_pos" : "everything_else";
}

export interface InboxGroup {
  /** Unique group key (bucket name, epic key, reporter name, or a sentinel). */
  key: string;
  label: string;
  rows: NewStoryRow[];
}

export interface InboxGroupOptions {
  groupBy: InboxGroupBy;
  now: Date;
  /** Relevance inputs; required only when groupBy === "relevance". */
  relevance?: RelevanceOptions;
}

const NO_EPIC_KEY = "__no_epic__";
const UNKNOWN_REPORTER_KEY = "__unknown_reporter__";
const NO_SPRINT_KEY = "__no_sprint__";

// Groups rows by a string field, ordering the known buckets alphabetically by
// label and pinning a single sentinel bucket (no value) last. Row order within
// a bucket is preserved (the endpoint already sorts newest-first).
function groupByField(
  rows: NewStoryRow[],
  keyOf: (row: NewStoryRow) => string | null | undefined,
  sentinelKey: string,
  sentinelLabel: string,
): InboxGroup[] {
  const byKey = new Map<string, NewStoryRow[]>();
  const labels = new Map<string, string>();
  for (const row of rows) {
    const value = keyOf(row);
    const key = value || sentinelKey;
    const label = value || sentinelLabel;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(row);
    labels.set(key, label);
  }

  const named = [...byKey.keys()].filter((k) => k !== sentinelKey);
  named.sort((a, b) => labels.get(a)!.localeCompare(labels.get(b)!));
  const ordered = byKey.has(sentinelKey) ? [...named, sentinelKey] : named;

  return ordered.map((key) => ({ key, label: labels.get(key)!, rows: byKey.get(key)! }));
}

// Buckets rows by relevance, emitting non-empty buckets in ladder order and
// preserving incoming row order (the endpoint already sorts newest-first).
function groupByRelevance(rows: NewStoryRow[], opts: RelevanceOptions): InboxGroup[] {
  const byBucket = new Map<RelevanceBucket, NewStoryRow[]>();
  for (const row of rows) {
    const bucket = classifyInboxRelevance(row, opts);
    if (!byBucket.has(bucket)) byBucket.set(bucket, []);
    byBucket.get(bucket)!.push(row);
  }
  return RELEVANCE_BUCKETS.filter((b) => byBucket.has(b)).map((bucket) => ({
    key: bucket,
    label: RELEVANCE_BUCKET_LABELS[bucket],
    rows: byBucket.get(bucket)!,
  }));
}

function groupByDate(rows: NewStoryRow[], now: Date): InboxGroup[] {
  const byBucket = new Map<DateBucket, NewStoryRow[]>();
  for (const row of rows) {
    const bucket = dateBucket(row.jiraCreatedAt, now);
    if (!byBucket.has(bucket)) byBucket.set(bucket, []);
    byBucket.get(bucket)!.push(row);
  }
  return DATE_BUCKET_ORDER.filter((b) => byBucket.has(b)).map((bucket) => ({
    key: bucket,
    label: DATE_BUCKET_LABELS[bucket],
    rows: byBucket.get(bucket)!,
  }));
}

export function groupInboxStories(rows: NewStoryRow[], opts: InboxGroupOptions): InboxGroup[] {
  switch (opts.groupBy) {
    case "epic":
      return groupByField(rows, (r) => r.epic, NO_EPIC_KEY, "No epic");
    case "creator":
      return groupByField(rows, (r) => r.reporter?.name, UNKNOWN_REPORTER_KEY, "Unknown reporter");
    case "sprint":
      return groupByField(rows, (r) => r.sprintName, NO_SPRINT_KEY, "No sprint");
    case "relevance":
      // Relevance needs a team; without one (or its inputs) fall back to date so
      // the inbox never renders empty (BRDG-372).
      return opts.relevance && opts.relevance.myTeam
        ? groupByRelevance(rows, opts.relevance)
        : groupByDate(rows, opts.now);
    case "date":
    default:
      return groupByDate(rows, opts.now);
  }
}
