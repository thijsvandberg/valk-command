"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));

export interface VelocityPoint {
  sprintId: number;
  sprintName: string;
  completedPoints: number;
}

/**
 * Fetches velocity data for a team from the local DB via /api/velocity.
 * Returns completed story points per sprint for the last `limit` sprints
 * that have ticket data. No Jira API calls involved.
 */
export function useVelocityData(
  teamPrefix: string | null,
  limit = 10,
): { data: VelocityPoint[] | null; isLoading: boolean } {
  const key = teamPrefix
    ? `/api/velocity?teamPrefix=${encodeURIComponent(teamPrefix)}&limit=${limit}`
    : null;

  const { data, isLoading } = useSWR<VelocityPoint[]>(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });

  return { data: data ?? null, isLoading };
}
