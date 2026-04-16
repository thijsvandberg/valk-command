"use client";

import useSWR, { mutate } from "swr";
import { useCallback } from "react";
import {
  serializeFilters,
  deserializeFilters,
  type SearchFilters,
  type SerializedSearchFilters,
} from "@/components/sprint-board/SearchFilterPanel";

const SWR_KEY = "/api/settings/saved-searches";
const MAX_SAVED = 10;

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : { searches: [] }));

export interface SavedSearch {
  id: string;
  label: string;
  query: string;
  filters: SearchFilters;
}

interface SerializedSavedSearch {
  id: string;
  label: string;
  query: string;
  filters: SerializedSearchFilters;
}

function toSerialized(s: SavedSearch): SerializedSavedSearch {
  return { ...s, filters: serializeFilters(s.filters) };
}

function fromSerialized(s: SerializedSavedSearch): SavedSearch {
  return { ...s, filters: deserializeFilters(s.filters) };
}

export function useSavedSearches() {
  const { data, isLoading } = useSWR<{ searches: SerializedSavedSearch[] }>(SWR_KEY, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });

  const savedSearches: SavedSearch[] = (data?.searches ?? []).map(fromSerialized);

  const saveSearch = useCallback(
    async (label: string, query: string, filters: SearchFilters) => {
      const current = data?.searches ?? [];
      if (current.length >= MAX_SAVED) {
        return;
      }
      const newEntry: SerializedSavedSearch = {
        id: crypto.randomUUID(),
        label,
        query,
        filters: serializeFilters(filters),
      };
      // Prepend so most-recently-saved appears first
      const next = [newEntry, ...current];
      await mutate(
        SWR_KEY,
        fetch(SWR_KEY, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ searches: next }),
        }).then((r) => (r.ok ? r.json() : data)),
        { revalidate: false },
      );
    },
    [data],
  );

  const deleteSearch = useCallback(
    async (id: string) => {
      const current = data?.searches ?? [];
      const next = current.filter((s) => s.id !== id);
      await mutate(
        SWR_KEY,
        fetch(SWR_KEY, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ searches: next }),
        }).then((r) => (r.ok ? r.json() : data)),
        { revalidate: false },
      );
    },
    [data],
  );

  return {
    savedSearches,
    saveSearch,
    deleteSearch,
    isLoading,
    isFull: savedSearches.length >= MAX_SAVED,
  };
}
