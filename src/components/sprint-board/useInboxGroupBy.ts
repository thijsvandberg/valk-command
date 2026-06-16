"use client";

import { useCallback, useMemo } from "react";
import { useSessionStorage } from "@/hooks/useSessionStorage";
import {
  groupInboxStories,
  type InboxGroup,
  type InboxGroupBy,
} from "@/lib/new-stories-grouping";
import type { NewStoryRow } from "@/lib/new-stories-types";

// Group-by + collapsed-group state for the New story inbox (BRDG-358). Mirrors
// the board's useGroupBy persistence but under inbox-only session keys, so the
// Sprint Board's grouping/collapse state is never touched. Operates on the
// lighter NewStoryRow via the pure groupInboxStories functions.
const GROUP_BY_KEY = "inbox-group-by";
const COLLAPSED_KEY = "inbox-collapsed-groups";

export function useInboxGroupBy(rows: NewStoryRow[]) {
  const [groupBy, setGroupBy] = useSessionStorage<InboxGroupBy>(GROUP_BY_KEY, "date");
  const [collapsedArr, setCollapsedArr] = useSessionStorage<string[]>(COLLAPSED_KEY, []);

  const collapsedGroups = useMemo(() => new Set(collapsedArr), [collapsedArr]);

  const toggleCollapse = useCallback(
    (groupKey: string) => {
      setCollapsedArr((prev) => {
        const s = new Set(prev);
        if (s.has(groupKey)) s.delete(groupKey);
        else s.add(groupKey);
        return [...s];
      });
    },
    [setCollapsedArr],
  );

  // Date bucketing is day-granular, so a per-render `now` is fine; recomputed
  // only when the rows or the grouping mode change.
  const groups = useMemo<InboxGroup[]>(
    () => groupInboxStories(rows, { groupBy, now: new Date() }),
    [rows, groupBy],
  );

  return { groupBy, setGroupBy, groups, collapsedGroups, toggleCollapse };
}
