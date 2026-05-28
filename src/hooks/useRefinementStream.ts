"use client";

import { useEffect, useRef } from "react";
import { mutate } from "swr";
import type { RefinementEvent } from "@/lib/refinement-events";

const RECONNECT_DELAY_MS = 3_000;

/**
 * Connects to the refinement SSE stream and triggers SWR revalidation
 * when server-side refinement data changes.
 */
export function useRefinementStream(sessionId: string | null) {
  const sessionIdRef = useRef(sessionId);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    function connect() {
      if (closed || typeof EventSource === "undefined") return;
      es = new EventSource("/api/refinement-sessions/stream");

      const handleEvent = (e: MessageEvent) => {
        let event: RefinementEvent;
        try {
          event = JSON.parse(e.data) as RefinementEvent;
        } catch {
          return;
        }

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
      };

      // Listen on all event types
      const eventTypes = [
        "session:created",
        "session:updated",
        "session:deleted",
        "bulk-suggest:progress",
        "bulk-suggest:complete",
        "tickets:updated",
      ];
      for (const type of eventTypes) {
        es.addEventListener(type, handleEvent);
      }

      es.onerror = () => {
        es?.close();
        es = null;
        if (!closed) {
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };
    }

    connect();

    return () => {
      closed = true;
      es?.close();
      es = null;
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);
}
