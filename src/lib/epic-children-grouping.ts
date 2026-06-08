import type { EpicChild, Subtask, Sprint } from "@/types/ticket";
import { isRegularSprint, nextSprintName } from "./sprint-utils";

export const UNSCHEDULED_GROUP_KEY = "__unscheduled__";

// Key for the synthetic "create the next sprint" drop zone (BRDG-309). Distinct
// from a real sprint name so the component can tell it apart from BRDG-306's
// existing-sprint zone and route its drop to the create flow.
export const CREATE_NEXT_SPRINT_GROUP_KEY = "__create-next-sprint__";

export interface ChildGroup {
  /** Group key: the sprint name, or UNSCHEDULED_GROUP_KEY for children without a sprint. */
  key: string;
  label: string;
  /** The sprint name for this group, or null for the Unscheduled group. */
  sprintName: string | null;
  items: (EpicChild | Subtask)[];
  /** True when the matched sprint is the currently running (active) one. */
  isActive: boolean;
  /** Sprint state from the matched metadata, or null when no metadata matched. */
  state: Sprint["state"] | null;
  /** Human-readable date range from the matched sprint, or null. */
  dateRange: string | null;
  /** Marks the BRDG-309 synthetic zone whose drop opens the Create Sprint modal. */
  isCreateZone?: boolean;
  /**
   * Marks a synthetic, drag-only empty drop zone (the next-sprint move zone, the
   * create zone, or a backlog zone). These carry no rows, so collision detection
   * must let them win on a pointer-within hit instead of losing to nearby rows.
   */
  isDropZone?: boolean;
}

// Chronological state ordering for the epic view: past (closed) leads up to the
// current (active) sprint, then upcoming (future). Backlog sits after future.
const STATE_ORDER: Record<Sprint["state"], number> = {
  closed: 0,
  active: 1,
  future: 2,
  backlog: 3,
};

function childSprintName(child: EpicChild | Subtask): string | null {
  // Locally-added items are plain Subtasks without a sprintName property.
  return "sprintName" in child ? child.sprintName : null;
}

/**
 * Sorts named sprint groups chronologically (closed → active → future → backlog),
 * then dated sprints by start date with undated/unmatched ones last. Mutates and
 * returns the array. Shared so a synthetic group (BRDG-306) can be folded into the
 * same ordering as the real groups.
 */
export function sortNamedGroups(named: ChildGroup[], sprints: Sprint[]): ChildGroup[] {
  const sprintByName = new Map<string, Sprint>();
  for (const s of sprints) sprintByName.set(s.name, s);

  named.sort((a, b) => {
    const aSprint = sprintByName.get(a.sprintName!);
    const bSprint = sprintByName.get(b.sprintName!);
    // Matched sprints sort ahead of unmatched (unknown) ones.
    if (!!aSprint !== !!bSprint) return aSprint ? -1 : 1;
    if (aSprint && bSprint) {
      const order = STATE_ORDER[aSprint.state] - STATE_ORDER[bSprint.state];
      if (order !== 0) return order;
      // Within a state, dated sprints lead and order by start date; sprints
      // without a schedule (e.g. a backlog-style sprint) are "the rest" and
      // sink to the bottom instead of jumping ahead on an empty date.
      const aDate = aSprint.startDate ?? null;
      const bDate = bSprint.startDate ?? null;
      if ((aDate === null) !== (bDate === null)) return aDate === null ? 1 : -1;
      if (aDate && bDate && aDate !== bDate) return aDate.localeCompare(bDate);
    }
    return a.label.localeCompare(b.label);
  });
  return named;
}

/**
 * The next regular sprint in the series to surface as a drop target while a child
 * is being dragged in the by-sprint view (BRDG-306). Looks at the currently shown
 * named groups, takes the highest regular numeric sprint (placeholders like
 * `GXP: Backlog`/`BT: TODO` and the Unscheduled group are ignored), and returns a
 * zero-item group for `<PREFIX>: <highest + 1>` — but only when a real sprint with
 * that exact name exists and is not already shown. Strictly `+1`: a missing number
 * yields null rather than skipping ahead.
 */
export function nextRegularSprintGroup(
  visibleGroups: ChildGroup[],
  sprints: Sprint[],
): ChildGroup | null {
  const regularNames = visibleGroups
    .map((g) => g.sprintName)
    .filter((name): name is string => name !== null && isRegularSprint(name));
  if (regularNames.length === 0) return null;

  const candidateName = nextSprintName(regularNames.map((name) => ({ name })));
  if (!candidateName) return null;
  if (visibleGroups.some((g) => g.sprintName === candidateName)) return null;

  const match = sprints.find((s) => s.name === candidateName);
  if (!match) return null;

  return {
    key: candidateName,
    label: candidateName,
    sprintName: candidateName,
    items: [],
    isActive: match.state === "active",
    state: match.state,
    dateRange: match.dateRange || null,
    isDropZone: true,
  };
}

/**
 * The next regular sprint name to *create* while dragging in the by-sprint view
 * (BRDG-309). The inverse of `nextRegularSprintGroup`'s existence check: returns
 * the candidate `<PREFIX>: <highest + 1>` name only when it can be derived from
 * the visible regular groups **and** no sprint with that name exists yet. Returns
 * null when no regular sprint is visible, the candidate is already shown, or the
 * candidate already exists (that slot belongs to BRDG-306's plain move zone).
 * The two zones are therefore mutually exclusive for the same next-sprint slot.
 */
