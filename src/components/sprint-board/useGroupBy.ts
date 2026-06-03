"use client";

import { useCallback, useMemo } from "react";
import type { Ticket, Sprint } from "@/types/ticket";
import { useSessionStorage } from "@/hooks/useSessionStorage";

export type GroupByOption = "none" | "sprint" | "epic";

export interface TicketGroup {
  key: string;    // unique group key (sprintId or epic name or "__none__")
  label: string;  // display name
  tickets: Ticket[];
  sortOrder: number;
}

// Sprint sort order: active=0, future chronologically, backlog after future, closed reverse-chronologically.
function sprintSortOrder(sprint: Sprint | undefined, sortIndex: number): number {
  if (!sprint) return Infinity;
  if (sprint.state === "active") return 0;
  if (sprint.state === "future") return 1000 + sortIndex;
  if (sprint.state === "backlog") return 1900;
  // closed sprints: shown after future/backlog, reverse-chronological
  return 2000 + (1000 - sortIndex);
}

function groupBySprintFn(
  tickets: Ticket[],
  sprints: Sprint[],
  sprintNameMap: Record<string, string>,
): TicketGroup[] {
  const groupMap = new Map<string, Ticket[]>();

  for (const ticket of tickets) {
    const sid = ticket.sprintId || "__backlog__";
    if (!groupMap.has(sid)) groupMap.set(sid, []);
    groupMap.get(sid)!.push(ticket);
  }

  const groups: TicketGroup[] = [];
  let sprintIndex = 0;
  const seenSprintIds = new Set<string>();

  // First pass: known sprints in order. The Backlog pseudo-sprint is skipped here and
  // handled by the dedicated block below, so it is added exactly once and stays last.
  for (const sprint of sprints) {
    if (sprint.id === "__backlog__") continue;
    if (!groupMap.has(sprint.id)) continue;
    seenSprintIds.add(sprint.id);
    groups.push({
      key: sprint.id,
      label: sprint.name,
      tickets: groupMap.get(sprint.id)!,
      sortOrder: sprintSortOrder(sprint, sprintIndex++),
    });
  }

  // Second pass: sprintIds in tickets that don't match any known sprint
  for (const [sid, ticketList] of groupMap) {
    if (sid === "__backlog__" || seenSprintIds.has(sid)) continue;
    groups.push({
      key: sid,
      label: sprintNameMap[sid] ?? sid,
      tickets: ticketList,
      sortOrder: 3000,
    });
  }

  // Backlog group always last
  if (groupMap.has("__backlog__")) {
    groups.push({
      key: "__backlog__",
      label: "Backlog",
      tickets: groupMap.get("__backlog__")!,
      sortOrder: Infinity,
    });
  }

  groups.sort((a, b) => a.sortOrder - b.sortOrder);
  return groups;
}

function groupByEpicFn(tickets: Ticket[]): TicketGroup[] {
  const groupMap = new Map<string, Ticket[]>();

  for (const ticket of tickets) {
    const epicKey = ticket.epic ?? "__none__";
    if (!groupMap.has(epicKey)) groupMap.set(epicKey, []);
    groupMap.get(epicKey)!.push(ticket);
  }

  const groups: TicketGroup[] = [];
  let epicIndex = 0;

  for (const [epicKey, ticketList] of groupMap) {
    if (epicKey === "__none__") continue;
    groups.push({
      key: epicKey,
      label: epicKey,
      tickets: ticketList,
      sortOrder: epicIndex++,
    });
  }

  // Sort alphabetically
  groups.sort((a, b) => a.label.localeCompare(b.label));

  if (groupMap.has("__none__")) {
    groups.push({
      key: "__none__",
      label: "No epic",
      tickets: groupMap.get("__none__")!,
      sortOrder: Infinity,
    });
  }

  return groups;
}

export function useGroupBy(
  tickets: Ticket[],
  sprints: Sprint[],
  sprintNameMap: Record<string, string>,
  isAllView: boolean,
) {
  const [groupBy, setGroupBy] = useSessionStorage<GroupByOption>("sprint-board-group-by", "none");
  const [collapsedGroupsArr, setCollapsedGroupsArr] = useSessionStorage<string[]>("sprint-board-collapsed-groups", []);

  const collapsedGroups = useMemo(() => new Set(collapsedGroupsArr), [collapsedGroupsArr]);

  const toggleCollapse = useCallback((groupKey: string) => {
    setCollapsedGroupsArr((prev) => {
      const s = new Set(prev);
      if (s.has(groupKey)) s.delete(groupKey);
      else s.add(groupKey);
      return [...s];
    });
  }, [setCollapsedGroupsArr]);

  const groups = useMemo<TicketGroup[]>(() => {
    if (!isAllView || groupBy === "none") return [];
    if (groupBy === "sprint") return groupBySprintFn(tickets, sprints, sprintNameMap);
    return groupByEpicFn(tickets);
  }, [tickets, sprints, sprintNameMap, isAllView, groupBy]);

  const effectiveGroupBy = isAllView ? groupBy : "none";

  const allCollapsed = useMemo(
    () => groups.length > 0 && groups.every((g) => collapsedGroups.has(g.key)),
    [groups, collapsedGroups],
  );

  const toggleAllGroups = useCallback(() => {
    setCollapsedGroupsArr(allCollapsed ? [] : groups.map((g) => g.key));
  }, [allCollapsed, groups, setCollapsedGroupsArr]);

  return {
    groupBy: effectiveGroupBy,
    setGroupBy,
    collapsedGroups,
    toggleCollapse,
    allCollapsed,
    toggleAllGroups,
    groups,
  };
}
