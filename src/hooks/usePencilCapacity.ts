"use client";

import { useCallback, useMemo } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { swrFetcher, apiFetch } from "@/lib/api-client";

// Forward-planning pencil capacity (BRDG-303). Server-persisted per sprint and
// shared (unlike the per-view visibility toggle, which is localStorage). Exposes a
// sprintId -> capacity map plus an optimistic setter. Bridge-local, never in Jira.

const KEY = "/api/sprints/pencil-capacity";

interface CapacityRow {
  sprintId: string;
  capacity: number;
}

export function usePencilCapacity(enabled = true) {
  const { data } = useSWR<CapacityRow[]>(enabled ? KEY : null, swrFetcher, {
    revalidateOnFocus: false,
  });

  const capacityMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of data ?? []) map[row.sprintId] = row.capacity;
    return map;
  }, [data]);

  const setCapacity = useCallback(async (sprintId: string, capacity: number | null) => {
    globalMutate(
      KEY,
      (current: CapacityRow[] | undefined) => {
        const next = (current ?? []).filter((r) => r.sprintId !== sprintId);
        if (capacity != null) next.push({ sprintId, capacity });
        return next;
      },
      { revalidate: false },
    );
    try {
      await apiFetch(KEY, { method: "PUT", body: { sprintId, capacity } });
    } catch (err) {
      console.error("Failed to save pencil capacity:", err);
      globalMutate(KEY);
    }
  }, []);

  return { capacityMap, setCapacity };
}
