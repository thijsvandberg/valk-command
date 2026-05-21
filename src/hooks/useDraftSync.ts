"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { storyWriter as storyWriterApi } from "@/lib/api-client";

export type DraftSyncStatus = "idle" | "pending" | "synced" | "error";

interface DraftSyncResult {
  syncStatus: DraftSyncStatus;
  realKey: string | null;
  error: string | null;
  retry: () => void;
}

/**
 * Polls draft-status for DRAFT-xxx keys and updates the URL silently
 * when the real Jira key arrives. Uses history.replaceState instead of
 * router.replace so the component stays mounted and user state is preserved.
 */
export function useDraftSync(ticketKey: string): DraftSyncResult {
  const isDraft = ticketKey.startsWith("DRAFT-");
  const [syncStatus, setSyncStatus] = useState<DraftSyncStatus>(isDraft ? "pending" : "idle");
  const [realKey, setRealKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isDraft) return;
    if (syncStatus !== "pending") return;

    let cancelled = false;

    const poll = async () => {
      while (!cancelled) {
        try {
          const data = await storyWriterApi.draftStatus(ticketKey) as {
            status: string;
            realKey?: string;
            error?: string;
          };

          if (cancelled) return;

          if (data.status === "synced" && data.realKey) {
            setSyncStatus("synced");
            setRealKey(data.realKey);
            // Update URL silently without triggering navigation/remount
            window.history.replaceState(null, "", `/tickets/${data.realKey}/write`);
            return;
          }

          if (data.status === "error") {
            setSyncStatus("error");
            setError(data.error ?? "Jira creation failed");
            return;
          }

          // Still pending, wait before next poll
          await new Promise((r) => setTimeout(r, 1500));
        } catch {
          if (cancelled) return;
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [isDraft, syncStatus, ticketKey]);

  const retry = useCallback(() => {
    if (!isDraft) return;
    setSyncStatus("pending");
    setError(null);
    storyWriterApi.retryDraft({ draftKey: ticketKey }).catch(() => {});
  }, [isDraft, ticketKey]);

  return { syncStatus, realKey, error, retry };
}