export function canPlanNextSprint(
  visibleGroups: ChildGroup[],
  sprints: Sprint[],
): string | null {
  const regularNames = visibleGroups
    .map((g) => g.sprintName)
    .filter((name): name is string => name !== null && isRegularSprint(name));
  if (regularNames.length === 0) return null;

  const candidateName = nextSprintName(regularNames.map((name) => ({ name })));
  if (!candidateName) return null;
  if (visibleGroups.some((g) => g.sprintName === candidateName)) return null;
  // Exists already -> BRDG-306 owns this slot; this story stays inert.
  if (sprints.some((s) => s.name === candidateName)) return null;

  return candidateName;
}

/**
 * The synthetic "create the next sprint" drop zone (BRDG-309), or null when no
 * next sprint can be planned. Carries the predicted name so the component can
 * label the zone and the drop can prefill the Create Sprint modal. Has no matched
 * sprint metadata (the sprint does not exist yet), so it sorts after every dated
 * group, landing in the trailing next-sprint slot via `sortNamedGroups`.
 */
export function nextRegularSprintCreateGroup(
  visibleGroups: ChildGroup[],
  sprints: Sprint[],
): ChildGroup | null {
  const candidateName = canPlanNextSprint(visibleGroups, sprints);
  if (!candidateName) return null;

  return {
    key: CREATE_NEXT_SPRINT_GROUP_KEY,
    label: candidateName,
    sprintName: candidateName,
    items: [],
    isActive: false,
    state: null,
    dateRange: null,
    isCreateZone: true,
    isDropZone: true,
  };
}

// The team token of a sprint name: the part before the first colon ("BT: 141" ->
// "BT", "Design: Backlog" -> "Design"), or null when there is no colon ("Backlog").
function sprintTeamToken(name: string): string | null {
  const idx = name.indexOf(":");
  return idx > 0 ? name.slice(0, idx).trim() : null;
}

// A "backlog" sprint is identified by name, not state: Jira only reports
// active/future/closed, so the team backlogs ("BT: Backlog", "GXP: Backlog") and a
// plain "Backlog" all arrive as future. The name ends in "Backlog".
function isBacklogSprintName(name: string): boolean {
  return /(^|:\s*)backlog$/i.test(name.trim());
}

/**
 * Backlog sprints to surface as empty drop zones while dragging, so a child can be
 * pushed into a backlog the epic isn't in yet (e.g. the team's `BT: Backlog`). Only
 * backlogs relevant to the epic appear: a team-less `Backlog`, plus any whose team
 * token matches a sprint already on the board. Other teams' backlogs stay out of the
 * way. Backlogs already shown as groups (they have children) are excluded.
 */
export function backlogDropGroups(visibleGroups: ChildGroup[], sprints: Sprint[]): ChildGroup[] {
  const visibleNames = new Set(
    visibleGroups.map((g) => g.sprintName).filter((n): n is string => n !== null),
  );
  const visibleTeams = new Set(
    visibleGroups
      .map((g) => g.sprintName)
      .filter((n): n is string => n !== null)
      .map(sprintTeamToken)
      .filter((t): t is string => t !== null),
  );

  return sprints
    .filter((s) => isBacklogSprintName(s.name) && !visibleNames.has(s.name))
    .filter((s) => {
      const team = sprintTeamToken(s.name);
      return team === null || visibleTeams.has(team);
    })
    .map((s) => ({
      key: s.name,
      label: s.name,
      sprintName: s.name,
      items: [],
      isActive: false,
      state: s.state,
      dateRange: s.dateRange || null,
      isDropZone: true,
    }));
}

/**
 * Groups epic children by their sprint name. Children without a sprint (or
 * locally-added subtasks) collect into a single "Unscheduled" group pinned last.
 *
 * When `sprints` metadata is supplied, each named group is correlated to its
 * sprint by matching `sprintName === sprint.name`, populating state/date range/
 * active flag, and groups are ordered chronologically (closed → active → future,
 * then dated sprints by start date with undated ones last). Without metadata,
 * named groups keep a stable alphabetical order.
 */
export function groupChildrenBySprint(
  items: (EpicChild | Subtask)[],
  sprints: Sprint[] = [],
): ChildGroup[] {
  const sprintByName = new Map<string, Sprint>();
  for (const s of sprints) sprintByName.set(s.name, s);

  const buckets = new Map<string, (EpicChild | Subtask)[]>();
  for (const item of items) {
    const name = childSprintName(item);
    const key = name ?? UNSCHEDULED_GROUP_KEY;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(item);
  }

  const named: ChildGroup[] = [];
  for (const [key, groupItems] of buckets) {
    if (key === UNSCHEDULED_GROUP_KEY) continue;
    const sprint = sprintByName.get(key);
    named.push({
      key,
      label: key,
      sprintName: key,
      items: groupItems,
      isActive: sprint?.state === "active",
      state: sprint?.state ?? null,
      dateRange: sprint?.dateRange || null,
    });
  }

  sortNamedGroups(named, sprints);

  const groups = named;

  const unscheduled = buckets.get(UNSCHEDULED_GROUP_KEY);
  if (unscheduled && unscheduled.length > 0) {
    groups.push({
      key: UNSCHEDULED_GROUP_KEY,
      label: "Unscheduled",
      sprintName: null,
      items: unscheduled,
      isActive: false,
      state: null,
      dateRange: null,
    });
  }

  return groups;
}
