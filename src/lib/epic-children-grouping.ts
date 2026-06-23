import type { EpicChild, Subtask, Sprint } from "@/types/ticket";
import { isBacklogSprintName, isRegularSprint, nextSprintName, sprintNumber, sprintTeamToken } from "./sprint-utils";

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
      const order = (STATE_ORDER[aSprint.state] ?? 9) - (STATE_ORDER[bSprint.state] ?? 9);
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
 * The next regular sprint name for the by-sprint "create / move" slot (BRDG-306/309).
 * It is the single sprint immediately after the epic's position in its team's series:
 * the highest *visible* numbered sprint + 1 (so it sits right under the last shown
 * `<team>: <n>`). For a backlog-only epic (no numbered sprint shown) the team is read
 * from a visible `<team>: Backlog` and the team's global latest number is extended
 * instead, so a child can still be planned into a new sprint straight from a backlog.
 *
 * Returns null when no team can be determined, or when that next sprint already exists
 * or is already shown - in which case the plain move zone (`nextRegularSprintGroup`)
 * owns the same slot. The two are mutually exclusive: exactly one fills the slot.
 */
export function canPlanNextSprint(
  visibleGroups: ChildGroup[],
  sprints: Sprint[],
): string | null {
  // The epic's own position: the highest visible numbered sprint and its team.
  let team: string | null = null;
  let baseNum = -Infinity;
  for (const g of visibleGroups) {
    if (g.sprintName && isRegularSprint(g.sprintName)) {
      const n = sprintNumber(g.sprintName);
      if (n > baseNum) {
        baseNum = n;
        team = sprintTeamToken(g.sprintName);
      }
    }
  }

  // Backlog-only epic: take the team from a visible "<team>: Backlog" and extend the
  // team's global latest number, so a child can be planned from a backlog directly.
  if (!team) {
    const backlogName = visibleGroups
      .map((g) => g.sprintName)
      .find((n): n is string => !!n && isBacklogSprintName(n));
    if (!backlogName) return null;
    team = sprintTeamToken(backlogName);
    if (!team) return null;
    for (const s of sprints) {
      if (sprintTeamToken(s.name) === team && isRegularSprint(s.name)) {
        const n = sprintNumber(s.name);
        if (n > baseNum) baseNum = n;
      }
    }
  }
  if (!Number.isFinite(baseNum)) return null;

  const candidateName = `${team}: ${baseNum + 1}`;
  // Exists or already shown -> the plain move zone owns this slot (mutual exclusivity).
  if (sprints.some((s) => s.name === candidateName)) return null;
  if (visibleGroups.some((g) => g.sprintName === candidateName)) return null;

  return candidateName;
}

/**
 * Places the create zone in series order: immediately after the team's last numbered
 * group (e.g. right under `BT: 142`), rather than letting it sink to the bottom as an
 * unmatched group would under `sortNamedGroups`. Falls back to appending when the team
 * has no numbered group shown (e.g. a backlog-only epic). Returns a new array.
 */
export function placeNextCreateZone(ordered: ChildGroup[], zone: ChildGroup): ChildGroup[] {
  const team = zone.sprintName ? sprintTeamToken(zone.sprintName) : null;
  let insertAt = -1;
  for (let i = 0; i < ordered.length; i++) {
    const name = ordered[i].sprintName;
    if (name && isRegularSprint(name) && sprintTeamToken(name) === team) insertAt = i;
  }
  if (insertAt === -1) return [...ordered, zone];
  return [...ordered.slice(0, insertAt + 1), zone, ...ordered.slice(insertAt + 1)];
}

/**
 * The synthetic "create the next sprint" drop zone (BRDG-309), or null when no
 * next sprint can be planned. Carries the predicted name so the component can
 * label the zone and the drop can prefill the Create Sprint modal. Positioned via
 * `placeNextCreateZone` so it lands right after the team's last numbered sprint.
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
