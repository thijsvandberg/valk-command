import { useCallback } from "react";
import useSWR, { mutate } from "swr";
import { epics, swrFetcher } from "@/lib/api-client";
import type { EpicProgressItem } from "@/app/api/epics/progress/route";
import type { EpicChildTicket } from "@/app/api/epics/[key]/tickets/route";
import type { Team } from "@/lib/sprint-utils";
import { setEpicColorOverride } from "@/lib/epic-color-registry";

// Fetches aggregated epic progress for the Epic Progress View (BRDG-044).
export function useEpicProgress() {
  return useSWR<EpicProgressItem[]>(
    "/api/epics/progress",
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );
}

// Returns a mutator that replaces an epic's team assignment and patches the
// cached progress list in place. We patch rather than revalidate because the
// PUT response is the value we just wrote (authoritative), and a refetch could
// momentarily return a stale cached aggregate.
export function useSetEpicTeams() {
  return useCallback(async (epicKey: string, teams: Team[]) => {
    await epics.setTeams(epicKey, teams);
    await mutate<EpicProgressItem[]>(
      "/api/epics/progress",
      (prev) => prev?.map((e) => (e.key === epicKey ? { ...e, teams } : e)),
      { revalidate: false },
    );
  }, []);
}

// Returns a mutator that sets (or clears, with null) an epic's color. Patches
// the registry immediately so every surface re-colors instantly, then patches
// the cached progress list in place (same authoritative-write reasoning as
// useSetEpicTeams). `name` feeds the registry's name index for name-only surfaces.
export function useSetEpicColor() {
  return useCallback(async (epicKey: string, name: string, color: string | null) => {
    setEpicColorOverride(epicKey, name, color);
    await epics.setColor(epicKey, color);
    await mutate<EpicProgressItem[]>(
      "/api/epics/progress",
      (prev) => prev?.map((e) => (e.key === epicKey ? { ...e, color } : e)),
      { revalidate: false },
    );
  }, []);
}

// Lazily fetches an epic's child tickets — only when `enabled` (i.e. the row is expanded).
export function useEpicTickets(epicKey: string, enabled: boolean) {
  return useSWR<EpicChildTicket[]>(
    enabled ? `/api/epics/${encodeURIComponent(epicKey)}/tickets` : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );
}
