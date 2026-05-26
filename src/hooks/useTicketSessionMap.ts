import { useMemo } from "react";
import { useRefinementSessions } from "@/hooks/useRefinementSessions";

export interface TicketSessionEntry {
  id: string;
  name: string;
}

/**
 * Builds a reverse lookup: ticket key -> draft refinement sessions it belongs to.
 * Shared across sprint board, ticket detail, and refinement page.
 */
export function useTicketSessionMap() {
  const { sessions, mutate, isLoading } = useRefinementSessions();

  const ticketSessionMap = useMemo(() => {
    const map = new Map<string, TicketSessionEntry[]>();
    for (const session of sessions) {
      if (session.status === "completed") continue;
      for (const key of session.ticketKeys) {
        const existing = map.get(key);
        const entry = { id: session.id, name: session.name };
        if (existing) {
          existing.push(entry);
        } else {
          map.set(key, [entry]);
        }
      }
    }
    return map;
  }, [sessions]);

  return { ticketSessionMap, sessions, mutate, isLoading };
}
