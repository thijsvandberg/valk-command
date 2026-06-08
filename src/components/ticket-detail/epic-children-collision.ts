import { closestCenter, pointerWithin, type CollisionDetection } from "@dnd-kit/core";

/**
 * Collision detection for the epic-children by-sprint drag-and-drop.
 *
 * Rows (data.type === "child") are the primary drop targets, resolved with
 * closestCenter so the nearest row always wins even when the cursor is in the gap
 * between rows or at a card edge. This is what keeps the drag smooth: pointerWithin
 * would drop the target in those gaps and force the user to wiggle to re-acquire it.
 * Group cards (data.type === "group") are only a fallback for a group that has no
 * draggable rows.
 *
 * Exception (BRDG-306/309): the synthetic drop zones (next-sprint move, create, and
 * backlog zones) are empty group cards with no rows of their own. Under closestCenter
 * the always-present child rows would always out-compete them, so they could never be
 * dropped on. When the pointer is actually within such a zone, it wins outright - the
 * user is unambiguously over that target.
 */
export const epicChildrenCollisionDetection: CollisionDetection = (args) => {
  const dropZoneHit = pointerWithin(args).find(
    (c) => args.droppableContainers.find((d) => d.id === c.id)?.data.current?.isDropZone,
  );
  if (dropZoneHit) return [dropZoneHit];

  const rowContainers = args.droppableContainers.filter((c) => c.data.current?.type === "child");
  if (rowContainers.length > 0) {
    const hits = closestCenter({ ...args, droppableContainers: rowContainers });
    if (hits.length > 0) return hits;
  }
  const groupContainers = args.droppableContainers.filter((c) => c.data.current?.type === "group");
  return closestCenter({ ...args, droppableContainers: groupContainers });
};
