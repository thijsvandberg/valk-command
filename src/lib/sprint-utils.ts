export const TEAMS = ["BO", "BM", "BT", "GXP", "HT"] as const;
export type Team = (typeof TEAMS)[number];

export function extractTeamPrefix(sprintName: string): string | null {
  const match = sprintName.match(/^([A-Z]+)[: ]/);
  return match ? match[1] : null;
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
  const order: Record<string, number> = { active: 0, future: 1, closed: 2, backlog: 3 };
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
