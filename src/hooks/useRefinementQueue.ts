import { useState, useCallback, useMemo, useRef } from "react";
import {
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { refinementSessions as refinementSessionsApi, type RefinementSessionResponse } from "@/lib/api-client";
import { MAX_TICKETS } from "@/components/refinement-session/refinement-utils";
import type { Ticket } from "@/types/ticket";
import type { KeyedMutator } from "swr";

export function useRefinementQueue(opts: {
  resolvedSessionId: string | null;
  activeSession: RefinementSessionResponse | null;
  mutateSessions: KeyedMutator<RefinementSessionResponse[]>;
  availableTickets: Ticket[];
  allTickets: Ticket[] | undefined;
}) {
  const { resolvedSessionId, activeSession, mutateSessions, availableTickets, allTickets } = opts;

  const [localQueue, setLocalQueue] = useState<string[]>([]);

  const queue = useMemo(
    () => activeSession ? activeSession.ticketKeys : localQueue,
    [activeSession, localQueue],
  );

  // Selected tickets float to the top of the list (keeping their relative order),
  // followed by the rest in their existing order. This is the order actually
  // rendered, so the shift-range selection below slices the same array to stay
  // aligned with the on-screen row indices.
  const orderedTickets = useMemo(() => {
    const queueSet = new Set(queue);
    const selected: Ticket[] = [];
    const rest: Ticket[] = [];
    for (const t of availableTickets) {
      (queueSet.has(t.key) ? selected : rest).push(t);
    }
    return [...selected, ...rest];
  }, [availableTickets, queue]);

  const lastClickedIndexRef = useRef<number | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistSessionQueue = useCallback(
    (sessionId: string, newKeys: string[]) => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(async () => {
        await refinementSessionsApi.update(sessionId, { ticketKeys: newKeys });
        await mutateSessions();
      }, 400);
    },
    [mutateSessions],
  );

  const updateQueue = useCallback(
    (newKeys: string[]) => {
      if (resolvedSessionId && activeSession) {
        mutateSessions(
          (prev) =>
            prev?.map((s) =>
              s.id === resolvedSessionId
                ? { ...s, ticketKeys: newKeys, ticketCount: newKeys.length }
                : s,
            ),
          false,
        );
        persistSessionQueue(resolvedSessionId, newKeys);
      } else {
        setLocalQueue(newKeys);
      }
    },
    [resolvedSessionId, activeSession, mutateSessions, persistSessionQueue],
  );

  const toggleTicket = useCallback(
    (key: string, index: number, shiftKey: boolean) => {
      if (shiftKey && lastClickedIndexRef.current !== null) {
        const from = Math.min(lastClickedIndexRef.current, index);
        const to = Math.max(lastClickedIndexRef.current, index);
        const rangeKeys = orderedTickets.slice(from, to + 1).map((t) => t.key);
        const merged = Array.from(new Set([...queue, ...rangeKeys]));
        updateQueue(merged);
        lastClickedIndexRef.current = index;
        return;
      }

      lastClickedIndexRef.current = index;
      if (queue.includes(key)) {
        updateQueue(queue.filter((k) => k !== key));
      } else {
        if (queue.length >= MAX_TICKETS) return;
        updateQueue([...queue, key]);
      }
    },
    [orderedTickets, queue, updateQueue],
  );

  const handleToggleReadyToRefine = useCallback(() => {
    const readyKeys = availableTickets
      .filter((t) => t.readiness === "ready_to_refine")
      .map((t) => t.key);
    if (readyKeys.length === 0) return;

    const allSelected = readyKeys.every((k) => queue.includes(k));

    if (allSelected) {
      const readySet = new Set(readyKeys);
      updateQueue(queue.filter((k) => !readySet.has(k)));
    } else {
      const merged = Array.from(new Set([...queue, ...readyKeys]));
      updateQueue(merged);
    }
  }, [availableTickets, queue, updateQueue]);

  const removeFromQueue = useCallback(
    (key: string) => {
      updateQueue(queue.filter((k) => k !== key));
    },
    [queue, updateQueue],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = queue.indexOf(active.id as string);
      const newIndex = queue.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;
      updateQueue(arrayMove(queue, oldIndex, newIndex));
    },
    [queue, updateQueue],
  );

  const allTicketMap = useMemo(() => {
    const map = new Map<string, Ticket>();
    for (const t of allTickets ?? []) map.set(t.key, t);
    return map;
  }, [allTickets]);

  const queueTickets = useMemo(
    () => queue.map((key) => allTicketMap.get(key)).filter(Boolean) as Ticket[],
    [queue, allTicketMap],
  );

  const readyKeys = useMemo(
    () => availableTickets.filter((t) => t.readiness === "ready_to_refine").map((t) => t.key),
    [availableTickets],
  );
  const readyCount = readyKeys.length;
  const allReadySelected = readyCount > 0 && readyKeys.every((k) => queue.includes(k));

  const flushPersistTimer = useCallback(() => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
  }, []);

  return {
    queue,
    orderedTickets,
    queueTickets,
    allTicketMap,
    toggleTicket,
    handleToggleReadyToRefine,
    removeFromQueue,
    updateQueue,
    sensors,
    handleDragEnd,
    localQueue,
    setLocalQueue,
    flushPersistTimer,
    readyCount,
    allReadySelected,
  };
}
