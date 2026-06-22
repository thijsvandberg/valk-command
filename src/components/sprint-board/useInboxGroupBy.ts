"use client";

import { useCallback, useMemo } from "react";
import { useSessionStorage } from "@/hooks/useSessionStorage";
import {
  groupInboxStories,
  type InboxGroup,
  type InboxGroupBy,
  type RelevanceOptions,
} from "@/lib/new-stories-grouping";
import type { NewStoryRow } from "@/lib/new-stories-types";

// Group-by + collapsed-group state for the New story inbox (BRDG-358). Mirrors
// the board's useGroupBy persistence but under inbox-only session keys, so the
// Sprint Board's grouping/collapse state is never touched. Operates on the
// lighter NewStoryRow via the pure groupInboxStories functions.
const GROUP_BY_KEY = "inbox-group-by";
const COLLAPSED_KEY = "inbox-collapsed-groups";

export function useInboxGroupBy(rows: NewStoryRow[], relevance?: RelevanceOptions) {
  const [groupBy, setGroupBy] = useSessionStorage<InboxGroupBy>(GROUP_BY_KEY, "date");
  const [collapsedArr, setCollapsedArr] = useSessionStorage<string[]>(COLLAPSED_KEY, []);

  const collapsedGroups = useMemo(() => new Set(collapsedArr), [collapsedArr]);

  // Relevance has no meaning without a default team: render as date instead of
  // an empty view, but leave the stored choice untouched so re-selecting a team
  // restores Relevance (BRDG-372 AC6).
  const hasTeam = !!relevance?.myTeam;
  const effectiveGroupBy: InboxGroupBy =
    groupBy === "relevance" && !hasTeam ? "date" : groupBy;

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
  // only when the rows, the grouping mode, or the relevance inputs change.
  const groups = useMemo<InboxGroup[]>(
    () => groupInboxStories(rows, { groupBy: effectiveGroupBy, now: new Date(), relevance }),
    [rows, effectiveGroupBy, relevance],
  );

  return { groupBy: effectiveGroupBy, setGroupBy, groups, collapsedGroups, toggleCollapse };
}
