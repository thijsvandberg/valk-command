"use client";

import { useState, useCallback } from "react";
import { mutate as globalMutate, type KeyedMutator } from "swr";
import type { POStatus, TicketReadiness, Ticket, IssueType, JiraStatus, Assignee } from "@/types/ticket";
import { saveTicketMetadata, saveStoryPoints } from "@/components/sprint-board/sprint-board-utils";
import { apiFetch, jira, tickets as ticketsApi } from "@/lib/api-client";
import { userInitials, userColor } from "@/lib/user-utils";
import type { AssignableUser } from "@/components/shared/AssigneePicker";
import type { EpicOption } from "@/components/shared/EpicPicker";
import { registerPendingMove, clearPendingMove, confirmPendingMove } from "@/components/sprint-board/pendingSprintMoves";
import { registerPendingEdit, confirmPendingEdit, clearPendingEdit, hasPendingEdit } from "@/components/sprint-board/pendingTicketEdits";
import { placementForMove, topKeysForMove } from "@/lib/sprint-placement";

interface TicketActionsDeps {
  apiTickets: Ticket[] | undefined;
  mutateTickets: KeyedMutator<Ticket[]>;
  activeListKey: string | null;
  // Sprint id -> display name, used to apply the placement rule (BRDG-370): the
  // destination name decides whether moved rows land at the top or the bottom.
  // Optional: contexts that never move tickets between sprints (story writer,
  // refinement) may omit it, in which case unknown destinations default to top.
  sprintNameMap?: Record<string, string>;
  showToast: (message: React.ReactNode, durationMs?: number) => void;
}

