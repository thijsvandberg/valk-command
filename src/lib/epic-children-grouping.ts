import type { EpicChild, Subtask, Sprint } from "@/types/ticket";

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
