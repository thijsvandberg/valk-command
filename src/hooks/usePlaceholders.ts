"use client";

import { useCallback, useMemo } from "react";
import useSWR from "swr";
import { swrFetcher, placeholders as placeholdersApi } from "@/lib/api-client";
import type { PlaceholderTicket } from "@/types/ticket";

// Forward-planning placeholder tickets (BRDG-304). Fetched only while the view's
// planning mode is on (enabled), so the default board makes no extra request. Scoped
// by sprint or epic via the filter. Exposes optimistic create/update/remove/promote.

interface UsePlaceholdersOptions {
  sprintId?: string | null;
  epicKey?: string | null;
}

export function usePlaceholders(enabled: boolean, opts: UsePlaceholdersOptions = {}) {
  const { sprintId, epicKey } = opts;
  const key = enabled ? placeholdersApi.listUrl({ sprintId, epicKey }) : null;
  const { data, mutate } = useSWR<PlaceholderTicket[]>(key, swrFetcher, {
    revalidateOnFocus: false,
  });

  const placeholders = useMemo(() => data ?? [], [data]);

  const create = useCallback(
    async (input: Partial<PlaceholderTicket> & { title: string }) => {
      const created = await placeholdersApi.create(input);
      mutate((cur) => [created, ...(cur ?? [])], { revalidate: false });
      return created;
    },
    [mutate],
  );

  const update = useCallback(
    async (id: string, patch: Partial<PlaceholderTicket>) => {
      mutate(
        (cur) => (cur ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)),
        { revalidate: false },
      );
      try {
        const updated = await placeholdersApi.update(id, patch);
        mutate((cur) => (cur ?? []).map((p) => (p.id === id ? updated : p)), { revalidate: false });
        return updated;
      } catch (err) {
        mutate();
        throw err;
      }
    },
    [mutate],
  );

  const remove = useCallback(
    async (id: string) => {
      mutate((cur) => (cur ?? []).filter((p) => p.id !== id), { revalidate: false });
      try {
        await placeholdersApi.remove(id);
      } catch (err) {
        mutate();
        throw err;
      }
    },
    [mutate],
  );

  const promote = useCallback(
    async (id: string) => {
      const result = await placeholdersApi.promote(id);
      // The promoted placeholder leaves the active list; drop it locally.
      mutate((cur) => (cur ?? []).filter((p) => p.id !== id), { revalidate: false });
      return result;
    },
    [mutate],
  );

  // Reorder a sprint group's placeholders (BRDG-328). Patches local orderIndex
  // optimistically so the dragged row settles in place, then persists.
  const reorder = useCallback(
    async (orderedIds: string[]) => {
      const rank = new Map(orderedIds.map((id, i) => [id, i]));
      mutate(
        (cur) => (cur ?? []).map((p) => (rank.has(p.id) ? { ...p, orderIndex: rank.get(p.id)! } : p)),
        { revalidate: false },
      );
      try {
        await placeholdersApi.reorder(orderedIds);
      } catch (err) {
        mutate();
        throw err;
      }
    },
    [mutate],
  );

  return { placeholders, mutate, create, update, remove, promote, reorder };
}
