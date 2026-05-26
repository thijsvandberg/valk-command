"use client";

import { use, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useRefinementSession } from "@/contexts/RefinementSessionContext";
import { refinementSessions as refinementSessionsApi } from "@/lib/api-client";

/**
 * Redirect-only page: resolves the active ticket from context or DB,
 * then redirects to /refinement/[sessionId]/session/[ticketKey].
 */
export default function RefinementSessionRedirect({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const router = useRouter();
  const { queue, currentIndex } = useRefinementSession();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (redirectedRef.current) return;

    // Context has session state: redirect to current ticket
    if (queue.length > 0) {
      redirectedRef.current = true;
      const currentKey = queue[currentIndex] ?? queue[0];
      router.replace(`/refinement/${sessionId}/session/${encodeURIComponent(currentKey)}`);
      return;
    }

    // No context: fetch session from DB and resume at persisted index
    redirectedRef.current = true;
    refinementSessionsApi.get(sessionId).then((session) => {
      if (session && session.ticketKeys.length > 0) {
        const resumeIdx = Math.min(session.currentIndex, session.ticketKeys.length - 1);
        const resumeKey = session.ticketKeys[resumeIdx] ?? session.ticketKeys[0];
        router.replace(`/refinement/${sessionId}/session/${encodeURIComponent(resumeKey)}`);
      } else {
        router.replace(`/refinement/${sessionId}`);
      }
    }).catch(() => {
      router.replace(`/refinement/${sessionId}`);
    });
  }, [queue, currentIndex, sessionId, router]);

  return null;
}
