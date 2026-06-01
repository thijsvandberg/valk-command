import { useState, useCallback } from "react";
import useSWR, { mutate } from "swr";
import { refinementSessions as refinementSessionsApi, swrFetcher } from "@/lib/api-client";
import { getJiraUrl } from "@/lib/jira-url";
import type { Ticket } from "@/types/ticket";

interface BulkSuggestStatus {
  conversationId: string | null;
  hasRun: boolean;
  isRunning: boolean;
}

export function useBulkSuggest(opts: {
  resolvedSessionId: string | null;
  queueTickets: Ticket[];
}) {
  const { resolvedSessionId, queueTickets } = opts;

  const [bulkSuggestPanelCollapsed, setBulkSuggestPanelCollapsed] = useState(true);
  const [bulkSuggestMenuOpen, setBulkSuggestMenuOpen] = useState(false);
  const [bulkSuggestVisible, setBulkSuggestVisible] = useState(false);

  // SSE revalidates this key on bulk-suggest:progress and bulk-suggest:complete
  const statusUrl = resolvedSessionId
    ? `/api/refinement-sessions/${resolvedSessionId}/bulk-suggest-subtasks`
    : null;
  const { data: statusData } = useSWR<BulkSuggestStatus>(statusUrl, swrFetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 2000,
  });

  const bulkSuggestConvId = statusData?.conversationId ?? null;
  const bulkSuggestRunning = statusData?.isRunning ?? false;

  // SSE revalidates this key on bulk-suggest:progress
  const { data: suggestionCountsData } = useSWR<{ counts: Record<string, number> }>(
    refinementSessionsApi.suggestionCountsUrl(resolvedSessionId),
    swrFetcher,
  );
  const suggestionCounts = suggestionCountsData?.counts ?? {};

  const [copyToast, setCopyToast] = useState(false);
  const handleCopyStories = useCallback(() => {
    const text = queueTickets.map((t) => `${t.title} - ${getJiraUrl(t.key)}`).join("\n");
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
    setBulkSuggestPanelCollapsed(false);
    setBulkSuggestVisible(true);
    try {
      const result = await refinementSessionsApi.bulkSuggestSubtasks(resolvedSessionId, force ? { force: true } : undefined);
      // Optimistically mark as running so UI reacts immediately
      mutate(statusUrl, { conversationId: result.conversationId, hasRun: true, isRunning: true }, false);
    } catch {
      // SSE will update the status
    }
  }, [resolvedSessionId, bulkSuggestRunning, statusUrl]);

  return {
    bulkSuggestConvId,
    bulkSuggestRunning,
    bulkSuggestVisible,
    setBulkSuggestVisible,
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
