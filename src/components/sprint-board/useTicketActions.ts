"use client";

import { useState, useCallback } from "react";
import { mutate as globalMutate, type KeyedMutator } from "swr";
import type { POStatus, TicketReadiness, Ticket, IssueType, JiraStatus, Assignee } from "@/types/ticket";
import { saveTicketMetadata, saveStoryPoints } from "@/components/sprint-board/sprint-board-utils";
import { apiFetch, jira, tickets as ticketsApi } from "@/lib/api-client";
import { userInitials, userColor } from "@/lib/user-utils";
import type { AssignableUser } from "@/components/shared/AssigneePicker";
import type { EpicOption } from "@/components/shared/EpicPicker";

interface TicketActionsDeps {
  apiTickets: Ticket[] | undefined;
  mutateTickets: KeyedMutator<Ticket[]>;
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

  const handleGuestimationChange = useCallback((key: string, value: number | null) => {
    // The capacity meter reads a server-computed effective-points total (real SP
    // or guestimation), separate from the ticket list, so refresh it after the save.
    saveTicketMetadata(key, { guestimation: value }, activeListKey).then((ok) => {
      if (ok) globalMutate("/api/sprints/used-points");
    });
  }, [activeListKey]);

  const handleStoryPointsChange = useCallback((key: string, value: number | null) => {
    // Mirror the server rule (ticket-detail-builder): estimating a ticket that
    // sits at "Ready to Refine" advances it to "Ready for Development". The
    // board's readiness pill reads from this optimistic map, which the SP save
    // would not refresh on its own, so update it here too (and revert on fail).
    if (value != null && (readinessMap[key] ?? null) === "ready_to_refine") {
      const prev = readinessMap[key];
      setReadinessMap((m) => ({ ...m, [key]: null }));
      // Keep the SWR list in step so the reconciling syncFromApiTickets does not
      // revert the pill to the stale cached readiness.
      mutateTickets((data) => data?.map((t) => t.key === key ? { ...t, readiness: null } : t), { revalidate: false });
      saveStoryPoints(key, value, activeListKey).then((ok) => {
        if (!ok) {
          setReadinessMap((m) => ({ ...m, [key]: prev }));
          mutateTickets((data) => data?.map((t) => t.key === key ? { ...t, readiness: prev ?? null } : t), { revalidate: false });
          return;
        }
        globalMutate("/api/sprints/used-points");
      });
      return;
    }
    saveStoryPoints(key, value, activeListKey).then((ok) => {
      if (ok) globalMutate("/api/sprints/used-points");
    });
  }, [activeListKey, readinessMap, mutateTickets]);

  const handleJiraStatusChange = useCallback(async (key: string, status: JiraStatus) => {
    const withStatus = (data?: Ticket[]) => data?.map((t) => t.key === key ? { ...t, jiraStatus: status } : t);
    try {
      // Same SWR optimistic mutation as handleAssigneeChange: a bare
      // mutate(revalidate:false) only patches the cache once, so the focus
      // revalidation that fires when the status picker portal closes races the
      // PUT, reads Jira before it has propagated the transition, and flips the
      // row back to its old status. Tying optimisticData to the request makes
      // SWR discard that racing revalidation; populateCache locks the new value
      // in on success (BRDG-339).
      await mutateTickets(
        apiFetch(`/api/tickets/${encodeURIComponent(key)}/status`, { method: "PUT", body: { status } }).then(() => undefined as unknown as Ticket[]),
        {
          optimisticData: (current) => withStatus(current) ?? [],
          populateCache: (_result, current) => withStatus(current) ?? [],
          revalidate: false,
          rollbackOnError: true,
        },
      );
    } catch {
      showToast(`Failed to update status for ${key}. Change reverted.`);
    }
  }, [mutateTickets, showToast]);

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

