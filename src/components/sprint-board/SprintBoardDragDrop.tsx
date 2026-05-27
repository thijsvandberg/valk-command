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
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-body-sm font-medium transition-colors duration-100 ${
        isOver
          ? "border-[var(--color-brand-500)]/50 bg-[var(--color-brand-500)]/12 text-[var(--color-brand-300)]"
          : "border-border-default bg-overlay-subtle text-text-tertiary hover:border-border-strong hover:text-text-secondary"
      }`}
    >
      <ArrowRight size={10} strokeWidth={1.5} className="shrink-0 opacity-50" />
      <span className="truncate">{sprint.name}</span>
    </div>
  );
}

// Overlay that covers the sprint tab bar during a drag
export function SprintDropZoneBar({
  sprints,
  slotSprints,
  activeSprintId,
}: {
  sprints: Sprint[];
  slotSprints: string[];
  activeSprintId: string;
}) {
  const targets = slotSprints.filter((id) => id !== activeSprintId);
  const showBacklog = activeSprintId !== "__backlog__" && !targets.includes("__backlog__");
  const backlogSprint = showBacklog ? sprints.find((s) => s.id === "__backlog__") : null;
  return (
    <div className="absolute inset-0 z-10 flex items-center gap-2 bg-[var(--color-surface-elevated)] px-5">
      <span className="shrink-0 text-caption font-medium uppercase tracking-widest text-text-muted">
        Move to
      </span>
      <span className="h-3 w-px shrink-0 bg-overlay-default" />
      {targets.map((sprintId) => {
        const sprint = sprints.find((s) => s.id === sprintId);
        if (!sprint) return null;
        return (
          <SprintDropTile
            key={sprintId}
            sprintId={sprintId}
            sprint={sprint}
          />
        );
      })}
      {backlogSprint && (
        <SprintDropTile
          key="__backlog__"
          sprintId="__backlog__"
          sprint={backlogSprint}
        />
      )}
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
