"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import type { TicketReadiness, JiraStatus, Sprint } from "@/types/ticket";
import type { QuickMoveOption } from "@/lib/quick-moves";
import { Flag, ArrowDownToLine, ArrowUpToLine, Boxes, Check, FilePen, Sparkles, ArrowRightLeft, Bookmark } from "lucide-react";
import { MenuItem } from "@/components/shared/MenuItem";
import { EpicPickerBody, type EpicOption } from "@/components/shared/EpicPicker";
import { Flyout, QUICK_MOVE_ICON } from "@/components/sprint-board/ticket-action-menu-portals";
import {
  StatusSubPanel,
  ReadinessSubPanel,
  SprintSubPanel,
  AssigneeSubPanel,
  LabelSubPanel,
} from "@/components/sprint-board/ticket-action-menu-sub-panels";

// Re-export the portal menus + shared MenuItem so existing consumers keep importing
// them from here after the BRDG-415 split.
export { AnchoredMenu, CursorMenu } from "@/components/sprint-board/ticket-action-menu-portals";
export { MenuItem };

// ---------------------------------------------------------------------------
// Shared menu content: the Update sub-view state machine plus optional
// direct-action items (flag, AI assist, refine). Rendered both inside the
// toolbar's anchored Update dropdown and the row right-click context menu.
// Each item only renders when its corresponding callback is supplied.
// ---------------------------------------------------------------------------

// The root "menu" is the full right-click menu; "update"/"move"/"flag"/"assist" are the
// group views the bar opens directly via `initialView`. Deeper pickers are hover flyouts.
type MenuView = "menu" | "update" | "move" | "flag" | "bookmark" | "assist";

/** Aggregate flag state of the targeted tickets, used to pick which flag item to show. */
export type FlagState = "flagged" | "unflagged" | "mixed";

/** Aggregate bookmark state of the targeted tickets, used to pick which item to show. */
export type BookmarkState = "bookmarked" | "unbookmarked" | "mixed";

