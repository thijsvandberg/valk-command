import { useMemo } from "react";
import { useRefinementSessions } from "@/hooks/useRefinementSessions";
import { sessionLabel } from "@/components/refinement-session/refinement-utils";

export interface TicketSessionEntry {
  id: string;
  name: string;
  /** Full member list of the session, so the gem hover card can list siblings without a refetch. */
  ticketKeys: string[];
  ticketCount: number;
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
        // ticketKeys is shared by reference across every member's entry (read-only).
        const entry: TicketSessionEntry = {
          id: session.id,
          name: sessionLabel(session),
          ticketKeys: session.ticketKeys,
          ticketCount: session.ticketCount,
        };
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
