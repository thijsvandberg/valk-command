import useSWR from "swr";
import { swrFetcher, refinementSessions, type RefinementSessionResponse } from "@/lib/api-client";

const SWR_KEY = refinementSessions.listUrl();

export function useRefinementSessions() {
  const { data, mutate, isLoading } = useSWR<RefinementSessionResponse[]>(
    SWR_KEY,
    swrFetcher,
    { revalidateOnFocus: true, dedupingInterval: 5000 },
  );

  return { sessions: data ?? [], mutate, isLoading };
}
