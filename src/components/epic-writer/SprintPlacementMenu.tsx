"use client";

import { useEffect, useRef, useState } from "react";
import { CloudUpload, ChevronDown, Loader2, ArrowLeftRight } from "lucide-react";
import { useSprintOptions } from "./useSprintOptions";
import { SprintPlacementOptions } from "./SprintPlacementOptions";

// Re-exported for callers that still import the markers from here.
export { BACKLOG_PLACEMENT, DEFAULT_PLACEMENT } from "./SprintPlacementOptions";

interface SprintPlacementMenuProps {
  // Fired with the chosen placement. On a "create" menu this is the Create-in-
  // Jira placement (a sprint id, backlog, or "__default__"); on a "reassign"
  // menu it is the new sprint for a card already live in Jira.
  onCreate: (placement: string) => void | Promise<unknown>;
  // True while the action is in flight, so the trigger shows a busy state.
  busy?: boolean;
  disabled?: boolean;
  // "create" promotes a DRAFT card (offers the default-sprint option); "reassign"
  // moves an already-created card (no default-sprint option, marks the current
  // sprint). Defaults to "create".
  variant?: "create" | "reassign";
  // The card's current sprint id when reassigning, so the menu can mark it.
  currentSprintId?: string | null;
  // Renders a bare chevron trigger instead of the full labelled button, for the
  // Create-in-Jira split button's one-off override (BRDG-500 #2). Uses the brand
  // create styling so it reads as the second segment of that split button.
  chevronOnly?: boolean;
}

/**
 * The Create-in-Jira trigger with a placement menu: a sprint, "to be planned"
 * (backlog), or the default sprint. The option list is the shared
 * SprintPlacementOptions; sprints + the default-sprint setting load lazily the
 * first time the menu opens. In the "reassign" variant the same picker moves a
 * card that is already live in Jira to a different sprint (or the backlog).
 */
export function SprintPlacementMenu({
  onCreate,
  busy,
  disabled,
  variant = "create",
  currentSprintId,
  chevronOnly,
}: SprintPlacementMenuProps) {
  const isReassign = variant === "reassign";
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { sprints, defaultSprintId, loaded } = useSprintOptions(open);

  // Close on outside click so the menu behaves like a normal dropdown.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const choose = (placement: string) => {
    setOpen(false);
    void onCreate(placement);
  };

  return (
    <div ref={containerRef} className="relative">
      {chevronOnly ? (
        /* Bare chevron for the Create-in-Jira split button's one-off override
           (BRDG-500 #2): reads as the second segment of the brand split button. */
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Create with a different placement for this story"
          title="Create in a different sprint or the backlog (this story only)"
          className="flex h-full items-center justify-center border-l border-[var(--color-brand-400)]/40 px-1.5 text-[var(--color-brand-400)] cursor-pointer transition-colors duration-150 hover:bg-[var(--color-brand-400)]/20 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronDown size={12} strokeWidth={2} />
        </button>
      ) : (
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className={
            isReassign
              ? "flex items-center gap-1 rounded-md border border-border-default bg-overlay-subtle px-2 py-0.5 text-label font-medium text-text-secondary cursor-pointer transition-colors duration-150 hover:bg-hover-list-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
              : "flex items-center gap-1 rounded-md border border-[var(--color-brand-400)]/40 bg-[var(--color-brand-400)]/10 px-2 py-0.5 text-label font-medium text-[var(--color-brand-400)] cursor-pointer transition-colors duration-150 hover:bg-[var(--color-brand-400)]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          }
          title={isReassign ? "Move this story to a different sprint" : "Create this story in Jira under the epic"}
        >
          {busy ? (
            <Loader2 size={11} strokeWidth={1.75} className="animate-spin" />
          ) : isReassign ? (
            <ArrowLeftRight size={11} strokeWidth={1.75} />
          ) : (
            <CloudUpload size={11} strokeWidth={1.75} />
          )}
          {isReassign ? "Move sprint" : "Create in Jira"}
          <ChevronDown size={10} strokeWidth={2} />
        </button>
      )}

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-border-default bg-surface-elevated py-1 shadow-popover"
        >
          <SprintPlacementOptions
            variant={variant}
            sprints={sprints}
            defaultSprintId={defaultSprintId}
            loaded={loaded}
            onChoose={choose}
            currentSprintId={currentSprintId}
          />
        </div>
      )}
    </div>
  );
}
