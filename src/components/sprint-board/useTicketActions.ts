"use client";

import { useState, useCallback } from "react";
import type { POStatus, TicketReadiness, Ticket, IssueType, JiraStatus } from "@/types/ticket";
import { saveTicketMetadata, saveStoryPoints } from "@/components/sprint-board/sprint-board-utils";
import { apiFetch } from "@/lib/api-client";

interface TicketActionsDeps {
  apiTickets: Ticket[] | undefined;
  mutateTickets: (data?: Ticket[] | Promise<Ticket[]> | ((current?: Ticket[]) => Ticket[] | undefined), opts?: { revalidate?: boolean }) => void;
  activeListKey: string | null;
  showToast: (message: React.ReactNode, durationMs?: number) => void;
}

export function useTicketActions(deps: TicketActionsDeps) {
  const { apiTickets, mutateTickets, activeListKey, showToast } = deps;

  const [poStatuses, setPoStatuses] = useState<Record<string, POStatus>>({});
  const [readinessMap, setReadinessMap] = useState<Record<string, TicketReadiness | null>>({});
  const [inflightKeys, setInflightKeys] = useState<Set<string>>(new Set());

  const handlePoStatusChange = useCallback((key: string, status: POStatus) => {
    const prevStatus = poStatuses[key];
    setPoStatuses((prev) => ({ ...prev, [key]: status }));
    setInflightKeys((prev) => new Set(prev).add(key));
    saveTicketMetadata(key, { poStatus: status }, activeListKey).then((ok) => {
      setInflightKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
      if (!ok) {
        setPoStatuses((prev) => ({ ...prev, [key]: prevStatus }));
        showToast(`Failed to update ${key}. Change reverted.`);
      }
    });
  }, [poStatuses, activeListKey, showToast]);

  const handleReadinessChange = useCallback((key: string, readiness: TicketReadiness | null) => {
    const prev = readinessMap[key];
    setReadinessMap((m) => ({ ...m, [key]: readiness }));
    setInflightKeys((s) => new Set(s).add(key));
    saveTicketMetadata(key, { readiness }, activeListKey).then((ok) => {
      setInflightKeys((s) => { const next = new Set(s); next.delete(key); return next; });
      if (!ok) {
        setReadinessMap((m) => ({ ...m, [key]: prev }));
        showToast(`Failed to update ${key}. Change reverted.`);
      }
    });
  }, [readinessMap, activeListKey, showToast]);

  const handleBusinessValueChange = useCallback((key: string, value: number | null) => {
    saveTicketMetadata(key, { businessValue: value }, activeListKey);
  }, [activeListKey]);

  const handleStoryPointsChange = useCallback((key: string, value: number | null) => {
    saveStoryPoints(key, value, activeListKey);
  }, [activeListKey]);

  const handleJiraStatusChange = useCallback(async (key: string, status: JiraStatus) => {
    const prev = apiTickets?.find((t) => t.key === key)?.jiraStatus;
    mutateTickets((data) => data?.map((t) => t.key === key ? { ...t, jiraStatus: status } : t), { revalidate: false });
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(key)}/status`, { method: "PUT", body: { status } });
    } catch {
      if (prev !== undefined) {
        mutateTickets((data) => data?.map((t) => t.key === key ? { ...t, jiraStatus: prev } : t), { revalidate: false });
      }
    }
  }, [apiTickets, mutateTickets]);

  const handleIssueTypeChange = useCallback(async (key: string, type: IssueType) => {
    const prev = apiTickets?.find((t) => t.key === key)?.type;
    mutateTickets((data) => data?.map((t) => t.key === key ? { ...t, type } : t), { revalidate: false });
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(key)}`, { method: "PATCH", body: { type } });
    } catch {
      if (prev !== undefined) {
        mutateTickets((data) => data?.map((t) => t.key === key ? { ...t, type: prev } : t), { revalidate: false });
      }
    }
  }, [apiTickets, mutateTickets]);

  const handleTitleChange = useCallback(async (key: string, title: string) => {
    const prev = apiTickets?.find((t) => t.key === key)?.title;
    mutateTickets((data) => data?.map((t) => t.key === key ? { ...t, title } : t), { revalidate: false });
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(key)}/summary`, { method: "PUT", body: { title } });
    } catch {
      if (prev !== undefined) {
        mutateTickets((data) => data?.map((t) => t.key === key ? { ...t, title: prev } : t), { revalidate: false });
      }
    }
  }, [apiTickets, mutateTickets]);

  const handleCloseSubtasks = useCallback(async (key: string) => {
    const prev = apiTickets?.find((t) => t.key === key);
    if (prev) {
      mutateTickets((data) => data?.map((t) => t.key === key ? { ...t, openSubtaskCount: 0 } : t), { revalidate: false });
    }
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(key)}/subtasks/close`, { method: "POST" });
    } catch {
      if (prev) {
        mutateTickets((data) => data?.map((t) => t.key === key ? { ...t, openSubtaskCount: prev.openSubtaskCount } : t), { revalidate: false });
      }
    }
  }, [apiTickets, mutateTickets]);

  // Sync initial PO data from API tickets
  const syncFromApiTickets = useCallback((tickets: Ticket[]) => {
    setPoStatuses((prev) => {
      let changed = false;
      const next = { ...prev };
      tickets.forEach((t) => { if (!(t.key in next)) { next[t.key] = t.poStatus; changed = true; } });
      return changed ? next : prev;
    });
    setReadinessMap((prev) => {
      let changed = false;
      const next = { ...prev };
      tickets.forEach((t) => { if (!(t.key in next)) { next[t.key] = t.readiness; changed = true; } });
      return changed ? next : prev;
    });
  }, []);

  const handleBulkSetReadiness = useCallback(async (readiness: TicketReadiness | null, checkedTickets: Set<string>) => {
    const keys = [...checkedTickets];
    const prevReadiness = Object.fromEntries(keys.map((k) => [k, readinessMap[k]]));
    setReadinessMap((prev) => { const next = { ...prev }; keys.forEach((k) => { next[k] = readiness; }); return next; });
    setInflightKeys((prev) => { const next = new Set(prev); keys.forEach((k) => next.add(k)); return next; });
    const results = await Promise.all(keys.map((k) => saveTicketMetadata(k, { readiness }, activeListKey)));
    setInflightKeys((prev) => { const next = new Set(prev); keys.forEach((k) => next.delete(k)); return next; });
    const failedCount = results.filter((ok) => !ok).length;
    if (failedCount > 0) {
      setReadinessMap((prev) => ({ ...prev, ...prevReadiness }));
      showToast(`Failed to update ${failedCount} ticket${failedCount === 1 ? "" : "s"}. Changes reverted.`);
    } else {
      showToast(`Readiness set for ${keys.length} ticket${keys.length === 1 ? "" : "s"}`);
    }
  }, [readinessMap, showToast, activeListKey]);

  return {
    poStatuses,
    readinessMap,
    inflightKeys,
    handlePoStatusChange,
    handleReadinessChange,
    handleBusinessValueChange,
    handleStoryPointsChange,
    handleJiraStatusChange,
    handleIssueTypeChange,
    handleTitleChange,
    handleCloseSubtasks,
    syncFromApiTickets,
    handleBulkSetReadiness,
  };
}