export function TicketActionMenuContent({
  onSetStatus,
  onSetReadiness,
  onSetEpic,
  onMoveSprint,
  onMoveToTop,
  onMoveToBottom,
  quickMoves,
  onQuickMove,
  onUpdateAssignee,
  onUpdateLabel,
  onSetFlagged,
  flagState,
  onSetBookmarked,
  bookmarkState,
  onReviewStory,
  onGenerateSubtasks,
  onGenerateTestDoc,
  onRefine,
  refinements,
  onAddToRefinement,
  onMarkRead,
  epicValue,
  epicSuggestTicketKey,
  epicClearable,
  sprints,
  pinnedSprintIds,
  currentSprintIds,
  initialView = "menu",
  close,
}: {
  onSetStatus?: (status: JiraStatus) => void;
  onSetReadiness?: (readiness: TicketReadiness | null) => void;
  onSetEpic?: (epicKey: string | null, epicName: string | null) => void;
  /** The single target's current epic, so the Set Epic panel shows the checkmark
   *  + View/Unlink actions exactly like the sidebar (null for multi-select). */
  epicValue?: EpicOption | null;
  /** When exactly one ticket is targeted, its key enables the AI suggest-epic
   *  action in the Set Epic panel (single-ticket only, like the sidebar). */
  epicSuggestTicketKey?: string;
  /** Multi-select only: show a single "Remove epic" action (no single value to
   *  unlink). Omitted for single-row, which unlinks via its current epic. */
  epicClearable?: boolean;
  /** `position` comes from the move panel's explicit top/bottom buttons (BRDG-362);
   *  undefined on a plain destination click (BRDG-370 placement rule applies). */
  onMoveSprint?: (sprintId: string, position?: "top" | "bottom") => void;
  /** Rank the target(s) to the top/bottom of the current sprint (whole sprint). */
  onMoveToTop?: () => void;
  onMoveToBottom?: () => void;
  /** One-click move destinations shown above "Move to Sprint" (BRDG-369). */
  quickMoves?: QuickMoveOption[];
  onQuickMove?: (opt: QuickMoveOption) => void;
  onUpdateAssignee?: (accountId: string | null, name: string | null, avatar: string | null) => void;
  onUpdateLabel?: (labels: string[], mode: "add" | "set") => void;
  /** When supplied, renders Flag / Remove flag items. `true` flags, `false` unflags. */
  onSetFlagged?: (flagged: boolean) => void;
  flagState?: FlagState;
  /** When supplied, renders Bookmark / Remove bookmark items (BRDG-355). */
  onSetBookmarked?: (bookmarked: boolean) => void;
  bookmarkState?: BookmarkState;
  onReviewStory?: () => void;
  onGenerateSubtasks?: () => void;
  /** Opens the stakeholder test-doc generate + validate flow (BRDG-426). */
  onGenerateTestDoc?: () => void;
  /** "New refinement…": opens the create-session modal. */
  onRefine?: () => void;
  /** Scheduled refinement sessions; when present, "Add to refinement" becomes a list
   *  of sessions + "New refinement…" (BRDG-374). */
  refinements?: { id: string; name: string; count?: number }[];
  onAddToRefinement?: (sessionId: string) => void;
  /** New story inbox (BRDG-373): renders a leading "Mark as read" item. Omitted on
   *  the board / epic children, whose menu is unchanged. */
  onMarkRead?: () => void;
  sprints?: Sprint[];
  pinnedSprintIds?: string[];
  /** The selection's current sprint id(s), excluded from "More sprints". Pass the one
   *  shared sprint when every target sits in it; empty when the selection is mixed. */
  currentSprintIds?: string[];
  /** Open straight into a group view (used by the bar's per-group icon dropdowns). */
  initialView?: MenuView;
  close: () => void;
}) {
  const hasQuickMoves = Boolean(onQuickMove && quickMoves && quickMoves.length > 0);
  // "More sprints" drops what is already reachable one level up: the active / next /
  // named-backlog quick-moves, plus the selection's current sprint (BRDG-374).
  const excludeSprintIds = useMemo(() => {
    const ids = new Set<string>(currentSprintIds ?? []);
    for (const q of quickMoves ?? []) if (q.targetSprintId) ids.add(q.targetSprintId);
    return ids;
  }, [quickMoves, currentSprintIds]);
  const hasMove = hasQuickMoves || (onMoveSprint && sprints) || onMoveToTop || onMoveToBottom;
  const hasUpdate = onSetStatus || onSetReadiness || onSetEpic || onUpdateAssignee || onUpdateLabel;
  const hasAssist = onReviewStory || onGenerateSubtasks || onGenerateTestDoc;
  const showFlag = Boolean(onSetFlagged);
  const showFlagItem = flagState !== "flagged"; // show "Flag" unless every target is already flagged
  const showUnflagItem = flagState !== "unflagged"; // show "Remove flag" unless every target is unflagged
  const showBookmark = Boolean(onSetBookmarked);
  const showBookmarkItem = bookmarkState !== "bookmarked"; // show "Bookmark" unless every target is already bookmarked
  const showRemoveBookmarkItem = bookmarkState !== "unbookmarked"; // show "Remove bookmark" unless none are bookmarked

  const divider = <div className="mx-2 my-1 h-px bg-overlay-strong" />;

  // Move group (BRDG-374): named quick-moves with a destination chip, the searchable
  // "More sprints" hover flyout, then the rank actions. Shared by the root menu (inline,
  // most-used) and the bar's Move dropdown (initialView="move").
  const moveItems = (
    <>
      {hasQuickMoves &&
        quickMoves!.map((opt) => (
          // Per-destination icon: active = dot, next = arrow-right, backlog = inbox.
          <MenuItem key={opt.id} icon={QUICK_MOVE_ICON[opt.id]} onClick={() => { onQuickMove!(opt); close(); }}>
            {opt.label}
            <span
              className="ml-auto shrink-0 rounded bg-overlay-default px-1.5 py-0.5 text-caption font-medium text-text-tertiary"
              title={opt.badge}
              aria-label={opt.badge ? `${opt.target} (${opt.badge})` : opt.target}
            >
              {opt.target}
            </span>
          </MenuItem>
        ))}
      {onMoveSprint && sprints && (
        <Flyout icon={<ArrowRightLeft className="h-3.5 w-3.5" strokeWidth={1.5} />} label="Move to other sprint…" width="w-[260px]">
          <SprintSubPanel sprints={sprints} pinnedSprintIds={pinnedSprintIds} excludeSprintIds={excludeSprintIds} onSelect={(id, position) => { onMoveSprint?.(id, position); close(); }} />
        </Flyout>
      )}
      {onMoveToTop && (
        <MenuItem icon={<ArrowUpToLine className="h-3.5 w-3.5" strokeWidth={1.5} />} onClick={() => { onMoveToTop(); close(); }}>
          Move to top
        </MenuItem>
      )}
      {onMoveToBottom && (
        <MenuItem icon={<ArrowDownToLine className="h-3.5 w-3.5" strokeWidth={1.5} />} onClick={() => { onMoveToBottom(); close(); }}>
          Move to bottom
        </MenuItem>
      )}
    </>
  );

  // Each set-field opens its picker in a hover flyout (no click/Back).
  const updateItems = (
    <>
      {onSetStatus && (
        <Flyout label="Set Status" width="w-[200px]">
          <StatusSubPanel onSelect={(s) => { onSetStatus?.(s); close(); }} />
        </Flyout>
      )}
      {onSetReadiness && (
        <Flyout label="Set Readiness" width="w-[220px]">
          <ReadinessSubPanel onSelect={(r) => { onSetReadiness?.(r); close(); }} />
        </Flyout>
      )}
      {onSetEpic && (
        <Flyout label="Set Epic" width="w-[300px]">
          <EpicPickerBody
            value={epicValue ?? null}
            ticketKey={epicSuggestTicketKey}
            clearable={epicClearable}
            onChange={(epic) => { onSetEpic?.(epic?.key ?? null, epic?.name ?? null); close(); }}
            onClose={close}
          />
        </Flyout>
      )}
      {onUpdateAssignee && (
        <Flyout label="Update Assignee" width="w-[240px]">
          <AssigneeSubPanel onSelect={(accountId, name, avatar) => { onUpdateAssignee?.(accountId, name, avatar); close(); }} />
        </Flyout>
      )}
      {onUpdateLabel && (
        <Flyout label="Add/Update Label" width="w-[240px]">
          <LabelSubPanel onSelect={(labels, mode) => { onUpdateLabel?.(labels, mode); close(); }} />
        </Flyout>
      )}
    </>
  );

  const flagItems = (
    <>
      {showFlagItem && (
        <MenuItem icon={<Flag className="h-3.5 w-3.5" strokeWidth={1.5} />} onClick={() => { onSetFlagged?.(true); close(); }}>
          Flag
        </MenuItem>
      )}
      {showUnflagItem && (
        <MenuItem
          icon={<Flag className="h-3.5 w-3.5 text-[var(--color-status-error)]" fill="var(--color-status-error)" strokeWidth={1.5} />}
          onClick={() => { onSetFlagged?.(false); close(); }}
        >
          Remove flag
        </MenuItem>
      )}
    </>
  );

  const bookmarkItems = (
    <>
      {showBookmarkItem && (
        <MenuItem icon={<Bookmark className="h-3.5 w-3.5" strokeWidth={1.5} />} onClick={() => { onSetBookmarked?.(true); close(); }}>
          Bookmark
        </MenuItem>
      )}
      {showRemoveBookmarkItem && (
        <MenuItem
          icon={<Bookmark className="h-3.5 w-3.5 text-[var(--meta-bv-fg)]" fill="var(--meta-bv-fg)" strokeWidth={1.5} />}
          onClick={() => { onSetBookmarked?.(false); close(); }}
        >
          Remove bookmark
        </MenuItem>
      )}
    </>
  );

  const assistItems = (
    <>
      {onReviewStory && <MenuItem onClick={() => { onReviewStory(); close(); }}>Review Story</MenuItem>}
      {onGenerateSubtasks && <MenuItem onClick={() => { onGenerateSubtasks(); close(); }}>Generate Subtasks</MenuItem>}
      {onGenerateTestDoc && <MenuItem onClick={() => { onGenerateTestDoc(); close(); }}>Generate test doc</MenuItem>}
    </>
  );

  // Bar dropdowns open straight into one group's items (no root menu, no Back).
  if (initialView === "update") return <>{updateItems}</>;
  if (initialView === "move") return <>{moveItems}</>;
  if (initialView === "flag") return <>{flagItems}</>;
  if (initialView === "bookmark") return <>{bookmarkItems}</>;
  if (initialView === "assist") return <>{assistItems}</>;

  // Root right-click menu, one divider between clusters: Triage · Move · (Flag + Update +
  // Assist) · Refinement. Update and Assist nest as hover flyouts.
  const updateGroup = hasUpdate ? (
    <Flyout icon={<FilePen className="h-3.5 w-3.5" strokeWidth={1.5} />} label="Update" width="w-[220px]" nested>
      {updateItems}
    </Flyout>
  ) : null;
  const assistGroup = hasAssist ? (
    <Flyout icon={<Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />} label="Assist" width="w-[200px]">
      {assistItems}
    </Flyout>
  ) : null;
  const hasRefineSessions = Boolean(refinements && refinements.length > 0 && onAddToRefinement);
  const refineItem = onRefine || hasRefineSessions ? (
    hasRefineSessions ? (
      <Flyout icon={<Boxes className="h-3.5 w-3.5" strokeWidth={1.5} />} label="Add to refinement" width="w-[240px]">
        {refinements!.map((r) => (
          <MenuItem key={r.id} onClick={() => { onAddToRefinement!(r.id); close(); }}>
            <span className="truncate">{r.name}</span>
            {r.count != null && (
              <span className="ml-auto shrink-0 rounded bg-overlay-default px-1.5 py-0.5 text-caption font-medium tabular-nums text-text-tertiary">
                {r.count}
              </span>
            )}
          </MenuItem>
        ))}
        {onRefine && (
          <>
            <div className="mx-2 my-1 h-px bg-overlay-strong" />
            <MenuItem onClick={() => { onRefine(); close(); }}>New refinement…</MenuItem>
          </>
        )}
      </Flyout>
    ) : (
      <MenuItem icon={<Boxes className="h-3.5 w-3.5" strokeWidth={1.5} />} onClick={() => { onRefine!(); close(); }}>
        Add to refinement
      </MenuItem>
    )
  ) : null;
  const blocks: (ReactNode | null)[] = [
    onMarkRead ? (
      <MenuItem icon={<Check className="h-3.5 w-3.5 text-[var(--color-brand-400)]" strokeWidth={2} />} onClick={() => { onMarkRead(); close(); }}>
        Mark as read
      </MenuItem>
    ) : null,
    hasMove ? moveItems : null,
    showBookmark || showFlag || hasUpdate || hasAssist ? (
      <>
        {showBookmark ? bookmarkItems : null}
        {showFlag ? flagItems : null}
        {updateGroup}
        {assistGroup}
      </>
    ) : null,
    refineItem,
  ];
  const present = blocks.filter((b) => b !== null);
  return <>{present.map((b, i) => <Fragment key={i}>{i > 0 && divider}{b}</Fragment>)}</>;
}
