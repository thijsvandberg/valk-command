export const TEAMS = ["BO", "BM", "BT", "GXP", "HT"] as const;
export type Team = (typeof TEAMS)[number];

export function extractTeamPrefix(sprintName: string): string | null {
  const match = sprintName.match(/^([A-Z]+)[: ]/);
  return match ? match[1] : null;
}

// The team token of a sprint name: the part before the first colon ("BT: 141" ->
// "BT", "Design: Backlog" -> "Design"), or null when there is no colon ("Backlog").
// Unlike extractTeamPrefix this is case-preserving and not restricted to uppercase
// runs, so it is the right helper for grouping epic children by their sprint team.
export function sprintTeamToken(name: string): string | null {
  const idx = name.indexOf(":");
  return idx > 0 ? name.slice(0, idx).trim() : null;
}

// --- Regular sprint series (BRDG-305, reused by BRDG-306) ---------------------
// A "regular" sprint follows the `PREFIX: <number>` shape (e.g. `BT: 138`). The
// number drives ordering and the next-sprint suggestion; placeholder sprints
// (`BT: TODO`, `Backlog`, `Unscheduled`) have no number and are excluded. This is
// the single source of truth for the number regex, shared with the velocity route.

/** First number after the team prefix: "BT: 133" -> 133, "BT: 130 - Align" -> 130, else Infinity. */
export function sprintNumber(name: string): number {
  const m = name.match(/[: ]\s*(\d+)/);
  return m ? parseInt(m[1], 10) : Infinity;
}

/** A regular numeric sprint has both a team prefix and a finite series number. */
export function isRegularSprint(name: string): boolean {
  return extractTeamPrefix(name) !== null && Number.isFinite(sprintNumber(name));
}

// --- Backlog & preset classification (BRDG-319) ------------------------------
// Jira only reports active/future/closed, so the team backlogs ("BT: Backlog",
// "GXP: Backlog") and a plain "Backlog" all arrive as future and are recognised by
// name. Single source of truth, shared by the views bar and epic-children grouping.

/** A backlog sprint: name ends in "Backlog" ("Backlog", "BT: Backlog", "GXP: Backlog"). */
export function isBacklogSprintName(name: string): boolean {
  return /(^|:\s*)backlog$/i.test(name.trim());
}

/** The "Overall refinement" cross-team bucket, surfaced as a preset filter, not a pill. */
export function isOverallRefinementSprint(name: string): boolean {
  return /overall refinement/i.test(name);
}

interface NamedSprint {
  name: string;
  endDate?: string | null;
}

export interface RegularSprintInfo<T extends NamedSprint = NamedSprint> {
  prefix: string;
  number: number;
  sprint: T;
}

/**
 * The highest-numbered regular sprint, with its prefix and the sprint itself
 * (so callers can read its endDate). Ties resolve to the last one seen. Returns
 * null when no regular sprint exists.
 */
export function latestRegularSprint<T extends NamedSprint>(sprints: T[]): RegularSprintInfo<T> | null {
  let best: RegularSprintInfo<T> | null = null;
  for (const sprint of sprints) {
    if (!isRegularSprint(sprint.name)) continue;
    const number = sprintNumber(sprint.name);
    const prefix = extractTeamPrefix(sprint.name)!;
    if (!best || number >= best.number) best = { prefix, number, sprint };
  }
  return best;
}

/** Next name in the regular series ("BT: 139" -> "BT: 140"), or "" when none exists. */
export function nextSprintName(sprints: NamedSprint[]): string {
  const latest = latestRegularSprint(sprints);
  return latest ? `${latest.prefix}: ${latest.number + 1}` : "";
}

/**
 * Next name relative to ONE given sprint name ("BT: 139" -> "BT: 140"), or "" when the
 * given name is not a regular numbered sprint. Unlike `nextSprintName`, which looks at the
 * latest across a list, this is the next of a specific sprint (BRDG-369 quick-move).
 */
export function nextSprintNameFrom(currentName: string): string {
  if (!isRegularSprint(currentName)) return "";
  const prefix = extractTeamPrefix(currentName)!;
  return `${prefix}: ${sprintNumber(currentName) + 1}`;
}

// --- Sprint URL slugs (BRDG-270) ---------------------------------------------
// The Sprint Board encodes the active sprint as a path segment so the board is
// deep-linkable. The numeric Jira id is not human-readable, so we slugify the
// sprint name; the All view and backlog get reserved slugs.

export const ALL_SPRINT_ID = "__all__";
export const BACKLOG_SPRINT_ID = "__backlog__";
export const ALL_SPRINT_SLUG = "all";
export const BACKLOG_SPRINT_SLUG = "backlog";

interface SlugSprint {
  id: string;
  name: string;
  state?: string;
}

export function slugifySprint(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Slug for a single sprint id given the full list, so identical names can be
// disambiguated by appending the numeric id.
export function sprintToSlug(sprintId: string, sprints: SlugSprint[]): string {
  if (sprintId === ALL_SPRINT_ID) return ALL_SPRINT_SLUG;
  if (sprintId === BACKLOG_SPRINT_ID) return BACKLOG_SPRINT_SLUG;
  const sprint = sprints.find((s) => s.id === sprintId);
  if (!sprint) return sprintId;
  const base = slugifySprint(sprint.name) || sprintId;
  const collides = sprints.some((s) => s.id !== sprintId && slugifySprint(s.name) === base);
  return collides ? `${base}-${sprintId}` : base;
}

// Reverse a slug back to a numeric sprint id, or null when nothing matches.
// Handles the reserved slugs and the disambiguated `<slug>-<id>` form.
export function slugToSprintId(slug: string | undefined | null, sprints: SlugSprint[]): string | null {
  if (!slug) return null;
  if (slug === ALL_SPRINT_SLUG) return ALL_SPRINT_ID;
  if (slug === BACKLOG_SPRINT_SLUG) return BACKLOG_SPRINT_ID;

  // Disambiguated form `<base>-<id>` where <id> is a real sprint.
  const trailingId = slug.match(/-(\d+)$/)?.[1];
  if (trailingId && sprints.some((s) => s.id === trailingId)) return trailingId;

  const matches = sprints.filter((s) => slugifySprint(s.name) === slug);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].id;
  // Ambiguous: prefer active, then future, then closed, else first.
  const order: Record<string, number> = { active: 0, future: 1, closed: 2 };
  const sorted = [...matches].sort((a, b) => (order[a.state ?? ""] ?? 9) - (order[b.state ?? ""] ?? 9));
  return sorted[0].id;
}

// Build the Sprint Board path, threading existing query params through so saved
// views (`view`) and other state survive open/close and sprint switches.
export function buildBoardUrl(
  sprintSlug: string | null,
  ticketKey: string | null,
  search?: URLSearchParams | string,
): string {
  const segments = ["/sprint-board"];
  if (sprintSlug) {
    segments.push(encodeURIComponent(sprintSlug));
    if (ticketKey) segments.push(encodeURIComponent(ticketKey));
  }
  const path = segments.join("/");
  const qs = typeof search === "string" ? search : search?.toString();
  return qs ? `${path}?${qs}` : path;
}
