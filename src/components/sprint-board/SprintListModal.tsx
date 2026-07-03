"use client";

// Thin shell around the shared SprintListBody (BRDG-362): owns the popover frame
// (portal/absolute positioning, outside click, entry animation) and the data-layer
// actions (sync, hidden toggle, stakeholder navigation); every list behavior lives
// in the body so the modal, the pickers and the move flyout stay identical.

import { useRef, useCallback, useMemo } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import { SprintListBody } from "@/components/shared/SprintListBody";
import type { SprintListEntry } from "@/lib/sprint-list";
import { apiFetch, ApiError } from "@/lib/api-client";
import { extractTeamPrefix } from "@/lib/sprint-utils";

export function SprintListModal({
  onClose,
  onSelect,
  onPin,
  pinnedIds,
  alignLeft,
  portalAnchor,
  multiSelect,
  selectedIds,
  onToggleSelect,
}: {
  onClose: () => void;
  onSelect: (sprintId: string, sprintName: string) => void;
  onPin: (sprintId: string) => void;
  pinnedIds: Set<string>;
  alignLeft?: boolean;
  portalAnchor?: { top: number; left?: number; right?: number };
  /** Multi-select mode: show checkboxes, stay open on toggle */
  multiSelect?: boolean;
  /** Currently selected sprint IDs (multi-select mode) */
  selectedIds?: Set<string>;
  /** Toggle a sprint in/out of selection (multi-select mode) */
  onToggleSelect?: (sprintId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { sprints, backlogCount, mutate } = useJiraSprints();

  const allSprints = useMemo(() => sprints ?? [], [sprints]);

  useOutsideClick(ref, onClose);

  const handleToggleHidden = useCallback(async (sprintId: string, currentlyHidden: boolean) => {
    const id = Number(sprintId);
    const currentHiddenIds = allSprints.filter((s) => s.hidden).map((s) => s.id);
    let newHiddenIds: number[];
    if (currentlyHidden) {
      newHiddenIds = currentHiddenIds.filter((existing) => existing !== id);
    } else {
      newHiddenIds = [...currentHiddenIds, id];
      // Hiding a pinned sprint also unpins it, so no invisible tab lingers.
      if (pinnedIds.has(sprintId)) onPin(sprintId);
    }
    await apiFetch("/api/jira/sprints", { method: "PUT", body: { hiddenIds: newHiddenIds } });
    await mutate();
  }, [allSprints, pinnedIds, onPin, mutate]);

  const handleSync = useCallback(async () => {
    try {
      await Promise.all([
        apiFetch("/api/jira/sync-sprints?scope=sprints", { method: "POST" }),
        apiFetch("/api/jira/sync-sprints?scope=history", { method: "POST" }),
        // Minimum spinner time so a fast sync still reads as an action.
        new Promise((r) => setTimeout(r, 600)),
      ]);
      await mutate();
    } catch (err) {
      if (err instanceof ApiError) {
        throw new Error(err.body?.error || `Sync failed (${err.status})`);
      }
      throw err instanceof Error ? err : new Error("Network error");
    }
  }, [mutate]);

  const goToStakeholder = useCallback((sprint: SprintListEntry) => {
    const team = extractTeamPrefix(sprint.name) ?? "";
    router.push(`/stakeholder?team=${team}&sprintId=${sprint.id}`);
    onClose();
  }, [router, onClose]);

  const content = (
    <div
      ref={ref}
      className={portalAnchor ? "fixed z-popover w-96 rounded-lg border border-border-strong bg-surface-floating" : `absolute top-full z-dropdown mt-1.5 w-96 rounded-lg border border-border-strong bg-surface-floating shadow-popover ${alignLeft ? "left-0" : "right-0"}`}
      style={portalAnchor ? {
        top: portalAnchor.top,
        left: portalAnchor.left,
        right: portalAnchor.right,
        boxShadow: "0 4px 24px rgba(0,0,0,0.22), 0 1px 6px rgba(0,0,0,0.12)",
        animation: "sprintListIn 0.15s ease-out",
      } : { animation: "sprintListIn 0.15s ease-out" }}
    >
      <SprintListBody
        sprints={allSprints}
        variant="manage"
        onSelect={onSelect}
        onClose={onClose}
        backlogCount={backlogCount}
        pinnedIds={pinnedIds}
        onPin={onPin}
        onToggleHidden={handleToggleHidden}
        onStakeholder={goToStakeholder}
        onSync={handleSync}
        multiSelect={multiSelect}
        selectedIds={selectedIds}
        onToggleSelect={onToggleSelect}
      />

      <style>{`
        @keyframes sprintListIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );

  return portalAnchor ? createPortal(content, document.body) : content;
}
