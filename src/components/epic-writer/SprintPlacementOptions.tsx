"use client";

import { Loader2, Check } from "lucide-react";
import type { Sprint } from "@/types/ticket";

// The placement the PO chooses. "__backlog__" mirrors the move-sprint backlog
// marker; "__default__" resolves to the configured default sprint at promotion
// time; any other value is a concrete sprint id.
export const BACKLOG_PLACEMENT = "__backlog__";
export const DEFAULT_PLACEMENT = "__default__";

// Human label for a configured epic placement, used by the Actions menu row.
export function placementLabel(placement: string | null | undefined, sprints: Sprint[]): string {
  if (placement === BACKLOG_PLACEMENT) return "Backlog";
  if (placement === DEFAULT_PLACEMENT) return "Default sprint";
  if (placement) {
    const s = sprints.find((x) => x.id === placement);
    return s ? s.name : "A sprint";
  }
  return "Ask each time";
}

interface SprintPlacementOptionsProps {
  // "create" promotes a DRAFT card (offers the default-sprint option); "reassign"
  // moves an already-created card (no default-sprint option, marks the current
  // sprint); "setting" configures the epic default (marks the choice, offers a
  // reset).
  variant: "create" | "reassign" | "setting";
  sprints: Sprint[];
  defaultSprintId: string;
  loaded: boolean;
  onChoose: (placement: string) => void;
  // reassign: the card's current sprint id, so it can be marked.
  currentSprintId?: string | null;
  // setting: the epic's configured placement, so it can be marked.
  selectedPlacement?: string | null;
  // setting: reset to "ask each time". Offered only when a placement is set.
  onClear?: () => void;
}

const itemCls =
  "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-body-sm text-text-secondary cursor-pointer transition-colors duration-150 hover:bg-hover-list-item focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]";

const checkMark = <Check size={11} strokeWidth={2} className="shrink-0 text-[var(--color-brand-400)]" />;

/**
 * The shared placement option list (to be planned / default sprint / a concrete
 * sprint), rendered inside a menu. Presentational: the host loads the sprints +
 * default (via useSprintOptions) and owns the popover chrome; this only renders
 * the option rows so SprintPlacementMenu (card create/reassign) and the board
 * Actions menu (epic setting) show an identical list.
 */
export function SprintPlacementOptions({
  variant,
  sprints,
  defaultSprintId,
  loaded,
  onChoose,
  currentSprintId,
  selectedPlacement,
  onClear,
}: SprintPlacementOptionsProps) {
  const isReassign = variant === "reassign";
  const isSetting = variant === "setting";

  return (
    <>
      {/* Reset the epic setting so each card is asked again (setting variant only,
          once something is configured). */}
      {isSetting && onClear && selectedPlacement && (
        <>
          <button type="button" role="menuitem" onClick={onClear} className={itemCls}>
            Ask each time
            <span className="text-label text-text-muted">reset</span>
          </button>
          <div className="my-1 border-t border-border-subtle" />
        </>
      )}

      <button type="button" role="menuitem" onClick={() => onChoose(BACKLOG_PLACEMENT)} className={itemCls}>
        To be planned
        {isSetting && selectedPlacement === BACKLOG_PLACEMENT ? (
          checkMark
        ) : (
          <span className="text-label text-text-muted">backlog</span>
        )}
      </button>

      {/* The default-sprint option only makes sense when promoting a new card or
          configuring the epic default; reassigning moves to a concrete sprint. */}
      {!isReassign && (
        <button type="button" role="menuitem" onClick={() => onChoose(DEFAULT_PLACEMENT)} className={itemCls}>
          Default sprint
          {isSetting && selectedPlacement === DEFAULT_PLACEMENT ? (
            checkMark
          ) : !defaultSprintId && loaded ? (
            <span className="text-label text-text-muted">none set</span>
          ) : null}
        </button>
      )}

      {(sprints.length > 0 || !loaded) && <div className="my-1 border-t border-border-subtle" />}

      {!loaded ? (
        <div className="flex items-center gap-1.5 px-3 py-1.5 text-label text-text-muted">
          <Loader2 size={11} className="animate-spin" />
          Loading sprints…
        </div>
      ) : (
        sprints.map((s) => (
          <button key={s.id} type="button" role="menuitem" onClick={() => onChoose(s.id)} className={itemCls}>
            <span className="min-w-0 truncate">{s.name}</span>
            {(isReassign
              ? s.id === currentSprintId
              : isSetting
                ? s.id === selectedPlacement
                : s.state === "active") && checkMark}
          </button>
        ))
      )}
    </>
  );
}
