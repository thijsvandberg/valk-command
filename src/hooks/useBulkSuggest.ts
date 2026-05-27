import { useState, useCallback, useEffect } from "react";
import useSWR from "swr";
import { refinementSessions as refinementSessionsApi, swrFetcher } from "@/lib/api-client";
import { getJiraUrl } from "@/lib/jira-url";
import type { Ticket } from "@/types/ticket";

export function useBulkSuggest(opts: {
  resolvedSessionId: string | null;
  queueTickets: Ticket[];
}) {
  const { resolvedSessionId, queueTickets } = opts;

  const [bulkSuggestConvId, setBulkSuggestConvId] = useState<string | null>(null);
  const [bulkSuggestRunning, setBulkSuggestRunning] = useState(false);
  const [bulkSuggestPanelCollapsed, setBulkSuggestPanelCollapsed] = useState(true);
  const [bulkSuggestMenuOpen, setBulkSuggestMenuOpen] = useState(false);
  const [bulkSuggestVisible, setBulkSuggestVisible] = useState(false);

  // On mount / session change: check if a bulk suggest conversation exists
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!resolvedSessionId) {
      setBulkSuggestConvId(null);
      setBulkSuggestRunning(false);
      return;
    }
    let cancelled = false;
    refinementSessionsApi.bulkSuggestStatus(resolvedSessionId).then((status) => {
      if (cancelled) return;
      setBulkSuggestConvId(status.conversationId);
      setBulkSuggestRunning(status.isRunning);
    }).catch(() => {
      // ignore
    });
    return () => { cancelled = true; };
  }, [resolvedSessionId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Fetch suggestion counts for queue badges
  const { data: suggestionCountsData, mutate: mutateSuggestionCounts } = useSWR<{ counts: Record<string, number> }>(
    refinementSessionsApi.suggestionCountsUrl(resolvedSessionId),
    swrFetcher,
    { refreshInterval: bulkSuggestRunning ? 5000 : 0 },
  );
  const suggestionCounts = suggestionCountsData?.counts ?? {};

  const [copyToast, setCopyToast] = useState(false);
  const handleCopyStories = useCallback(() => {
    const text = queueTickets.map((t) => `- ${t.title} - ${getJiraUrl(t.key)}`).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 1500);
    }).catch(() => {
      // ignore
    });
    setBulkSuggestMenuOpen(false);
  }, [queueTickets]);

  const handleBulkSuggest = useCallback(async (force?: boolean) => {
    if (!resolvedSessionId || bulkSuggestRunning) return;
    setBulkSuggestMenuOpen(false);
    setBulkSuggestRunning(true);
    setBulkSuggestPanelCollapsed(false);
    setBulkSuggestVisible(true);
    try {
      const result = await refinementSessionsApi.bulkSuggestSubtasks(resolvedSessionId, force ? { force: true } : undefined);
      setBulkSuggestConvId(result.conversationId);
    } catch {
      setBulkSuggestRunning(false);
    }
  }, [resolvedSessionId, bulkSuggestRunning]);

  // Detect when bulk suggest completes by polling the status
  useEffect(() => {
    if (!bulkSuggestRunning || !resolvedSessionId) return;
    const interval = setInterval(async () => {
      try {
        const status = await refinementSessionsApi.bulkSuggestStatus(resolvedSessionId);
        if (!status.isRunning) {
          setBulkSuggestRunning(false);
          mutateSuggestionCounts();
        }
      } catch {
        // ignore
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [bulkSuggestRunning, resolvedSessionId, mutateSuggestionCounts]);

  return {
    bulkSuggestConvId,
    bulkSuggestRunning,
    bulkSuggestVisible,
    bulkSuggestPanelCollapsed,
    setBulkSuggestPanelCollapsed,
    bulkSuggestMenuOpen,
    setBulkSuggestMenuOpen,
    suggestionCounts,
    copyToast,
    handleCopyStories,
    handleBulkSuggest,
  };
}
