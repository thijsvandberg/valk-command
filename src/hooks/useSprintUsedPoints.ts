"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { swrFetcher } from "@/lib/api-client";

// Forward-planning sprint load (BRDG-303). Maps sprintId -> total effective
// points across ALL tickets in that sprint, so the epic-children-by-sprint
// fullness meter reflects the whole sprint, not just the open epic's children.

const KEY = "/api/sprints/used-points";

interface UsedRow {
  sprintId: string;
  used: number;
}

export function useSprintUsedPoints(enabled = true) {
  const { data } = useSWR<UsedRow[]>(enabled ? KEY : null, swrFetcher, {
    revalidateOnFocus: false,
  });

  return useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of data ?? []) map[row.sprintId] = row.used;
    return map;
  }, [data]);
}
