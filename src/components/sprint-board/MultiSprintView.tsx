"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type { Ticket, Sprint, POStatus, TicketReadiness, JiraStatus, IssueType } from "@/types/ticket";
import {
  usePendingTicketEdits,
  applyPendingEdits,
  registerPendingEdit,
  confirmPendingEdit,
  clearPendingEdit,
  valuesMatch,
} from "./pendingTicketEdits";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { ViewHeader, ViewHeaderTitle, ViewHeaderDivider } from "@/components/shared/ViewHeader";
import { SidePanel } from "./SidePanel";
import { BulkActionBar } from "./BulkActionBar";
import { BoardFieldToggle } from "./BoardFieldToggle";
import { DEFAULT_VISIBLE_TAGS, type InlineTagId } from "./filter-bar-types";
import { useAccountSetting } from "@/hooks/useAccountSetting";
import { saveTicketMetadata, saveStoryPoints } from "./sprint-board-utils";
import { DroppableSprintColumn, PaneDivider } from "./DroppableSprintColumn";
import { getJiraUrl } from "./TicketTableCells";
import { X, Columns2 } from "lucide-react";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";
import { useTickets } from "@/hooks/useSprintBoard";
import { useTicketSessionMap } from "@/hooks/useTicketSessionMap";
import { apiFetch, jira } from "@/lib/api-client";
import { topKeysForMove } from "@/lib/sprint-placement";
import { pluralize } from "@/lib/pluralize";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
  type CollisionDetection,
  pointerWithin,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { loadSplitRatio, saveSplitRatio } from "./multi-sprint-utils";

// A drag (reorder/move) optimistically holds the affected column(s) as a whole-list
// override. It is held until the server-confirmed data can have propagated (the move/
// rank routes update the local mirror synchronously, but the /api/tickets response
// cache + an in-flight 60s poll/focus revalidation can still serve pre-move data for a
// short window), then dropped so fresh server data flows back in. This mirrors the
// overlay's TTL safety net and is what stops a concurrent refetch from reverting the move.
const MOVE_OVERRIDE_TTL_MS = 30_000;

// Prefer the most specific droppable (ticket row) over the large column container.
// Ticket rows are checked first with pointerWithin; if the pointer is between rows or
// over an empty column, we fall back to the column container.
const compareCollisionDetection: CollisionDetection = (args) => {
  const ticketContainers = args.droppableContainers.filter(
    (c) => c.id !== "left" && c.id !== "right",
  );
  const ticketHits = pointerWithin({ ...args, droppableContainers: ticketContainers });
  if (ticketHits.length > 0) return ticketHits;
  const columnContainers = args.droppableContainers.filter(
    (c) => c.id === "left" || c.id === "right",
  );
  return pointerWithin({ ...args, droppableContainers: columnContainers });
};

// --- Main MultiSprintView ---

