"use client";

import { useEffect, useRef } from "react";
import { mutate } from "swr";
import { subscribeEvents } from "@/lib/event-bus";

/**
 * Subscribes to refinement events on the shared event bus (one SSE connection
 * per browser, BRDG-342) and triggers SWR revalidation when server-side
 * refinement data changes.
 */
export function useRefinementStream(sessionId: string | null) {
  const sessionIdRef = useRef(sessionId);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    const unsubscribe = subscribeEvents((envelope) => {
      if (envelope.channel !== "refinement") return;
      const event = envelope.event;
      const currentSessionId = sessionIdRef.current;

      switch (event.type) {
        case "session:created":
        case "session:updated":
        case "session:deleted":
          mutate("/api/refinement-sessions");
          break;

        case "bulk-suggest:progress":
          if (currentSessionId && event.sessionId === currentSessionId) {
            // Revalidate suggestion counts and conversation messages
            mutate(`/api/refinement-sessions/${currentSessionId}/suggestion-counts`);
            const convId = `bulk-suggest-${currentSessionId}`;
            mutate(`/api/conversations/${convId}`);
          }
          break;

        case "bulk-suggest:complete":
          if (currentSessionId && event.sessionId === currentSessionId) {
            mutate(`/api/refinement-sessions/${currentSessionId}/suggestion-counts`);
            mutate(`/api/refinement-sessions/${currentSessionId}/bulk-suggest-subtasks`);
            const convId = `bulk-suggest-${currentSessionId}`;
            mutate(`/api/conversations/${convId}`);
          }
          break;

        case "tickets:updated":
          mutate("/api/tickets");
          break;
      }
    });

    return unsubscribe;
  }, []);
}