export function useTicketActions(deps: TicketActionsDeps) {
  const { apiTickets, mutateTickets, activeListKey, sprintNameMap = {}, showToast } = deps;

  // Resolve a move target id to the destination sprint NAME for the placement
  // rule. The generic backlog sentinel and unknown ids resolve to null (treated
  // as "top" by placementForMove).
  const destNameFor = useCallback(
    (targetSprintId: string): string | null =>
      targetSprintId === "__backlog__" ? null : (sprintNameMap[targetSprintId] ?? null),
    [sprintNameMap],
  );

  const [poStatuses, setPoStatuses] = useState<Record<string, POStatus>>({});
  const [readinessMap, setReadinessMap] = useState<Record<string, TicketReadiness | null>>({});
  const [inflightKeys, setInflightKeys] = useState<Set<string>>(new Set());

  const handlePoStatusChange = useCallback((key: string, status: POStatus) => {
    const prevStatus = poStatuses[key];
    setPoStatuses((prev) => ({ ...prev, [key]: status }));
    // Overlay keeps the value past the in-flight window: a refetch that lands after
    // the save resolves (e.g. one served from the stale response cache) would
    // otherwise reconcile the map back via syncFromApiTickets.
    registerPendingEdit(key, "poStatus", status, Date.now());
    saveTicketMetadata(key, { poStatus: status }, activeListKey).then((ok) => {
      if (ok) {
        confirmPendingEdit(key, "poStatus");
      } else {
        clearPendingEdit(key, "poStatus");
        setPoStatuses((prev) => ({ ...prev, [key]: prevStatus }));
        showToast(`Failed to update ${key}. Change reverted.`);
      }
    });
  }, [poStatuses, activeListKey, showToast]);

  const handleReadinessChange = useCallback((key: string, readiness: TicketReadiness | null) => {
    const prev = readinessMap[key];
    setReadinessMap((m) => ({ ...m, [key]: readiness }));
    registerPendingEdit(key, "readiness", readiness, Date.now());
    saveTicketMetadata(key, { readiness }, activeListKey).then((ok) => {
      if (ok) {
        confirmPendingEdit(key, "readiness");
      } else {
        clearPendingEdit(key, "readiness");
        setReadinessMap((m) => ({ ...m, [key]: prev }));
        showToast(`Failed to update ${key}. Change reverted.`);
      }
    });
  }, [readinessMap, activeListKey, showToast]);

  const handleBusinessValueChange = useCallback((key: string, value: number | null) => {
    registerPendingEdit(key, "businessValue", value, Date.now());
    saveTicketMetadata(key, { businessValue: value }, activeListKey).then((ok) => {
      if (ok) confirmPendingEdit(key, "businessValue");
      else clearPendingEdit(key, "businessValue");
    });
  }, [activeListKey]);

  const handleGuestimationChange = useCallback((key: string, value: number | null) => {
    registerPendingEdit(key, "guestimation", value, Date.now());
    // The capacity meter reads a server-computed effective-points total (real SP
    // or guestimation), separate from the ticket list, so refresh it after the save.
    saveTicketMetadata(key, { guestimation: value }, activeListKey).then((ok) => {
      if (ok) { confirmPendingEdit(key, "guestimation"); globalMutate("/api/sprints/used-points"); }
      else clearPendingEdit(key, "guestimation");
    });
  }, [activeListKey]);

  const handleStoryPointsChange = useCallback((key: string, value: number | null) => {
    registerPendingEdit(key, "storyPoints", value, Date.now());
    // Mirror the server rule (ticket-detail-builder): estimating a ticket that
    // sits at "Ready to Refine" advances it to "Ready for Development". The
    // board's readiness pill reads from the optimistic map, so update it here too
    // (and register an overlay edit so a refetch does not revert the pill).
    const advancesReadiness = value != null && (readinessMap[key] ?? null) === "ready_to_refine";
    const prevReadiness = readinessMap[key];
    if (advancesReadiness) {
      setReadinessMap((m) => ({ ...m, [key]: null }));
      registerPendingEdit(key, "readiness", null, Date.now());
    }
    saveStoryPoints(key, value, activeListKey).then((ok) => {
      if (ok) {
        confirmPendingEdit(key, "storyPoints");
        if (advancesReadiness) confirmPendingEdit(key, "readiness");
        globalMutate("/api/sprints/used-points");
      } else {
        clearPendingEdit(key, "storyPoints");
        if (advancesReadiness) {
          clearPendingEdit(key, "readiness");
          setReadinessMap((m) => ({ ...m, [key]: prevReadiness ?? null }));
        }
      }
    });
  }, [activeListKey, readinessMap]);

  // All these edits go through the pendingTicketEdits overlay (BRDG-357): register
  // the optimistic value, call the API, then confirm on success / clear on failure.
  // The overlay re-applies the value on top of every revalidation until the server
  // catches up, so the focus/poll/sync refetch can no longer flip the row back to a
  // pre-write Jira read (the old optimisticData/cache-patch only survived one round).
  const handleJiraStatusChange = useCallback(async (key: string, status: JiraStatus) => {
    registerPendingEdit(key, "jiraStatus", status, Date.now());
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(key)}/status`, { method: "PUT", body: { status } });
      confirmPendingEdit(key, "jiraStatus");
    } catch {
      clearPendingEdit(key, "jiraStatus");
      showToast(`Failed to update status for ${key}. Change reverted.`);
    }
  }, [showToast]);

  const handleIssueTypeChange = useCallback(async (key: string, type: IssueType) => {
    registerPendingEdit(key, "type", type, Date.now());
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(key)}`, { method: "PATCH", body: { type } });
      confirmPendingEdit(key, "type");
    } catch {
      clearPendingEdit(key, "type");
    }
  }, []);

  const handleTitleChange = useCallback(async (key: string, title: string) => {
    registerPendingEdit(key, "title", title, Date.now());
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(key)}/summary`, { method: "PUT", body: { title } });
      confirmPendingEdit(key, "title");
    } catch {
      clearPendingEdit(key, "title");
    }
  }, []);

  const handleAssigneeChange = useCallback(async (key: string, user: AssignableUser | null) => {
    const optimistic: Assignee | null = user
      ? { name: user.displayName, initials: userInitials(user.displayName), color: userColor(user.displayName) }
      : null;
    registerPendingEdit(key, "assignee", optimistic, Date.now());
    try {
      await jira.assign({ issueKey: key, accountId: user?.accountId ?? null, name: user?.displayName ?? null, avatar: user?.avatarUrl ?? null });
      confirmPendingEdit(key, "assignee");
    } catch {
      clearPendingEdit(key, "assignee");
      showToast(`Failed to update assignee for ${key}. Change reverted.`);
    }
  }, [showToast]);

  const handleEpicChange = useCallback(async (key: string, epic: EpicOption | null) => {
    const now = Date.now();
    registerPendingEdit(key, "epic", epic?.name ?? null, now);
    registerPendingEdit(key, "epicKey", epic?.key ?? null, now);
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(key)}`, { method: "PATCH", body: { epicKey: epic?.key ?? null } });
      confirmPendingEdit(key, "epic");
      confirmPendingEdit(key, "epicKey");
      mutateTickets();
    } catch {
      clearPendingEdit(key, "epic");
      clearPendingEdit(key, "epicKey");
      showToast(`Failed to update epic for ${key}. Change reverted.`);
    }
  }, [mutateTickets, showToast]);

  // Sprint move requires a Jira round-trip; revalidate rather than optimistically
  // rewrite (the board's sprintId field carries the sprint name, not its id).
  const handleSprintChange = useCallback(async (key: string, sprintId: string | null) => {
    const target = sprintId ?? "__backlog__";
    const moved = apiTickets?.find((t) => t.key === key);
    // Keep the row visible in its destination until the slow Jira move resolves.
    if (moved) registerPendingMove(moved, target, Date.now());
    try {
      // Placement rule (BRDG-370): a backlog or an in-flight ticket lands at the
      // top; a regular sprint lands at the bottom.
      const position = placementForMove(destNameFor(target), moved?.jiraStatus);
      await jira.moveSprint({ issueKeys: [key], targetSprintId: target, position });
      confirmPendingMove(key);
      mutateTickets();
    } catch {
      clearPendingMove(key);
      showToast(`Failed to move ${key} to sprint.`);
    }
  }, [apiTickets, mutateTickets, showToast, destNameFor]);

  const handleCloseSubtasks = useCallback(async (key: string) => {
    registerPendingEdit(key, "openSubtaskCount", 0, Date.now());
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(key)}/subtasks/close`, { method: "POST" });
      confirmPendingEdit(key, "openSubtaskCount");
    } catch {
      clearPendingEdit(key, "openSubtaskCount");
    }
  }, []);

  // Subtasks were created from the board (BRDG-366 add-subtasks modal). The writes
  // already succeeded, so overlay the new total immediately and mark it confirmed:
  // this clears the "No subtasks" warning before the list refetch catches up (the
  // warning is computed from totalSubtaskCount). Self-heal drops the overlay once the
  // server reflects the count.
  const handleSubtasksAdded = useCallback((key: string, addedCount: number) => {
    if (addedCount <= 0) return;
    const current = apiTickets?.find((t) => t.key === key)?.totalSubtaskCount ?? 0;
    registerPendingEdit(key, "totalSubtaskCount", current + addedCount, Date.now());
    confirmPendingEdit(key, "totalSubtaskCount");
  }, [apiTickets]);

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
        // A live overlay edit (BRDG-357) owns the value until the server catches up,
        // so a stale revalidation must not reconcile the map back to the old value.
        if (hasPendingEdit(t.key, "poStatus")) return;
        if (next[t.key] !== t.poStatus) { next[t.key] = t.poStatus; changed = true; }
      });
      return changed ? next : prev;
    });
    setReadinessMap((prev) => {
      let changed = false;
      const next = { ...prev };
      tickets.forEach((t) => {
        if (inflightKeys.has(t.key)) return;
        if (hasPendingEdit(t.key, "readiness")) return;
        if (next[t.key] !== t.readiness) { next[t.key] = t.readiness; changed = true; }
      });
      return changed ? next : prev;
    });
  }, [inflightKeys]);

  const handleBulkSetReadiness = useCallback(async (readiness: TicketReadiness | null, checkedTickets: Set<string>) => {
    const keys = [...checkedTickets];
    const prevReadiness = Object.fromEntries(keys.map((k) => [k, readinessMap[k]]));
    const now = Date.now();
    setReadinessMap((prev) => { const next = { ...prev }; keys.forEach((k) => { next[k] = readiness; }); return next; });
    setInflightKeys((prev) => { const next = new Set(prev); keys.forEach((k) => next.add(k)); return next; });
    keys.forEach((k) => registerPendingEdit(k, "readiness", readiness, now));
    const results = await Promise.all(keys.map((k) => saveTicketMetadata(k, { readiness }, activeListKey)));
    setInflightKeys((prev) => { const next = new Set(prev); keys.forEach((k) => next.delete(k)); return next; });
    keys.forEach((k, i) => { if (results[i]) confirmPendingEdit(k, "readiness"); else clearPendingEdit(k, "readiness"); });
    const failedCount = results.filter((ok) => !ok).length;
    if (failedCount > 0) {
      setReadinessMap((prev) => { const next = { ...prev }; keys.forEach((k, i) => { if (!results[i]) next[k] = prevReadiness[k]; }); return next; });
      showToast(`Failed to update ${failedCount} ticket${failedCount === 1 ? "" : "s"}. Changes reverted.`);
    } else {
      showToast(`Readiness set for ${keys.length} ticket${keys.length === 1 ? "" : "s"}`);
    }
  }, [readinessMap, showToast, activeListKey]);

  const handleBulkSetStatus = useCallback(async (status: JiraStatus, checkedTickets: Set<string>) => {
    const keys = [...checkedTickets];
    const now = Date.now();
    keys.forEach((k) => registerPendingEdit(k, "jiraStatus", status, now));
    const results = await Promise.allSettled(keys.map((k) => apiFetch(`/api/tickets/${encodeURIComponent(k)}/status`, { method: "PUT", body: { status } })));
    let failedCount = 0;
    keys.forEach((k, i) => {
      if (results[i].status === "fulfilled") confirmPendingEdit(k, "jiraStatus");
      else { clearPendingEdit(k, "jiraStatus"); failedCount++; }
    });
    if (failedCount > 0) {
      showToast(`Failed to update status for ${failedCount} ticket${failedCount === 1 ? "" : "s"}`);
    } else {
      showToast(`Status set to ${status} for ${keys.length} ticket${keys.length === 1 ? "" : "s"}`);
    }
  }, [showToast]);

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
    // Keep the moved rows visible in their destination until the Jira move resolves.
    const now = Date.now();
    movedTickets.forEach((t) => registerPendingMove(t, targetSprintId, now));
    try {
      // Placement rule (BRDG-370): split the batch so in-flight rows (and any
      // backlog move) land at the top and the rest at the bottom of the target.
      const destName = destNameFor(targetSprintId);
      const topKeys = topKeysForMove(keys, destName, (k) => apiTickets?.find((t) => t.key === k)?.jiraStatus);
      await jira.moveSprint({ issueKeys: keys, targetSprintId, topKeys });
      keys.forEach((k) => confirmPendingMove(k));

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

      // Inject the moved tickets at the TOP of the destination cache (de-duplicated)
      // so they sit where they land. The list sorts by jiraRank ascending, so the
      // moved rows get a rank below the current minimum.
      if (destKey !== activeListKey) {
        globalMutate<Ticket[]>(
          destKey,
          (current) => {
            const base = current ?? [];
            const existing = new Set(base.map((t) => t.key));
            const topRank = Math.min(0, ...base.map((t) => t.jiraRank ?? 0)) - 1;
            const fresh = movedTickets
              .filter((t) => !existing.has(t.key))
              .map((t) => ({ ...t, jiraRank: topRank }));
            return [...fresh, ...base];
          },
          { revalidate: false },
        );
      }

      return { ok: true, count: keys.length };
    } catch {
      keys.forEach((k) => clearPendingMove(k));
      return { ok: false, count: keys.length };
    }
  }, [apiTickets, mutateTickets, activeListKey, destNameFor]);

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
    const now = Date.now();
    keys.forEach((k) => registerPendingEdit(k, "flagged", flagged, now));
    const results = await Promise.allSettled(keys.map((k) => ticketsApi.toggleFlag(k, flagged, reason ?? undefined)));
    let failedCount = 0;
    keys.forEach((k, i) => {
      if (results[i].status === "fulfilled") confirmPendingEdit(k, "flagged");
      else { clearPendingEdit(k, "flagged"); failedCount++; }
    });
    if (failedCount > 0) {
      showToast(`Failed to ${flagged ? "flag" : "unflag"} ${failedCount} ticket${failedCount === 1 ? "" : "s"}`);
    } else {
      showToast(`${flagged ? "Flagged" : "Unflagged"} ${keys.length} ticket${keys.length === 1 ? "" : "s"}`);
    }
  }, [showToast]);

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
    handleSubtasksAdded,
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
