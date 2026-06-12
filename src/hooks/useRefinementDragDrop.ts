"use client";

import { useState, useCallback, useMemo } from "react";
import {
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { RefinementSessionResponse } from "@/lib/api-client";

export const SESSION_DROP_PREFIX = "session-drop:";
export const PLAN_SESSION_DROP_ID = "plan-session-drop";
/** Sentinel "session id" shown in the drag ghost hint while hovering Plan session. */
export const NEW_SESSION_HINT_ID = "__new-session__";

export function ticketDragId(source: "list" | "panel", ticketKey: string) {
  return `ticket-drag:${source}:${ticketKey}`;
}

// Drop targets are zone-style (session chips, Plan session button), so they only
// activate when the pointer is physically inside them. rectIntersection is the
// fallback for keyboard-driven drags, which have no pointer coordinates.
const refinementCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) return pointerHits;
  return rectIntersection(args);
};

interface UseRefinementDragDropOpts {
  sessions: RefinementSessionResponse[];
  /** Move the ticket into the target session (and out of its current one). */
  onMove: (ticketKey: string, targetSessionId: string) => void;
  /** Create a new session containing the ticket (drop on "Plan session"). */
  onCreateFromTicket: (ticketKey: string) => void;
  /** The ticket is already in the target session: surface subtle feedback. */
  onAlreadyInSession: (ticketKey: string, session: RefinementSessionResponse) => void;
}

/**
 * Overview-level drag-and-drop for BRDG-336: drag a ticket (from the select
 * list or the open side panel) onto a session chip or the "Plan session"
 * button. Lives in its own DndContext, deliberately separate from the queue's
 * sortable context so the two can never conflict.
 */
export function useRefinementDragDrop({
  sessions,
  onMove,
  onCreateFromTicket,
  onAlreadyInSession,
}: UseRefinementDragDropOpts) {
  const [activeDragKey, setActiveDragKey] = useState<string | null>(null);
  const [overDropId, setOverDropId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const ticketKey = event.active.data.current?.ticketKey as string | undefined;
    setActiveDragKey(ticketKey ?? null);
    setOverDropId(null);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setOverDropId(event.over ? String(event.over.id) : null);
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveDragKey(null);
    setOverDropId(null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDragKey(null);
      setOverDropId(null);

      const ticketKey = active.data.current?.ticketKey as string | undefined;
      if (!ticketKey || !over) return;

      const overId = String(over.id);

      if (overId === PLAN_SESSION_DROP_ID) {
        onCreateFromTicket(ticketKey);
        return;
      }

      if (overId.startsWith(SESSION_DROP_PREFIX)) {
        const targetSessionId = overId.slice(SESSION_DROP_PREFIX.length);
        const target = sessions.find((s) => s.id === targetSessionId);
        if (!target || target.status === "completed") return;
        if (target.ticketKeys.includes(ticketKey)) {
          onAlreadyInSession(ticketKey, target);
          return;
        }
        onMove(ticketKey, targetSessionId);
      }
    },
    [sessions, onMove, onCreateFromTicket, onAlreadyInSession],
  );

  // Session id under the cursor, fed to the drag ghost's "Move to ..." hint.
  const overSessionId = useMemo(() => {
    if (!overDropId) return null;
    if (overDropId === PLAN_SESSION_DROP_ID) return NEW_SESSION_HINT_ID;
    if (overDropId.startsWith(SESSION_DROP_PREFIX)) return overDropId.slice(SESSION_DROP_PREFIX.length);
    return null;
  }, [overDropId]);

  return {
    sensors,
    collisionDetection: refinementCollisionDetection,
    activeDragKey,
    isDragActive: activeDragKey !== null,
    overSessionId,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  };
}
