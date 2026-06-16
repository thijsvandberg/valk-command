"use client";

import type { Sprint } from "@/types/ticket";
import { ArrowRight } from "lucide-react";
import {
  useDroppable,
  pointerWithin,
  closestCenter,
  type CollisionDetection,
  type Modifier,
} from "@dnd-kit/core";
import { dropTargetClasses, dropTargetStyle } from "@/components/shared/dropZone";

// Sprint drop zone shown when a ticket is being dragged
export function SprintDropTile({
  sprintId,
  sprint,
}: {
  sprintId: string;
  sprint: Sprint;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `sprint-slot:${sprintId}`,
    data: { type: "sprint-slot", sprintId },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex h-7 shrink-0 items-center gap-1.5 self-center rounded-md border px-2.5 text-body-sm font-medium ${dropTargetClasses(isOver)}`}
      style={dropTargetStyle(isOver)}
    >
      <span className="truncate">{sprint.name}</span>
      <ArrowRight size={11} strokeWidth={2} className="shrink-0" style={{ opacity: isOver ? 1 : 0.35, transition: "opacity 160ms ease" }} />
    </div>
  );
}

// The current view rendered as a plain, inert pill (never a drop target — you
// can't move a ticket to where it already is). No leading sprint icon during a
// drag: only the active dot + underline mark it, keeping the drop bar uncluttered.
function PlainTab({ sprint, label }: { sprint: Sprint; label?: string }) {
  return (
    <span className="relative flex h-7 shrink-0 items-center gap-1.5 self-center px-2.5 text-body-sm font-medium text-text-primary">
      {label ?? sprint.name}
      {sprint.state === "active" && (
        <span className="h-[7px] w-[7px] rounded-full bg-[var(--color-brand-400)]" style={{ boxShadow: "0 0 8px var(--color-brand-glow)" }} />
      )}
      <span className="absolute inset-x-2.5 bottom-0 h-[2px] rounded-full bg-[var(--color-brand-400)]" />
    </span>
  );
}

// Drag overlay (BRDG-336). Sits over the sprint tab bar during a ticket drag and
// KEEPS the bar's regular chrome — the same toolbar surface and leading "All"
// pill — rather than reskinning the whole strip. Only the drop tiles take the
// brand drop styling. Targets are the pinned sprints plus a Backlog tile in the
// "Backlogs" control's slot; the active view stays a plain pill. No other sprints
// are added.
export function SprintDropZoneBar({
  sprints,
  pillSlotSprints,
  activeSprintId,
  allActive,
  backlogTargetName,
}: {
  sprints: Sprint[];
  /** Pinned SPRINT pills only — backlogs and saved views (e.g. "Overall
   *  refinement") are already pulled out, so they never become drop targets.
   *  The Backlog target is provided separately below. */
  pillSlotSprints: string[];
  activeSprintId: string;
  allActive: boolean;
  /** The per-account "default backlog" sprint NAME (BRDG-346). The leading
   *  drop tile targets the live sprint with this name — a real team-backlog
   *  SPRINT (numeric Jira id), so dropping ASSIGNS that sprint rather than
   *  stripping the sprint via "__backlog__". */
  backlogTargetName: string;
}) {
  // Resolve strictly by the configured name and never fall back to the generic
  // "__backlog__" target: if the configured backlog is absent from the live
  // list, the tile is hidden (guarded below) rather than silently dropping into
  // the wrong, project-wide backlog.
  const backlogSprint = sprints.find((s) => s.name === backlogTargetName);
  const pinned = pillSlotSprints.filter((id) => id !== backlogSprint?.id);
  return (
    <div className="absolute inset-0 z-10 flex items-center px-4">
      {/* Mirrors the SprintSlots "All" pill so the leading chrome is unchanged. */}
      <span
        className={`mr-2 flex h-7 shrink-0 items-center self-center rounded-md px-2.5 text-body-sm font-semibold tracking-wide ${allActive ? "text-[var(--color-brand-600)]" : "text-[var(--color-brand-500)]"}`}
        style={{ backgroundColor: allActive ? "color-mix(in srgb, var(--color-brand-400) 18%, transparent)" : "color-mix(in srgb, var(--color-brand-400) 12%, transparent)" }}
      >
        All
      </span>
      {/* Backlog target leads the drop tiles (in the old "Backlogs" control's
          place) and shares their gap, so there is no extra margin before the
          first sprint. */}
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto xl:gap-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {backlogSprint && (activeSprintId === backlogSprint.id
          ? <PlainTab sprint={backlogSprint} />
          : <SprintDropTile sprintId={backlogSprint.id} sprint={backlogSprint} />)}
        {pinned.map((sprintId) => {
          const sprint = sprints.find((s) => s.id === sprintId);
          if (!sprint) return null;
          return sprintId === activeSprintId
            ? <PlainTab key={sprintId} sprint={sprint} />
            : <SprintDropTile key={sprintId} sprintId={sprintId} sprint={sprint} />;
        })}
      </div>
    </div>
  );
}

// Position the drag ghost 8px to the right/below the cursor
export const snapToPointer: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (activatorEvent && draggingNodeRect) {
    const e = activatorEvent as PointerEvent | MouseEvent;
    if (typeof e.clientX !== "number") return transform;
    return {
      ...transform,
      x: transform.x + e.clientX - draggingNodeRect.left + 8,
      y: transform.y + e.clientY - draggingNodeRect.top + 8,
    };
  }
  return transform;
};

// sprint-slot and group-zone droppables only activate when the pointer is physically inside
// them (pointerWithin). They are excluded from closestCenter so they don't activate just
// because they are geometrically close to the cursor.
export const boardCollisionDetection: CollisionDetection = (args) => {
  const pointerContainers = args.droppableContainers.filter((c) =>
    String(c.id).startsWith("sprint-slot:") || String(c.id).startsWith("group-zone:")
  );
  if (pointerContainers.length > 0) {
    const pointerHits = pointerWithin({
      ...args,
      droppableContainers: pointerContainers,
    });
    if (pointerHits.length > 0) return pointerHits;
  }
  const ticketContainers = args.droppableContainers.filter(
    (c) => !String(c.id).startsWith("sprint-slot:") && !String(c.id).startsWith("group-zone:")
  );
  return closestCenter({ ...args, droppableContainers: ticketContainers });
};
