"use client";

import useSWR from "swr";
import type { Ticket } from "@/types/ticket";

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));

export interface VelocityPoint {
  sprintId: number;
  sprintName: string;
  completedPoints: number;
}

/**
 * Fetches ticket data for each sprint in `sprints` in parallel and computes
 * completed story points (DONE tickets) per sprint.
 * Skips sprints that returned no ticket data at all.
 */
export function useVelocityData(
  sprints: { id: number; name: string }[],
): { data: VelocityPoint[] | null; isLoading: boolean } {
  // Build comma-delimited key so SWR re-runs when the sprint list changes
  const sprintIds = sprints.map((s) => s.id).join(",");

  const { data, isLoading } = useSWR<Record<string, Ticket[]>>(
    sprints.length > 0 ? `velocity:${sprintIds}` : null,
    async () => {
      const results = await Promise.all(
        sprints.map((s) =>
          fetch(`/api/tickets?sprintId=${encodeURIComponent(String(s.id))}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((tickets: Ticket[] | null) => ({ id: s.id, tickets })),
        ),
      );
      const map: Record<string, Ticket[]> = {};
      for (const { id, tickets } of results) {
        if (tickets) map[id] = tickets;
      }
      return map;
    },
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );

  if (!data) return { data: null, isLoading };

  const points: VelocityPoint[] = [];
  for (const sprint of sprints) {
    const tickets = data[sprint.id];
    // Skip sprints with no ticket data at all
    if (!tickets || tickets.length === 0) continue;
    const completedPoints = tickets
      .filter((t) => t.jiraStatus === "DONE")
      .reduce((s, t) => s + (t.storyPoints ?? 0), 0);
    points.push({ sprintId: sprint.id, sprintName: sprint.name, completedPoints });
  }

  return { data: points, isLoading };
}