  const handleAssigneeChange = useCallback(async (key: string, user: AssignableUser | null) => {
    const optimistic: Assignee | null = user
      ? { name: user.displayName, initials: userInitials(user.displayName), color: userColor(user.displayName) }
      : null;
    const withAssignee = (data?: Ticket[]) => data?.map((t) => t.key === key ? { ...t, assignee: optimistic } : t);
    try {
      // SWR optimistic mutation: optimisticData shows the new assignee for the
      // whole request and makes SWR discard any revalidation that races it (the
      // board revalidates on focus, which fires when the picker portal closes
      // and would otherwise flash the stale value). populateCache locks the new
      // value in on success; revalidate:false avoids a refetch flip.
      await mutateTickets(
        jira.assign({ issueKey: key, accountId: user?.accountId ?? null, name: user?.displayName ?? null, avatar: user?.avatarUrl ?? null }).then(() => undefined as unknown as Ticket[]),
        {
          optimisticData: (current) => withAssignee(current) ?? [],
          populateCache: (_result, current) => withAssignee(current) ?? [],
          revalidate: false,
          rollbackOnError: true,
        },
      );
    } catch {
      showToast(`Failed to update assignee for ${key}. Change reverted.`);
    }
  }, [mutateTickets, showToast]);

  const handleEpicChange = useCallback(async (key: string, epic: EpicOption | null) => {
    const prevTicket = apiTickets?.find((t) => t.key === key);
    const prevEpic = prevTicket?.epic ?? null;
    const prevEpicKey = prevTicket?.epicKey ?? null;
    mutateTickets((data) => data?.map((t) => t.key === key ? { ...t, epic: epic?.name ?? null, epicKey: epic?.key ?? null } : t), { revalidate: false });
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(key)}`, { method: "PATCH", body: { epicKey: epic?.key ?? null } });
      mutateTickets();
    } catch {
      mutateTickets((data) => data?.map((t) => t.key === key ? { ...t, epic: prevEpic, epicKey: prevEpicKey } : t), { revalidate: false });
      showToast(`Failed to update epic for ${key}. Change reverted.`);
    }
  }, [apiTickets, mutateTickets, showToast]);

  // Sprint move requires a Jira round-trip; revalidate rather than optimistically
  // rewrite (the board's sprintId field carries the sprint name, not its id).
  const handleSprintChange = useCallback(async (key: string, sprintId: string | null) => {
    try {
      await jira.moveSprint({ issueKeys: [key], targetSprintId: sprintId ?? "__backlog__" });
      mutateTickets();
    } catch {
      showToast(`Failed to move ${key} to sprint.`);
    }
  }, [mutateTickets, showToast]);

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

  // Reconcile the optimistic PO maps with fresh API data. Values follow the SWR list
  // (so edits made on other surfaces, e.g. the ticket detail page, show up when the
  // board re-renders) except for keys with an in-flight save, whose optimistic value
  // must not be clobbered by a racing revalidation.
  const syncFromApiTickets = useCallback((tickets: Ticket[]) => {
    setPoStatuses((prev) => {
      let changed = false;
      const next = { ...prev };
      tickets.forEach((t) => {
        if (inflightKeys.has(t.key)) return;
        if (next[t.key] !== t.poStatus) { next[t.key] = t.poStatus; changed = true; }
      });
      return changed ? next : prev;
    });
    setReadinessMap((prev) => {
      let changed = false;
      const next = { ...prev };
      tickets.forEach((t) => {
        if (inflightKeys.has(t.key)) return;
        if (next[t.key] !== t.readiness) { next[t.key] = t.readiness; changed = true; }
      });
      return changed ? next : prev;
    });
  }, [inflightKeys]);

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

  const handleBulkSetStatus = useCallback(async (status: JiraStatus, checkedTickets: Set<string>) => {
    const keys = [...checkedTickets];
    const prevStatuses = Object.fromEntries(keys.map((k) => [k, apiTickets?.find((t) => t.key === k)?.jiraStatus]));
    const withStatus = (data?: Ticket[]) => data?.map((t) => checkedTickets.has(t.key) ? { ...t, jiraStatus: status } : t);
    let failedCount = 0;
    try {
      // Optimistic mutation tied to the batch (see handleJiraStatusChange): keeps
      // the focus revalidation from racing the PUTs and reverting the rows to a
      // pre-transition Jira read. populateCache reflects only the rows that
      // actually succeeded.
      await mutateTickets(
        Promise.allSettled(keys.map((k) => apiFetch(`/api/tickets/${encodeURIComponent(k)}/status`, { method: "PUT", body: { status } })))
          .then((results) => {
            const failedKeys = new Set(keys.filter((_, i) => results[i].status === "rejected"));
            failedCount = failedKeys.size;
            return failedKeys;
          }) as unknown as Promise<Ticket[]>,
        {
          optimisticData: (current) => withStatus(current) ?? [],
          populateCache: (failedKeys, current) => current?.map((t) => {
            const failed = (failedKeys as unknown as Set<string>).has(t.key);
            return checkedTickets.has(t.key) ? { ...t, jiraStatus: failed ? (prevStatuses[t.key] ?? t.jiraStatus) : status } : t;
          }) ?? [],
          revalidate: false,
          rollbackOnError: true,
        },
      );
    } catch {
      failedCount = keys.length;
    }
    if (failedCount > 0) {
      showToast(`Failed to update status for ${failedCount} ticket${failedCount === 1 ? "" : "s"}`);
    } else {
      showToast(`Status set to ${status} for ${keys.length} ticket${keys.length === 1 ? "" : "s"}`);
    }
  }, [apiTickets, mutateTickets, showToast]);

  const handleBulkSetEpic = useCallback(async (epicKey: string | null, checkedTickets: Set<string>) => {
    const keys = [...checkedTickets];
    const results = await Promise.allSettled(keys.map((k) => apiFetch(`/api/tickets/${encodeURIComponent(k)}`, { method: "PATCH", body: { epicKey } })));
    const failedCount = results.filter((r) => r.status === "rejected").length;
    mutateTickets();
    if (failedCount > 0) {
      showToast(`Failed to update epic for ${failedCount} ticket${failedCount === 1 ? "" : "s"}`);
    } else {
      showToast(`Epic updated for ${keys.length} ticket${keys.length === 1 ? "" : "s"}`);
    }
  }, [mutateTickets, showToast]);

  // Returns the outcome so the caller can render richer feedback (sprint name + link),
  // which needs sprint metadata/navigation only available at the board level.
  //
  // Caches are patched client-side instead of relying on the server-side
  // cache.invalidate in the move route: in next dev the move route and the
  // tickets route hold separate cache instances, so a bare mutateTickets()
  // revalidation returns stale data and the moved tickets stay in their old
  // sprint (BRDG-271). All cache writes happen after the move resolves, so the
  // failure path leaves no stale optimistic state.
  const handleBulkMoveSprint = useCallback(async (targetSprintId: string, checkedTickets: Set<string>): Promise<{ ok: boolean; count: number }> => {
    const keys = [...checkedTickets];
    const isBacklog = targetSprintId === "__backlog__";
    // Mirror the route's `t.sprintName || undefined`: backlog clears the sprint.
    const newSprintId = isBacklog ? undefined : targetSprintId;
    const destKey = `/api/tickets?sprintId=${encodeURIComponent(targetSprintId)}`;
    const movedTickets = (apiTickets ?? [])
      .filter((t) => checkedTickets.has(t.key))
      .map((t) => ({ ...t, sprintId: newSprintId }));
    try {
      await jira.moveSprint({ issueKeys: keys, targetSprintId });

      // Update the current list. In the All view the moved rows stay but get
      // the new sprintId (so grouping/labels follow them); in a per-sprint or
      // backlog source view they leave the list. Skip removal when the active
      // list IS the destination (a no-op move within the same view).
      if (activeListKey === "/api/tickets") {
        mutateTickets(
          (data) => data?.map((t) => checkedTickets.has(t.key) ? { ...t, sprintId: newSprintId } : t),
          { revalidate: false },
        );
      } else if (activeListKey !== destKey) {
        mutateTickets(
          (data) => data?.filter((t) => !checkedTickets.has(t.key)),
          { revalidate: false },
        );
      }

      // Inject the moved tickets into the destination cache (de-duplicated) so
      // they are already there when the user opens that sprint/backlog view.
      if (destKey !== activeListKey) {
        globalMutate<Ticket[]>(
          destKey,
          (current) => {
            const base = current ?? [];
            const existing = new Set(base.map((t) => t.key));
            return [...base, ...movedTickets.filter((t) => !existing.has(t.key))];
          },
          { revalidate: false },
        );
      }

      return { ok: true, count: keys.length };
    } catch {
      return { ok: false, count: keys.length };
    }
  }, [apiTickets, mutateTickets, activeListKey]);

  const handleBulkUpdateAssignee = useCallback(async (accountId: string | null, name: string | null, checkedTickets: Set<string>) => {
    const keys = [...checkedTickets];
    const results = await Promise.allSettled(keys.map((k) => jira.assign({ issueKey: k, accountId, name })));
    const failedCount = results.filter((r) => r.status === "rejected").length;
    mutateTickets();
    if (failedCount > 0) {
      showToast(`Failed to update assignee for ${failedCount} ticket${failedCount === 1 ? "" : "s"}`);
    } else {
      showToast(`Assignee updated for ${keys.length} ticket${keys.length === 1 ? "" : "s"}`);
    }
  }, [mutateTickets, showToast]);

  const handleBulkUpdateLabels = useCallback(async (labels: string[], mode: "add" | "set", checkedTickets: Set<string>) => {
    const keys = [...checkedTickets];
    const results = await Promise.allSettled(keys.map(async (k) => {
      let finalLabels = labels;
      if (mode === "add") {
        const detail = await apiFetch<{ labels?: string[] }>(`/api/tickets/${encodeURIComponent(k)}`);
        const existing = detail?.labels ?? [];
        finalLabels = [...new Set([...existing, ...labels])];
      }
      return apiFetch(`/api/tickets/${encodeURIComponent(k)}`, { method: "PATCH", body: { labels: finalLabels } });
    }));
    const failedCount = results.filter((r) => r.status === "rejected").length;
    mutateTickets();
    if (failedCount > 0) {
      showToast(`Failed to update labels for ${failedCount} ticket${failedCount === 1 ? "" : "s"}`);
    } else {
      const verb = mode === "add" ? "Added" : "Set";
      showToast(`${verb} labels for ${keys.length} ticket${keys.length === 1 ? "" : "s"}`);
    }
  }, [mutateTickets, showToast]);

  // A reason, when given, is posted as a Jira comment per ticket by the PATCH route.
  const handleBulkSetFlagged = useCallback(async (flagged: boolean, reason: string | null, checkedTickets: Set<string>) => {
    const keys = [...checkedTickets];
    const prevFlagged = Object.fromEntries(keys.map((k) => [k, apiTickets?.find((t) => t.key === k)?.flagged]));
    mutateTickets((data) => data?.map((t) => checkedTickets.has(t.key) ? { ...t, flagged } : t), { revalidate: false });
    const results = await Promise.allSettled(keys.map((k) => ticketsApi.toggleFlag(k, flagged, reason ?? undefined)));
    const failedCount = results.filter((r) => r.status === "rejected").length;
    if (failedCount > 0) {
      mutateTickets((data) => data?.map((t) => {
        const prev = prevFlagged[t.key];
        return prev !== undefined && checkedTickets.has(t.key) ? { ...t, flagged: prev } : t;
      }), { revalidate: false });
      showToast(`Failed to ${flagged ? "flag" : "unflag"} ${failedCount} ticket${failedCount === 1 ? "" : "s"}`);
    } else {
      showToast(`${flagged ? "Flagged" : "Unflagged"} ${keys.length} ticket${keys.length === 1 ? "" : "s"}`);
    }
  }, [apiTickets, mutateTickets, showToast]);

  return {
    poStatuses,
    readinessMap,
    inflightKeys,
    handlePoStatusChange,
    handleReadinessChange,
    handleBusinessValueChange,
    handleGuestimationChange,
    handleStoryPointsChange,
    handleJiraStatusChange,
    handleIssueTypeChange,
    handleTitleChange,
    handleAssigneeChange,
    handleEpicChange,
    handleSprintChange,
    handleCloseSubtasks,
    syncFromApiTickets,
    handleBulkSetReadiness,
    handleBulkSetStatus,
    handleBulkSetEpic,
    handleBulkMoveSprint,
    handleBulkUpdateAssignee,
    handleBulkUpdateLabels,
    handleBulkSetFlagged,
  };
}
