"use client";

import { useCallback, useMemo } from "react";
// useSWRConfig, not the top-level "swr" mutate: the app's custom cache provider
// makes the global mutate a silent no-op for provider-backed keys (BRDG-458).
import useSWR, { useSWRConfig } from "swr";
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

  const { mutate } = useSWRConfig();
  const setCapacity = useCallback(async (sprintId: string, capacity: number | null) => {
    void mutate(
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
      void mutate(KEY);
    }
  }, [mutate]);

  return { capacityMap, setCapacity };
}
