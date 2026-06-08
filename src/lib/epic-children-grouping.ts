import type { EpicChild, Subtask, Sprint } from "@/types/ticket";
import { isRegularSprint, nextSprintName } from "./sprint-utils";

export const UNSCHEDULED_GROUP_KEY = "__unscheduled__";

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
  };
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