export function MultiSprintView({
  initialLeft,
  initialRight,
  sprints,
  backlogCount = 0,
  onClose,
  onSprintChange,
}: {
  initialLeft: string;
  initialRight: string;
  sprints: Sprint[];
  backlogCount?: number;
  onClose: () => void;
  onSprintChange?: (side: "left" | "right", sprintId: string) => void;
}) {
  const [leftSprint, setLeftSprint] = useState(initialLeft);
  const [rightSprint, setRightSprint] = useState(initialRight);

  const { data: leftApiTickets, mutate: mutateLeft } = useTickets(leftSprint);
  const { data: rightApiTickets, mutate: mutateRight } = useTickets(rightSprint);
  const { ticketSessionMap } = useTicketSessionMap();

  // Local overrides keyed by sprintId so they auto-invalidate when the sprint changes
  const [leftOverride, setLeftOverride] = useState<{ sprintId: string; tickets: Ticket[] } | null>(null);
  const [rightOverride, setRightOverride] = useState<{ sprintId: string; tickets: Ticket[] } | null>(null);

  // Field edits (title/status/type/SP/BV) ride the shared optimistic overlay so a
  // background revalidation / focus refetch cannot snap them back (BRDG-407). This
  // replaces the old per-handler `mutate(..., { revalidate:false })` patches, which
  // survived exactly one revalidation. See docs/architecture/optimistic-updates.md.
  const pendingEdits = usePendingTicketEdits();

  const leftTickets = useMemo(() => {
    const base = (leftOverride?.sprintId === leftSprint ? leftOverride.tickets : null) ?? leftApiTickets ?? [];
    return applyPendingEdits(base, pendingEdits, Date.now()) ?? base;
  }, [leftOverride, leftSprint, leftApiTickets, pendingEdits]);
  const rightTickets = useMemo(() => {
    const base = (rightOverride?.sprintId === rightSprint ? rightOverride.tickets : null) ?? rightApiTickets ?? [];
    return applyPendingEdits(base, pendingEdits, Date.now()) ?? base;
  }, [rightOverride, rightSprint, rightApiTickets, pendingEdits]);

  // Timers that drop a move override after MOVE_OVERRIDE_TTL_MS. Tracked so they are
  // cleared on unmount (and re-armed per move) rather than leaking.
  const overrideTimers = useRef<{ left: ReturnType<typeof setTimeout> | null; right: ReturnType<typeof setTimeout> | null }>({ left: null, right: null });
  useEffect(() => {
    const timers = overrideTimers.current;
    return () => {
      if (timers.left) clearTimeout(timers.left);
      if (timers.right) clearTimeout(timers.right);
    };
  }, []);
  const scheduleOverrideClear = useCallback((side: "left" | "right") => {
    const timers = overrideTimers.current;
    if (timers[side]) clearTimeout(timers[side]!);
    timers[side] = setTimeout(() => {
      if (side === "left") setLeftOverride(null);
      else setRightOverride(null);
      timers[side] = null;
    }, MOVE_OVERRIDE_TTL_MS);
  }, []);

  // Self-heal field edits: drop a confirmed overlay edit once the server list reflects
  // it (gating on `confirmed`, like the board, so an in-flight revalidation can't clear
  // it before the write lands). A ticket currently held by a move override is skipped:
  // its display comes from the override snapshot, so clearing the overlay there could
  // reveal a stale snapshot value until the override's TTL drops it. The overlay's own
  // TTL is the safety net if the server never catches up. clearPendingEdit writes the
  // external store (not React state), so this is safe inside an effect.
  useEffect(() => {
    const all = [...(leftApiTickets ?? []), ...(rightApiTickets ?? [])];
    if (all.length === 0) return;
    const overridden = new Set<string>([
      ...(leftOverride?.sprintId === leftSprint ? leftOverride.tickets : []).map((t) => t.key),
      ...(rightOverride?.sprintId === rightSprint ? rightOverride.tickets : []).map((t) => t.key),
    ]);
    const byKey = new Map(all.map((t) => [t.key, t as unknown as Record<string, unknown>]));
    pendingEdits.forEach((edit) => {
      if (!edit.confirmed || overridden.has(edit.key)) return;
      const server = byKey.get(edit.key);
      if (server && valuesMatch(server[edit.field], edit.value)) clearPendingEdit(edit.key, edit.field);
    });
  }, [leftApiTickets, rightApiTickets, leftOverride, rightOverride, leftSprint, rightSprint, pendingEdits]);

  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [leftSyncing, setLeftSyncing] = useState(false);
  const [rightSyncing, setRightSyncing] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [poStatuses, setPoStatuses] = useState<Record<string, POStatus>>({});
  const [editingTitleKey, setEditingTitleKey] = useState<string | null>(null);
  const [readinessMap, setReadinessMap] = useState<Record<string, TicketReadiness | null>>({});

  // Inline badge/signal visibility. Account-scoped but kept independent from the
  // main sprint board's row fields, so toggling here only affects the Compare view.
  const { value: storedTags, setValue: setStoredTags } = useAccountSetting<InlineTagId[]>(
    "/api/settings/compare-row-fields",
    [...DEFAULT_VISIBLE_TAGS],
  );
  const visibleTags = useMemo(() => new Set(storedTags), [storedTags]);
  const handleFieldToggle = useCallback((id: InlineTagId, show: boolean) => {
    setStoredTags((prev) => {
      const next = new Set(prev);
      if (show) next.add(id);
      else next.delete(id);
      return [...next];
    });
  }, [setStoredTags]);
  const resetFields = useCallback(() => setStoredTags([...DEFAULT_VISIBLE_TAGS]), [setStoredTags]);

  // Pane split ratio
  const [splitRatio, setSplitRatio] = useState(() => loadSplitRatio());
  const splitContainerRef = useRef<HTMLDivElement>(null);

  const { toast, toastLoading, showToast, dismissToast } = useToast();

  const getListKeyForTicket = useCallback((key: string) => {
    const sprintId = leftTickets.some((t) => t.key === key) ? leftSprint : rightSprint;
    return `/api/tickets?sprintId=${encodeURIComponent(sprintId)}`;
  }, [leftTickets, leftSprint, rightSprint]);

  const handleTitleChange = useCallback(async (key: string, title: string) => {
    registerPendingEdit(key, "title", title, Date.now());
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(key)}/summary`, { method: "PUT", body: { title } });
      confirmPendingEdit(key, "title");
    } catch {
      clearPendingEdit(key, "title");
      showToast("Failed to update title. Reverted.");
    }
  }, [showToast]);

  const handleBusinessValueChange = useCallback((key: string, value: number | null) => {
    // Overlay owns board display (BRDG-407); pass patchList:false so the helper does
    // not also patch the list cache (which would let the self-heal clear early).
    registerPendingEdit(key, "businessValue", value, Date.now());
    saveTicketMetadata(key, { businessValue: value }, getListKeyForTicket(key), { patchList: false }).then((ok) => {
      if (ok) confirmPendingEdit(key, "businessValue");
      else clearPendingEdit(key, "businessValue");
    });
  }, [getListKeyForTicket]);

  const handleStoryPointsChange = useCallback((key: string, value: number | null) => {
    registerPendingEdit(key, "storyPoints", value, Date.now());
    // Mirror the server rule: estimating a ticket at "Ready to Refine" advances
    // it to "Ready for Development". The readiness pill reads the local map, which
    // the SP save would not refresh, so update it here (revert on fail).
    const advancing = value != null && (readinessMap[key] ?? null) === "ready_to_refine";
    const prevReadiness = readinessMap[key];
    if (advancing) setReadinessMap((m) => ({ ...m, [key]: null }));
    saveStoryPoints(key, value, getListKeyForTicket(key), { patchList: false }).then((ok) => {
      if (ok) {
        confirmPendingEdit(key, "storyPoints");
      } else {
        clearPendingEdit(key, "storyPoints");
        if (advancing) setReadinessMap((m) => ({ ...m, [key]: prevReadiness }));
      }
    });
  }, [readinessMap, getListKeyForTicket]);

  const handleReadinessChange = useCallback((key: string, readiness: TicketReadiness | null) => {
    const prev = readinessMap[key];
    setReadinessMap((m) => ({ ...m, [key]: readiness }));
    saveTicketMetadata(key, { readiness }, getListKeyForTicket(key)).then((ok) => {
      if (!ok) setReadinessMap((m) => ({ ...m, [key]: prev }));
    });
  }, [readinessMap, getListKeyForTicket]);

  const handleJiraStatusChange = useCallback(async (key: string, status: JiraStatus) => {
    registerPendingEdit(key, "jiraStatus", status, Date.now());
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(key)}/status`, { method: "PUT", body: { status } });
      confirmPendingEdit(key, "jiraStatus");
    } catch {
      clearPendingEdit(key, "jiraStatus");
      showToast("Failed to update status. Reverted.");
    }
  }, [showToast]);

  const handleIssueTypeChange = useCallback(async (key: string, type: IssueType) => {
    registerPendingEdit(key, "type", type, Date.now());
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(key)}`, { method: "PATCH", body: { type } });
      confirmPendingEdit(key, "type");
    } catch {
      clearPendingEdit(key, "type");
      showToast("Failed to update issue type. Reverted.");
    }
  }, [showToast]);

  const handleCopyToClipboard = useCallback(() => {
    const allTickets = [...leftTickets, ...rightTickets];
    const selected = allTickets.filter((t) => checkedKeys.has(t.key));
    const text = selected.map((t) => `${t.title} - ${getJiraUrl(t.key)}`).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      showToast(`Copied ${selected.length} ticket${selected.length === 1 ? "" : "s"} to clipboard`);
    }).catch(() => {
      showToast("Failed to copy to clipboard");
    });
  }, [leftTickets, rightTickets, checkedKeys, showToast]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
    setDragOverId(null);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over ? String(event.over.id) : null;
    // Only track ticket keys; ignore container droppables ("left"/"right")
    setDragOverId(overId && overId !== "left" && overId !== "right" ? overId : null);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDragId(null);
      setDragOverId(null);
      if (!over) return;

      const draggedKey = active.id as string;
      const sourceColumnId = active.data.current?.columnId as "left" | "right";
      const overId = String(over.id);

      // Determine target column: container droppable uses "left"/"right" id, ticket uses data.columnId
      const isContainerDrop = overId === "left" || overId === "right";
      const targetColumnId: "left" | "right" = isContainerDrop
        ? (overId as "left" | "right")
        : ((over.data.current?.columnId as "left" | "right") ??
            (leftTickets.some((t) => t.key === overId) ? "left" : "right"));
      const targetOverKey: string | null = isContainerDrop ? null : overId;

      const sourceTickets = sourceColumnId === "left" ? leftTickets : rightTickets;
      const targetTickets = targetColumnId === "left" ? leftTickets : rightTickets;

      if (sourceColumnId === targetColumnId) {
        // Within-column reorder — single ticket only
        if (!targetOverKey || targetOverKey === draggedKey) return;
        const draggedIdx = sourceTickets.findIndex((t) => t.key === draggedKey);
        const targetIdx = sourceTickets.findIndex((t) => t.key === targetOverKey);
        if (draggedIdx === -1 || targetIdx === -1 || draggedIdx === targetIdx) return;

        const reordered = arrayMove(sourceTickets, draggedIdx, targetIdx);

        const prevLeftOverride = leftOverride;
        const prevRightOverride = rightOverride;

        if (sourceColumnId === "left") {
          setLeftOverride({ sprintId: leftSprint, tickets: reordered });
        } else {
          setRightOverride({ sprintId: rightSprint, tickets: reordered });
        }

        const newDraggedIdx = reordered.findIndex((t) => t.key === draggedKey);
        const rankBeforeKey = reordered[newDraggedIdx + 1]?.key;
        const rankAfterKey = !rankBeforeKey ? reordered[newDraggedIdx - 1]?.key : undefined;

        try {
          await jira.rank({ issueKeys: [draggedKey], rankBeforeKey, rankAfterKey });
          // Patch the SWR cache with the reordered list without triggering a refetch,
          // and KEEP the override until MOVE_OVERRIDE_TTL_MS passes (BRDG-407). Dropping
          // it immediately let an in-flight poll/focus refetch (or the ~30s response
          // cache) serve the pre-reorder order and snap the row back.
          if (sourceColumnId === "left") {
            await mutateLeft(reordered, { revalidate: false });
            scheduleOverrideClear("left");
          } else {
            await mutateRight(reordered, { revalidate: false });
            scheduleOverrideClear("right");
          }
        } catch {
          setLeftOverride(prevLeftOverride);
          setRightOverride(prevRightOverride);
          showToast("Failed to reorder. Changes reverted.");
        }
        return;
      }

      // Cross-column move
      const keysToMove = checkedKeys.has(draggedKey)
        ? [...checkedKeys].filter((k) => sourceTickets.some((t) => t.key === k))
        : [draggedKey];

      const ticketsToMove = keysToMove
        .map((k) => sourceTickets.find((t) => t.key === k))
        .filter((t): t is Ticket => t !== undefined);

      const newSource = sourceTickets.filter((t) => !keysToMove.includes(t.key));
      // Insert before the target ticket if dragged onto one, otherwise append
      let newTarget: Ticket[];
      if (targetOverKey) {
        const insertIdx = targetTickets.findIndex((t) => t.key === targetOverKey);
        newTarget = [
          ...targetTickets.slice(0, insertIdx),
          ...ticketsToMove,
          ...targetTickets.slice(insertIdx),
        ];
      } else {
        newTarget = [...targetTickets, ...ticketsToMove];
      }

      const prevLeftOverride = leftOverride;
      const prevRightOverride = rightOverride;

      if (sourceColumnId === "left") {
        setLeftOverride({ sprintId: leftSprint, tickets: newSource });
        setRightOverride({ sprintId: rightSprint, tickets: newTarget });
      } else {
        setRightOverride({ sprintId: rightSprint, tickets: newSource });
        setLeftOverride({ sprintId: leftSprint, tickets: newTarget });
      }

      setCheckedKeys((prev) => {
        const next = new Set(prev);
        keysToMove.forEach((k) => next.delete(k));
        return next;
      });

      const targetSprintId = targetColumnId === "left" ? leftSprint : rightSprint;
      const destSprint = sprints.find((s) => s.id === targetSprintId);
      const targetName = destSprint?.name ?? "target sprint";

      try {
        if (targetOverKey) {
          // Dropped onto a specific row: rank relative to it (explicit position).
          // Rank is best-effort — don't let a rank failure revert a successful move.
          await jira.moveSprint({ issueKeys: keysToMove, targetSprintId });
          jira.rank({ issueKeys: keysToMove, rankBeforeKey: targetOverKey, sprintId: targetSprintId }).catch(() => {});
        } else {
          // Dropped onto the column/zone: the placement rule decides the edge
          // (BRDG-370) - a regular sprint takes the batch at the bottom, a backlog at the top.
          const topKeys = topKeysForMove(keysToMove, destSprint?.name ?? null);
          await jira.moveSprint({ issueKeys: keysToMove, targetSprintId, topKeys });
        }
        showToast(`Moved ${keysToMove.length} ticket${keysToMove.length === 1 ? "" : "s"} to ${targetName}`);
        // Patch both SWR caches with the optimistic state; skip the refetch. KEEP both
        // overrides until MOVE_OVERRIDE_TTL_MS passes (BRDG-407) so a concurrent
        // poll/focus refetch (or the ~30s response cache) cannot revert the move before
        // the server-confirmed membership has propagated back.
        if (sourceColumnId === "left") {
          await mutateLeft(newSource, { revalidate: false });
          await mutateRight(newTarget, { revalidate: false });
        } else {
          await mutateRight(newSource, { revalidate: false });
          await mutateLeft(newTarget, { revalidate: false });
        }
        scheduleOverrideClear("left");
        scheduleOverrideClear("right");
      } catch {
        setLeftOverride(prevLeftOverride);
        setRightOverride(prevRightOverride);
        showToast("Failed to move tickets. Changes reverted.");
      }
    },
    [checkedKeys, leftTickets, rightTickets, leftSprint, rightSprint, sprints, showToast, leftOverride, rightOverride, mutateLeft, mutateRight, scheduleOverrideClear],
  );

  const selectedTicket = useMemo(
    () => (selectedKey ? [...leftTickets, ...rightTickets].find((t) => t.key === selectedKey) ?? null : null),
    [selectedKey, leftTickets, rightTickets],
  );

  const activeDragTicket = useMemo(
    () => (activeDragId ? [...leftTickets, ...rightTickets].find((t) => t.key === activeDragId) ?? null : null),
    [activeDragId, leftTickets, rightTickets],
  );

  const handlePoStatusChange = useCallback(
    (status: POStatus) => {
      if (!selectedKey) return;
      setPoStatuses((prev) => ({ ...prev, [selectedKey]: status }));
    },
    [selectedKey],
  );

  const handleRefreshLeft = useCallback(async () => {
    setLeftSyncing(true);
    try {
      await jira.syncTickets({ sprintId: leftSprint });
      setLeftOverride(null);
      await mutateLeft();
      showToast("Left sprint refreshed");
    } finally {
      setLeftSyncing(false);
    }
  }, [leftSprint, mutateLeft, showToast]);

  const handleRefreshRight = useCallback(async () => {
    setRightSyncing(true);
    try {
      await jira.syncTickets({ sprintId: rightSprint });
      setRightOverride(null);
      await mutateRight();
      showToast("Right sprint refreshed");
    } finally {
      setRightSyncing(false);
    }
  }, [rightSprint, mutateRight, showToast]);

  const toggleCheck = useCallback((key: string) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const leftAllChecked = leftTickets.length > 0 && leftTickets.every((t) => checkedKeys.has(t.key));
  const leftSomeChecked = leftTickets.some((t) => checkedKeys.has(t.key));
  const rightAllChecked = rightTickets.length > 0 && rightTickets.every((t) => checkedKeys.has(t.key));
  const rightSomeChecked = rightTickets.some((t) => checkedKeys.has(t.key));

  const totalItems = leftTickets.length + rightTickets.length;
  const allBothChecked = leftAllChecked && rightAllChecked && totalItems > 0;
  const someBothChecked = leftSomeChecked || rightSomeChecked;

  const toggleAll = useCallback(() => {
    setCheckedKeys((prev) => {
      if (allBothChecked) return new Set();
      const next = new Set(prev);
      [...leftTickets, ...rightTickets].forEach((t) => next.add(t.key));
      return next;
    });
  }, [allBothChecked, leftTickets, rightTickets]);
  const totalChecked = checkedKeys.size;
  const totalSelectedPoints = [...leftTickets, ...rightTickets]
    .filter((t) => checkedKeys.has(t.key))
    .reduce((s, t) => s + (t.storyPoints ?? 0), 0);

  return (
    <DndContext sensors={sensors} collisionDetection={compareCollisionDetection} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="relative flex h-full flex-col">
        <ViewHeader
          icon={<Columns2 size={15} strokeWidth={1.5} className="text-text-tertiary" />}
          actions={
            <>
              <BoardFieldToggle
                visible={visibleTags}
                onChange={handleFieldToggle}
                onReset={resetFields}
              />
              <Button
                variant="ghost"
                size="md"
                iconOnly
                icon={<X className="h-3.5 w-3.5" strokeWidth={1.5} />}
                onClick={onClose}
                title="Close compare view"
              />
            </>
          }
        >
          <ViewHeaderTitle>Compare Sprints</ViewHeaderTitle>
          <ViewHeaderDivider />
          <span className="text-body-lg text-text-tertiary">{totalItems} {pluralize(totalItems, "item")} total</span>
        </ViewHeader>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          <div ref={splitContainerRef} className="flex min-w-0 flex-1 overflow-hidden">
            <DroppableSprintColumn
              columnId="left"
              sprintId={leftSprint}
              tickets={leftTickets}
              checkedKeys={checkedKeys}
              selectedKey={selectedKey}
              syncing={leftSyncing}
              onRefresh={handleRefreshLeft}
              onToggleCheck={toggleCheck}
              onSelect={setSelectedKey}
              someChecked={leftSomeChecked}
              sprints={sprints}
              backlogCount={backlogCount}
              onChangeSprint={(id) => {
                setLeftSprint(id);
                setLeftOverride(null);
                setSelectedKey(null);
                onSprintChange?.("left", id);
              }}
              activeDragId={activeDragId}
              dragOverId={dragOverId}
              onTitleChange={handleTitleChange}
              editingTitleKey={editingTitleKey}
              onEditingTitleKeyChange={setEditingTitleKey}
              readinessMap={readinessMap}
              onReadinessChange={handleReadinessChange}
              onBusinessValueChange={handleBusinessValueChange}
              onStoryPointsChange={handleStoryPointsChange}
              onJiraStatusChange={handleJiraStatusChange}
              onIssueTypeChange={handleIssueTypeChange}
              visibleTags={visibleTags}
              paneFlex={splitRatio}
              refinementSessionMap={ticketSessionMap}
            />
            <PaneDivider
              splitContainerRef={splitContainerRef}
              onRatioChange={(r) => { setSplitRatio(r); saveSplitRatio(r); }}
            />
            <DroppableSprintColumn
              columnId="right"
              sprintId={rightSprint}
              tickets={rightTickets}
              checkedKeys={checkedKeys}
              selectedKey={selectedKey}
              syncing={rightSyncing}
              onRefresh={handleRefreshRight}
              onToggleCheck={toggleCheck}
              onSelect={setSelectedKey}
              someChecked={rightSomeChecked}
              sprints={sprints}
              backlogCount={backlogCount}
              onChangeSprint={(id) => {
                setRightSprint(id);
                setRightOverride(null);
                setSelectedKey(null);
                onSprintChange?.("right", id);
              }}
              activeDragId={activeDragId}
              dragOverId={dragOverId}
              onTitleChange={handleTitleChange}
              editingTitleKey={editingTitleKey}
              onEditingTitleKeyChange={setEditingTitleKey}
              readinessMap={readinessMap}
              onReadinessChange={handleReadinessChange}
              onBusinessValueChange={handleBusinessValueChange}
              onStoryPointsChange={handleStoryPointsChange}
              onJiraStatusChange={handleJiraStatusChange}
              onIssueTypeChange={handleIssueTypeChange}
              visibleTags={visibleTags}
              paneFlex={1 - splitRatio}
              refinementSessionMap={ticketSessionMap}
            />
          </div>

          {selectedTicket && (
            <div className="sticky top-0 min-h-full shrink-0 self-stretch overflow-y-auto border-l border-border-default">
              <SidePanel
                ticket={selectedTicket}
                poStatus={poStatuses[selectedTicket.key] ?? selectedTicket.poStatus}
                onPoStatusChange={handlePoStatusChange}
                onNotesChange={() => {}}
                onClose={() => setSelectedKey(null)}
                onShowToast={showToast}
              />
            </div>
          )}
        </div>

        {someBothChecked && (
          <BulkActionBar
            count={totalChecked}
            totalCount={totalItems}
            selectedPoints={totalSelectedPoints}
            allChecked={allBothChecked}
            onToggleAll={toggleAll}
            onClear={() => setCheckedKeys(new Set())}
            onCopyToClipboard={handleCopyToClipboard}
          />
        )}

        <Toast toast={toast} loading={toastLoading} onDismiss={dismissToast} />
      </div>

      <DragOverlay>
        {activeDragTicket &&
          (() => {
            const isInLeft = leftTickets.some((t) => t.key === activeDragTicket.key);
            const sourceTickets = isInLeft ? leftTickets : rightTickets;
            const sameColumnChecked = checkedKeys.has(activeDragTicket.key)
              ? [...checkedKeys].filter((k) => sourceTickets.some((t) => t.key === k))
              : [];
            const extraCount = sameColumnChecked.length > 1 ? sameColumnChecked.length - 1 : 0;
            return (
              <div
                className="rounded-md border border-[var(--color-brand-500)]/20 bg-surface-elevated px-3 py-2 shadow-lg"
                style={{ opacity: 0.95 }}
              >
                <div className="flex items-center gap-2">
                  <IssueTypeIcon type={activeDragTicket.type} size={13} />
                  <span className="font-mono text-body-sm text-text-tertiary">{activeDragTicket.key}</span>
                  <span className="max-w-48 truncate text-body-sm text-text-secondary">{activeDragTicket.title}</span>
                  {extraCount > 0 && (
                    <span className="ml-1 rounded-full bg-[var(--color-brand-500)]/20 px-1.5 py-0.5 text-caption text-[var(--color-brand-400)]">
                      +{extraCount} more
                    </span>
                  )}
                </div>
              </div>
            );
          })()}
      </DragOverlay>
    </DndContext>
  );
}
