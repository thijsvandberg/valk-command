"use client";

// Sprint switcher dropdown (slot editing + multi-sprint pane switching): a thin
// anchored shell around the shared SprintListBody (BRDG-362) so switching,
// searching and team filtering look and behave like the sprint list modal.

import { useRef } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import type { Sprint } from "@/types/ticket";
import { SprintListBody } from "@/components/shared/SprintListBody";

export const BACKLOG_SPRINT_ID = "__backlog__";

export function SprintSelector({
  sprints,
  backlogCount = 0,
  onSelect,
  onClose,
}: {
  sprints: Sprint[];
  backlogCount?: number;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useOutsideClick(ref, onClose);

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 z-dropdown mt-1.5 w-72 rounded-lg border border-border-strong bg-surface-floating shadow-lg"
    >
      <SprintListBody
        sprints={sprints}
        variant="manage"
        backlogCount={backlogCount}
        onSelect={(sprintId) => onSelect(sprintId)}
        onClose={onClose}
        listMaxHeightClass="max-h-64"
      />
    </div>
  );
}
