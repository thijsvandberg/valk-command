import { useCallback } from "react";
import useSWR, { mutate } from "swr";
import { epics, swrFetcher } from "@/lib/api-client";
import type { EpicProgressItem } from "@/app/api/epics/progress/route";
import type { EpicChildTicket } from "@/app/api/epics/[key]/tickets/route";
import type { Team } from "@/lib/sprint-utils";

// Fetches aggregated epic progress for the Epic Progress View (BRDG-044).
export function useEpicProgress() {
  return useSWR<EpicProgressItem[]>(
    "/api/epics/progress",
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );
}

// Returns a mutator that replaces an epic's team assignment, then revalidates
// the progress list so the row chips and any active filter reflect the change.
export function useSetEpicTeams() {
  return useCallback(async (epicKey: string, teams: Team[]) => {
    await epics.setTeams(epicKey, teams);
    await mutate("/api/epics/progress");
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
