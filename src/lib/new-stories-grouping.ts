import { TEAMS, type Team } from "@/lib/sprint-utils";
import type { NewStoryRow } from "@/lib/new-stories-types";

// New stories inbox grouping (BRDG-356). Pure functions so the team resolution,
// date bucketing and ordering are unit-testable without the page.

export type TeamKey = Team | "unassigned";
export type DateBucket = "today" | "yesterday" | "this_week" | "older";

export const DATE_BUCKET_LABELS: Record<DateBucket, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This week",
  older: "Older",
};

const DATE_BUCKET_ORDER: DateBucket[] = ["today", "yesterday", "this_week", "older"];

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
