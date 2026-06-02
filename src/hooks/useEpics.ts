import useSWR from "swr";
import { swrFetcher } from "@/lib/api-client";
import type { EpicProgressItem } from "@/app/api/epics/progress/route";
import type { EpicChildTicket } from "@/app/api/epics/[key]/tickets/route";

// Fetches aggregated epic progress for the Epic Progress View (BRDG-044).
export function useEpicProgress() {
  return useSWR<EpicProgressItem[]>(
    "/api/epics/progress",
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );
}

// Lazily fetches an epic's child tickets — only when `enabled` (i.e. the row is expanded).
export function useEpicTickets(epicKey: string, enabled: boolean) {
  return useSWR<EpicChildTicket[]>(
    enabled ? `/api/epics/${encodeURIComponent(epicKey)}/tickets` : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );
}
