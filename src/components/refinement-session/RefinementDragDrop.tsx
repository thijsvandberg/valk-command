"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { ticketDragId, PLAN_SESSION_DROP_ID } from "@/hooks/useRefinementDragDrop";
import { dropTargetClasses, DROP_TARGET_TRANSITION } from "@/components/shared/dropZone";

/**
 * Per-item drag handle for BRDG-336. The handle (not the row or panel header)
 * is the only drag activator, so row clicks, checkboxes and the queue's own
 * sortable DnD are never affected.
 */
export function TicketDragHandle({
  ticketKey,
  source,
  className,
}: {
  ticketKey: string;
  source: "list" | "panel";
  className?: string;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: ticketDragId(source, ticketKey),
    data: { ticketKey },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      aria-label={`Drag ${ticketKey} to a refinement session`}
      title="Drag to a refinement session"
      className={
        className ??
        "flex h-full w-full cursor-grab items-center justify-center text-text-tertiary hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:cursor-grabbing"
      }
    >
      <GripVertical size={12} strokeWidth={1.5} />
    </button>
  );
}

/**
 * Makes the header "Plan session" button a drop target: dropping a ticket on
 * it creates a new session containing that ticket. The affordance appears the
 * moment a drag starts so the target is recognizable before hovering it.
 */
export function PlanSessionDropZone({
  isDragActive,
  children,
}: {
  isDragActive: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: PLAN_SESSION_DROP_ID });

  return (
    <div
      ref={setNodeRef}
      data-drop-active={isDragActive || undefined}
      data-drop-over={isOver || undefined}
      className={`rounded-lg border ${
        isDragActive
          ? isOver
            ? "border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/15"
            : dropTargetClasses(false)
          : "border-transparent"
      }`}
      style={{
        transition: DROP_TARGET_TRANSITION,
        ...(isDragActive && isOver ? { transform: "scale(1.03)", boxShadow: "0 6px 18px -6px var(--color-brand-glow)" } : {}),
      }}
    >
      {children}
    </div>
  );
}
