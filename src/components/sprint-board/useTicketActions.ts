"use client";

import { useState, useCallback } from "react";
import { mutate as globalMutate } from "swr";
import type { POStatus, TicketReadiness, Ticket, IssueType, JiraStatus, Assignee } from "@/types/ticket";
import { saveTicketMetadata, saveStoryPoints } from "@/components/sprint-board/sprint-board-utils";
import { apiFetch, jira } from "@/lib/api-client";
import { userInitials, userColor } from "@/lib/user-utils";
import type { AssignableUser } from "@/components/shared/AssigneePicker";
import type { EpicOption } from "@/components/shared/EpicPicker";
import { registerPendingMove, clearPendingMove, confirmPendingMove } from "@/components/sprint-board/pendingSprintMoves";
import { registerPendingEdit, confirmPendingEdit, clearPendingEdit, hasPendingEdit } from "@/components/sprint-board/pendingTicketEdits";
import { placementForMove } from "@/lib/sprint-placement";
import type { RowDataAdapter } from "@/components/sprint-board/row-actions/adapter";

interface TicketActionsDeps {
  // Surface-agnostic data access (BRDG-374). The board passes a makeBoardAdapter
  // over its Ticket[] caches. Bulk dispatch lives in useRowActions; this hook keeps
  // the board's per-row side-panel handlers (poStatus / story points / single
  // readiness / sync), which render from local maps the board owns.
  adapter: RowDataAdapter;
  showToast: (message: React.ReactNode, durationMs?: number) => void;
}

export function useTicketActions(deps: TicketActionsDeps) {
  const { adapter, showToast } = deps;
  const { activeListKey, sprintNameMap } = adapter;

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

  const handlePoStatusChange = useCallback((key: string, status: POStatus) => {
    const prevStatus = poStatuses[key];
    setPoStatuses((prev) => ({ ...prev, [key]: status }));
    // Overlay keeps the value past the in-flight window: a refetch that lands after
    // the save resolves (e.g. one served from the stale response cache) would
    // otherwise reconcile the map back via syncFromApiTickets.
    registerPendingEdit(key, "poStatus", status, Date.now());
    saveTicketMetadata(key, { poStatus: status }, activeListKey, { patchList: false }).then((ok) => {
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
    saveTicketMetadata(key, { readiness }, activeListKey, { patchList: false }).then((ok) => {
      if (ok) {
        confirmPendingEdit(key, "readiness");
      } else {
        clearPendingEdit(key, "readiness");
        setReadinessMap((m) => ({ ...m, [key]: prev }));
        showToast(`Failed to update ${key}. Change reverted.`);
      }
    });
  }, [readinessMap, activeListKey, showToast]);

  // On a confirmed save, revalidate the list so the overlay self-heals off fresh
  // server data. The save reliably clears the /api/tickets response cache, so the
  // refetch returns the new value. Without it the overlay's 30s TTL evicts the value
  // before any refetch lands (the All view has no background poll, refreshInterval=0),
  // so the score blinks out at ~30s and only reappears on a later focus/poll (BRDG-455).
  const handleBusinessValueChange = useCallback((key: string, value: number | null) => {
    registerPendingEdit(key, "businessValue", value, Date.now());
    saveTicketMetadata(key, { businessValue: value }, activeListKey, { patchList: false }).then((ok) => {
      if (ok) { confirmPendingEdit(key, "businessValue"); if (activeListKey) globalMutate(activeListKey); }
      else clearPendingEdit(key, "businessValue");
    });
  }, [activeListKey]);

  const handleGuestimationChange = useCallback((key: string, value: number | null) => {
    registerPendingEdit(key, "guestimation", value, Date.now());
    // The capacity meter reads a server-computed effective-points total (real SP
    // or guestimation), separate from the ticket list, so refresh it after the save.
    // Revalidate the list too so the overlay self-heals (see handleBusinessValueChange).
    saveTicketMetadata(key, { guestimation: value }, activeListKey, { patchList: false }).then((ok) => {
      if (ok) {
        confirmPendingEdit(key, "guestimation");
        globalMutate("/api/sprints/used-points");
        if (activeListKey) globalMutate(activeListKey);
      } else clearPendingEdit(key, "guestimation");
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
    saveStoryPoints(key, value, activeListKey, { patchList: false }).then((ok) => {
      if (ok) {
        confirmPendingEdit(key, "storyPoints");
        if (advancesReadiness) confirmPendingEdit(key, "readiness");
        globalMutate("/api/sprints/used-points");
        // Revalidate the list so the overlay self-heals (see handleBusinessValueChange).
        if (activeListKey) globalMutate(activeListKey);
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
      adapter.mutate();
    } catch {
      clearPendingEdit(key, "epic");
      clearPendingEdit(key, "epicKey");
      showToast(`Failed to update epic for ${key}. Change reverted.`);
    }
  }, [adapter, showToast]);

  // Sprint move requires a Jira round-trip; revalidate rather than optimistically
  // rewrite (the board's sprintId field carries the sprint name, not its id).
  const handleSprintChange = useCallback(async (key: string, sprintId: string | null) => {
    const target = sprintId ?? "__backlog__";
    const moved = adapter.getTicket(key);
    // Keep the row visible in its destination until the slow Jira move resolves.
    if (moved) registerPendingMove(moved, target, Date.now());
    try {
      // Placement rule (BRDG-370): a backlog or an in-flight ticket lands at the
      // top; a regular sprint lands at the bottom.
      const position = placementForMove(destNameFor(target));
      await jira.moveSprint({ issueKeys: [key], targetSprintId: target, position });
      confirmPendingMove(key);
      adapter.mutate();
    } catch {
      clearPendingMove(key);
      showToast(`Failed to move ${key} to sprint.`);
    }
  }, [adapter, showToast, destNameFor]);

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
    const current = adapter.getTicket(key)?.totalSubtaskCount ?? 0;
    registerPendingEdit(key, "totalSubtaskCount", current + addedCount, Date.now());
    confirmPendingEdit(key, "totalSubtaskCount");
  }, [adapter]);

  // Reconcile the optimistic PO maps with fresh API data. Values follow the SWR list
  // (so edits made on other surfaces, e.g. the ticket detail page, show up when the
  // board re-renders) except for keys with a live overlay edit (BRDG-357), whose
  // optimistic value owns the display until the server catches up, so a stale
  // revalidation must not reconcile the map back to the old value.
  const syncFromApiTickets = useCallback((tickets: Ticket[]) => {
    setPoStatuses((prev) => {
      let changed = false;
      const next = { ...prev };
      tickets.forEach((t) => {
        if (hasPendingEdit(t.key, "poStatus")) return;
        if (next[t.key] !== t.poStatus) { next[t.key] = t.poStatus; changed = true; }
      });
      return changed ? next : prev;
    });
    setReadinessMap((prev) => {
      let changed = false;
      const next = { ...prev };
      tickets.forEach((t) => {
        if (hasPendingEdit(t.key, "readiness")) return;
        if (next[t.key] !== t.readiness) { next[t.key] = t.readiness; changed = true; }
      });
      return changed ? next : prev;
    });
  }, []);

  return {
    poStatuses,
    readinessMap,
    // Exposed so the board's bulk-readiness optimism (in useRowActions via the board
    // dispatch adapter) can write the same map the board row renders from.
    setReadinessMap,
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
  };
}
