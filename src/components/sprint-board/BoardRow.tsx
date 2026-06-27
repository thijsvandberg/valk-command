"use client";

import { forwardRef, memo, useRef, useCallback, useState, useMemo } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import type { Ticket, POStatus, TicketReadiness, IssueType, JiraStatus, Sprint } from "@/types/ticket";
import { AssigneePicker, type AssignableUser } from "@/components/shared/AssigneePicker";
import { EpicPicker, type EpicOption } from "@/components/shared/EpicPicker";
import { EpicBadge, SubtaskCountBadge } from "@/components/shared/IssueMetaBadges";
import { AddEpicPill } from "@/components/shared/AddEpicPill";
import { HoverRevealSlot } from "@/components/shared/HoverRevealSlot";
import { Checkbox } from "@/components/shared/Checkbox";
import type { InlineTagId } from "@/components/sprint-board/filter-bar-types";
import { Avatar } from "@/components/shared/Avatar";
import { Flag, MessageSquare, Pencil, Check, X, Boxes, IterationCw, GripVertical, AlertTriangle, Scissors, Clock, NotebookPen } from "lucide-react";
import { WarningBadge } from "@/components/sprint-board/WarningBadge";
import { type WarningKind } from "@/components/sprint-board/warning-filter";
import type { TicketSessionEntry } from "@/hooks/useTicketSessionMap";
import { RefinementGemTrigger, type RefinementCardTicketInfo } from "@/components/sprint-board/RefinementGemHoverCard";
import type { PipelineHealthEntry, LastDeployedInfo } from "@/hooks/usePipelines";
import type { StatusChangeItem } from "@/lib/status-changes-query";
import { StatusChangeLine } from "@/components/sprint-board/StatusChangeLine";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EditStateDot, QualityBadge } from "@/components/sprint-board/TicketTableCells";
import { Tooltip } from "@/components/shared/Tooltip";
import { BusinessValuePicker } from "@/components/shared/BusinessValuePicker";
import { EstimatePicker } from "@/components/shared/EstimatePicker";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { prefetchTicketPage } from "@/lib/prefetch";
import { useLiveTicketChange } from "@/hooks/useLiveTicketChange";
import { normalizeEpicStatus } from "@/lib/epic-filters";
import { rowSurfaceClasses } from "./row-surface";

const ALL_TAGS: Set<InlineTagId> = new Set(["flag", "refinement", "quality", "notes", "poReadiness", "editState", "storyPoints", "businessValue", "epic", "assignee", "creator"]);

export interface BoardRowBaseProps {
  ticket: Ticket;
  ticketIdx: number;
  isChecked: boolean;
  isSelected: boolean;
  isFocused?: boolean;
  isInflight?: boolean;
  /** Highlighted because the open row context menu targets this row. */
  isContextTarget?: boolean;
  /** Drop the colored left accent on the row; the background tints still apply. */
  hideRowAccent?: boolean;
  someChecked: boolean;
  isDragActive: boolean;
  /** Which secondary signals are shown inline. Omitted = all (BRDG-239). */
  tags?: Set<InlineTagId>;
  /** Suppress the epic chip (e.g. when the board is grouped by epic). */
  hideEpic?: boolean;
  /**
   * Open/total subtask-count chip (epic-children list, BRDG-367). Opt-in: only the epic
   * hosts pass it, so the board / inbox / Story Writer landing never grow the chip even
   * though they populate `ticket.openSubtaskCount`/`totalSubtaskCount` for the hover card.
   * Distinct from the "closed with open subtasks" warning badge. Hidden when total <= 0.
   */
  subtaskCounts?: { open: number; total: number };
  /**
   * Forwarded to the status pill so a host can hide the issue-key / status segments
   * (epic-children field toggles, BRDG-367). Both default to true, so the board / inbox /
   * Story Writer landing keep showing the key and status exactly as today.
   */
  showKey?: boolean;
  showStatus?: boolean;
  /**
   * Estimate-hygiene problems for this ticket, shown as width-gated badges while the
   * warning filter mode is active (BRDG-313). Empty/undefined renders nothing, so the
   * badges only appear when the parent sets them (i.e. while the mode is on). Some
   * kinds are interactive: "no_subtasks" opens the add-subtasks modal and
   * "closed_with_open_subtasks" opens the subtask popover (BRDG-366).
   */
  warnings?: WarningKind[];
  /** Show the sprint name inline (when multiple sprints are visible: All view / saved view). */
  showSprint?: boolean;
  sprintNameMap?: Record<string, string>;
  poStatuses?: Record<string, POStatus>;
  readinessMap?: Record<string, TicketReadiness | null>;
  followedKeys?: string[];
  followTicket?: (key: string) => void;
  unfollowTicket?: (key: string) => void;
  lastDeployedMap?: Record<string, LastDeployedInfo>;
  healthMap?: Record<string, PipelineHealthEntry>;
  selectedTicket: string | null;
  onSelectTicket: (key: string | null) => void;
  onCheckboxClick: (key: string, idx: number, shiftKey: boolean) => void;
  onRowContextMenu?: (key: string, e: React.MouseEvent) => void;
  onPoStatusChange?: (key: string, status: POStatus) => void;
  onReadinessChange?: (key: string, readiness: TicketReadiness | null) => void;
  onBusinessValueChange?: (key: string, value: number | null) => void;
  onStoryPointsChange?: (key: string, value: number | null) => void;
  /** Forward-planning mode for this view (BRDG-303): reveals the guestimation picker
   *  on tickets that have no real story points yet. Off = the row looks as it does today. */
  planningOn?: boolean;
  onGuestimationChange?: (key: string, value: number | null) => void;
  onJiraStatusChange?: (key: string, status: JiraStatus) => void;
  onIssueTypeChange?: (key: string, type: IssueType) => void;
  onTitleChange?: (key: string, title: string) => void;
  onAssigneeChange?: (key: string, user: AssignableUser | null) => void;
  onEpicChange?: (key: string, epic: EpicOption | null) => void;
  onSprintChange?: (key: string, sprintId: string | null) => void;
  sprints?: Sprint[];
  onCloseSubtasks?: (key: string) => Promise<void>;
  /** Optimistically record subtasks added from the row's "No subtasks" badge (BRDG-366). */
  onSubtasksAdded?: (key: string, count: number) => void;
  editingTitleKey?: string | null;
  onEditingTitleKeyChange?: (key: string | null) => void;
  reviewPopoverKey?: string | null;
  onToggleReviewPopover?: (key: string) => void;
  /** Request a quality review for this ticket (offered in the hover card when unscored). */
  onRunReview?: (key: string) => void | Promise<void>;
  refinementSessions?: TicketSessionEntry[];
  /** Sibling ticket detail for the gem hover card pills, from already-loaded board data. */
  ticketInfoMap?: Map<string, RefinementCardTicketInfo>;
  onRemoveFromRefinement?: (sessionId: string, ticketKey: string) => void;
  onViewRefinement?: (sessionId: string) => void;
  insertLine?: "above" | "below";
  /**
   * Story Writer landing (BRDG-325) session decorations. All optional and inert on the
   * sprint board, which never passes them.
   *
   * onActivate: clicking the row activates it (resume the draft) instead of selecting it
   * into the sidebar; cmd/ctrl-click still opens the ticket in a new tab.
   * onDiscard: renders a hover-revealed "Clear session" action that floats over the row
   * content from the right (same overlay concept as the subtask Edit/Delete actions).
   * sessionTimeAgo: preformatted "6h ago" chip.
   * sessionJiraChanged: amber "Jira changed" badge.
   * splitTarget: when defined, renders the "Split" badge; a non-empty value is shown as a
   * muted secondary target title next to the source title.
   */
  onActivate?: (key: string) => void;
  onDiscard?: (key: string) => void;
  /**
   * New story inbox (BRDG-357): renders a hover-revealed trailing "Mark as read"
   * action (same floating-overlay concept as onDiscard). Inert on the board,
   * which never passes it.
   */
  onMarkRead?: (key: string) => void;
  /**
   * Freshly inline-created story (BRDG-395): renders an always-visible "Open in Story
   * Writer" pill next to the title, linking to /tickets/{key}/write. Set by the list host
   * only for the row(s) created via the inline quick-add this session; cleared on unmount /
   * reload. Off by default and inert on every existing host.
   */
  showStoryWriterLink?: boolean;
  /**
   * New story inbox (BRDG-358): preformatted created-date chip shown on the row.
   * The inbox passes it only when grouped by something other than Date, where the
   * group header no longer conveys the creation date. Absent elsewhere.
   */
  createdAtLabel?: string;
  sessionTimeAgo?: string;
  sessionJiraChanged?: boolean;
  splitTarget?: string | null;
  /**
   * Sprint board status-change review queue (BRDG-414): the latest unseen status change
   * for this ticket on the active sprint. Renders a quiet line beneath the row with the
   * transition + signals + contextual action. Absent (board-only) elsewhere.
   */
  statusChange?: StatusChangeItem | null;
  onStatusChangeSeen?: (id: string) => void;
  onStatusChangeMoveToBottom?: (ticketKey: string, statusChangeId: string) => void;
  /** Drop the leading selection-checkbox gutter (views without bulk selection, e.g. the
   *  Story Writer landing). Off by default so the board keeps its checkbox. */
  hideCheckbox?: boolean;
  /**
   * Sprint board (BRDG-368): hide the assignee avatar by default and reveal it on row
   * hover when it is pure noise — terminal tickets (DONE / DEPRECATED) and unassigned
   * tickets. Active-status assigned rows are unaffected. Off by default so other hosts
   * (inbox, epic children) keep showing the avatar as today.
   */
  hideAssigneeUntilHover?: boolean;
  /**
   * Last row in its card: rounds the row surface's bottom corners so the hover/selection
   * fill follows the card's rounded edge instead of bleeding square into the corners. The
   * card lets content bleed past its edge (overflow-clip-margin) so the drag handle can
   * straddle the left border, which is why the corners need rounding here per-row.
   */
  isLastInCard?: boolean;
  /**
   * First row in its card: rounds the row surface's top corners, the mirror of
   * isLastInCard. Needed by hosts whose card keeps an overflow-clip margin (for a
   * bleeding drag handle / FLIP animation) instead of clipping per-row corners, so the
   * top row's hover/selection fill follows the card's rounded edge (BRDG-389). Off by
   * default; hosts whose card fully clips (overflow-hidden/clip) never set it.
   */
  isFirstInCard?: boolean;
  rowStyle?: React.CSSProperties;
  dragListeners?: ReturnType<typeof useSortable>["listeners"];
  dragAttributes?: ReturnType<typeof useSortable>["attributes"];
  "data-index"?: number;
  /**
   * Opt-in list-host extensions (BRDG-389). All default-off and inert for the board /
   * inbox / Story Writer / epic hosts. The cleanup and refinement lists use these to
   * render through BoardRow instead of the legacy ChildIssueRow.
   */
  /** Extra vertical row padding (py-[10px] vs py-[7px]) for a more relaxed list. */
  spacious?: boolean;
  /** Keep the selection checkbox always visible in the content flow instead of
   *  hover-revealing it, so an external drag handle stays usable while rows are checked. */
  inlineCheckbox?: boolean;
  /** Trailing host-specific metadata (cleanup score/disposition badges, refinement
   *  session badges). Rendered click-isolated after the native metadata cluster. */
  metadataSlot?: React.ReactNode;
  /** External drag handle in the left gutter for a cross-list drag (refinement "drag into
   *  queue", BRDG-336). Distinct from the built-in reorder grip; when present it replaces
   *  the native grip. Hidden during multiselect, like the native grip. */
  dragHandleSlot?: React.ReactNode;
  /** Stable row key for FLIP reorder hosts (useFlipReorder queries [data-ticket-key]). */
  "data-ticket-key"?: string;
}

export const BoardRow = memo(forwardRef<HTMLTableRowElement, BoardRowBaseProps>(function BoardRow(
  {
    ticket,
    ticketIdx,
    isChecked,
    isSelected,
    isFocused = false,
    isInflight = false,
    isContextTarget = false,
    hideRowAccent = false,
    someChecked,
    isDragActive,
    tags = ALL_TAGS,
    hideEpic = false,
    subtaskCounts,
    showKey = true,
    showStatus = true,
    warnings,
    showSprint = false,
    sprintNameMap = {},
    readinessMap = {},
    followedKeys,
    followTicket: follow,
    unfollowTicket: unfollow,
    lastDeployedMap,
    healthMap,
    selectedTicket,
    onSelectTicket,
    onCheckboxClick,
    onRowContextMenu,
    onReadinessChange,
    onBusinessValueChange,
    onStoryPointsChange,
    planningOn = false,
    onGuestimationChange,
    onJiraStatusChange,
    onIssueTypeChange,
    onTitleChange,
    onAssigneeChange,
    onEpicChange,
    onSprintChange,
    sprints,
    onCloseSubtasks,
    onSubtasksAdded,
    editingTitleKey = null,
    onEditingTitleKeyChange,
    reviewPopoverKey = null,
    onToggleReviewPopover,
    onRunReview,
    refinementSessions,
    ticketInfoMap,
    onRemoveFromRefinement,
    onViewRefinement,
    insertLine,
    onActivate,
    onDiscard,
    onMarkRead,
    showStoryWriterLink = false,
    createdAtLabel,
    sessionTimeAgo,
    sessionJiraChanged = false,
    splitTarget,
    statusChange,
    onStatusChangeSeen,
    onStatusChangeMoveToBottom,
    hideCheckbox = false,
    hideAssigneeUntilHover = false,
    isLastInCard = false,
    isFirstInCard = false,
    rowStyle,
    dragListeners,
    dragAttributes,
    "data-index": dataIndex,
    spacious = false,
    inlineCheckbox = false,
    metadataSlot,
    dragHandleSlot,
    "data-ticket-key": dataTicketKey,
  },
  ref
) {
  const isEditingTitle = editingTitleKey === ticket.key;
  const [editTitleValue, setEditTitleValue] = useState("");
  // True while a meta picker (estimate / business value) popover is open. Keeps the
  // whole empty-placeholder cluster visible so moving the cursor into the open
  // dropdown does not collapse the neighbouring placeholders (BRDG-323).
  const [metaPickerOpen, setMetaPickerOpen] = useState(false);
  // The estimate lives in the left placeholder cluster while empty and in its
  // natural value slot once set. Setting a guess mid-popover would flip slots and
  // remount the picker, dropping the open dropdown before you can commit. So we
  // freeze which slot it renders in for as long as its popover is open (BRDG-323).
  const [estimateSlotFrozen, setEstimateSlotFrozen] = useState<null | "value" | "placeholder">(null);
  // BRDG-368: keep the hover-revealed assignee visible while its picker popover is
  // open, so moving the cursor off the row into the open dropdown does not fade the
  // trigger out from under it (mirrors metaPickerOpen for the planning cluster).
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const titleEditContainerRef = useRef<HTMLDivElement>(null);

  useOutsideClick(titleEditContainerRef, () => onEditingTitleKeyChange?.(null), { enabled: isEditingTitle, escapeClose: false });

  const autoSizeTextarea = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  // BRDG-338: pulse the row when this ticket's data just changed elsewhere
  // (another tab, a sync, an agent push). Changes this tab made are silent.
  const liveChangeKinds = useLiveTicketChange(ticket.key);

  const isFollowed = followedKeys?.includes(ticket.key) ?? false;
  const lastDeploy = lastDeployedMap?.[ticket.key];
  const health = healthMap?.[ticket.key];
  const isRemoved = Boolean(ticket.removedFromJiraAt);
  // Deprecated stories carry no planning metrics, so an empty SP/BV is suppressed
  // entirely here (no hover placeholder). A deprecated ticket that still carries a
  // value keeps showing it.
  const isDeprecated = ticket.jiraStatus === "DEPRECATED";
  // BRDG-368: on the sprint board the assignee is pure noise on terminal tickets
  // (DONE / DEPRECATED, via the canonical normalizer so Closed/Resolved collapse to
  // DONE) and on unassigned rows. In those cases hide it by default and reveal on row
  // hover/focus; active-status assigned rows keep the avatar always visible.
  const isTerminalStatus = ["DONE", "DEPRECATED"].includes(normalizeEpicStatus(ticket.jiraStatus));
  const hideAssignee = hideAssigneeUntilHover && (isTerminalStatus || !ticket.assignee);

  // Epic / SP / BV placement (BRDG-310): everything that is *set* renders in its
  // natural slot; the still-empty (but applicable) planning fields reserve no space and
  // open on row hover as a placeholder cluster to the LEFT of every set badge (so they
  // sit left of a set epic chip, a refinement gem, etc.). Among themselves the
  // placeholders keep the natural epic -> SP -> BV order. Empty SP/BV on a deprecated
  // story are suppressed entirely (no hover placeholder); a set value still shows.
  // N/A (value 0, rendered as "-") is folded in with the unset case so it stays out
  // of the calm resting list and only surfaces as a hover placeholder; only real
  // estimates (1, 2, 3, ...) keep an always-visible badge (BRDG-310).
  const spEmpty = ticket.storyPoints == null || ticket.storyPoints === 0;
  const bvEmpty = ticket.businessValue == null || ticket.businessValue === 0;
  const showBvValue = tags.has("businessValue") && !bvEmpty;
  const showBvPlaceholder = tags.has("businessValue") && bvEmpty && !isDeprecated;
  // Estimate (BRDG-323): SP and the forward-planning guess share ONE chip. The
  // guess lifecycle is only offered while planning mode is on and a write handler
  // is wired; SP supersedes the guess for display (a guess only shows while SP is
  // empty). A set estimate (real SP, or a guess in planning mode) renders inline;
  // an all-empty cell surfaces as a hover placeholder.
  const guessEmpty = ticket.guestimation == null || ticket.guestimation === 0;
  // A ticket in a refinement session keeps the guestimate flow on the board: SP-only
  // entry is enforced inside the session view (SessionStoryPointPicker), not here. So
  // the board offers the guess lifecycle for every row whenever planning mode is on.
  const estimatePlanning = planningOn && Boolean(onGuestimationChange);
  const estimateSet = !spEmpty || (estimatePlanning && !guessEmpty);
  // While the estimate popover is open, hold its slot fixed so picking a guess
  // does not remount it (which would close the dropdown before you can commit).
  const estimateInValue = estimateSlotFrozen ? estimateSlotFrozen === "value" : estimateSet;
  const showEstimateValue = tags.has("storyPoints") && estimateInValue;
  // The empty "add estimate" placeholder is only useful when the estimate can actually be
  // set: a read-only row (no SP handler, not in planning mode) shows nothing for an empty
  // estimate. On the board the handler is always wired, so this is a no-op there (BRDG-325).
  const canEditEstimate = Boolean(onStoryPointsChange) || estimatePlanning;
  const showEstimatePlaceholder = tags.has("storyPoints") && !estimateInValue && !isDeprecated && canEditEstimate;
  const handleEstimateOpenChange = (open: boolean) => {
    setMetaPickerOpen(open);
    setEstimateSlotFrozen(open ? (estimateSet ? "value" : "placeholder") : null);
  };
  const showEpicPlaceholder = tags.has("epic") && !hideEpic && !ticket.epic && Boolean(onEpicChange) && !isRemoved;

  // Checkbox always visible when checked or when any row is checked (bulk mode).
  // inlineCheckbox (BRDG-389) keeps it permanently in the content flow for list hosts.
  const showCheckbox = isChecked || someChecked || inlineCheckbox;

  const checkbox = (
    <Checkbox
      checked={isChecked}
      className={showCheckbox ? "opacity-100" : `opacity-0 ${!isDragActive ? "group-hover/row:opacity-100" : ""}`}
    />
  );

  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleMouseEnter = useCallback(() => {
    prefetchTimerRef.current = setTimeout(() => prefetchTicketPage(ticket.key), 200);
  }, [ticket.key]);
  const handleMouseLeave = useCallback(() => {
    if (prefetchTimerRef.current) { clearTimeout(prefetchTimerRef.current); prefetchTimerRef.current = null; }
  }, []);

  const insertLineShadow = insertLine === "above"
    ? "inset 0 2px 0 var(--color-brand-500)"
    : insertLine === "below"
    ? "inset 0 -2px 0 var(--color-brand-500)"
    : undefined;
  const style: React.CSSProperties = {
    ...(insertLineShadow ? { boxShadow: insertLineShadow } : {}),
    ...rowStyle,
  };

  const showReadiness = tags.has("poReadiness");
  const isSplit = splitTarget !== undefined;

  return (
    <tr
      ref={ref}
      data-index={dataIndex}
      data-ticket-key={dataTicketKey}
      style={{
        ...style,
        ...(isEditingTitle ? { position: "relative" as const, zIndex: 5 } : {}),
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={(e) => {
        if (!onRowContextMenu || isDragActive) return;
        e.preventDefault();
        onRowContextMenu(ticket.key, e);
      }}
      onClick={(e) => {
        if (isDragActive) return;
        if (e.metaKey || e.ctrlKey) {
          window.open(`/tickets/${ticket.key}`, "_blank", "noopener,noreferrer");
          return;
        }
        // Story Writer landing: a row activates (resume the draft) rather than
        // selecting into the sidebar (BRDG-325). Inert on the board (onActivate absent).
        if (onActivate) {
          onActivate(ticket.key);
          return;
        }
        onSelectTicket(ticket.key === selectedTicket ? null : ticket.key);
      }}
      {...dragListeners}
      {...dragAttributes}
    >
      <td className="p-0">
        {/* Horizontal gutters: pl-4 + the issue-icon's internal padding reads as ~24px on the
            left, so the right uses pr-[23px] to make the assignee sit the same distance from
            the edge as the issue icon does on the left. Rows are line-less and use py-[7px] to
            match the epic view's tighter row height (BRDG-239, "B+C").
            The row surface (background, left accent, hover) lives on this div rather than the
            <tr>: a div honours border-radius, so the last row can round its bottom corners to
            the card edge. A <tr>/<td> with border-collapse ignores radius, which is why the
            hover fill used to bleed square into the card's rounded corners. */}
        <div className={`group/row @container/boardrow relative flex items-center gap-2 ${spacious ? "py-[10px]" : "py-[7px]"} pl-4 pr-[23px] transition-colors duration-100 ${
          dragListeners ? "cursor-grab active:cursor-grabbing select-none" : "cursor-pointer"
        } ${rowSurfaceClasses({
          selected: isSelected,
          contextTarget: isContextTarget,
          checked: isChecked,
          flagged: Boolean(ticket.flagged),
          focused: isFocused,
          removed: isRemoved,
          deprecated: isDeprecated,
          inflight: isInflight,
          lastInCard: isLastInCard,
          firstInCard: isFirstInCard,
          hideAccent: hideRowAccent,
          livePulse: liveChangeKinds.size > 0,
        })}`}>
          {/* Drag affordance in the left gutter (Jira-style). Visual only: the whole row is the
              drag activator, so this never needs its own listeners. Shown only when reordering
              is possible (dragListeners present) and never during multiselect. Suppressed when a
              host supplies its own dragHandleSlot (BRDG-389) so the two grips never stack. */}
          {dragListeners && !dragHandleSlot && !someChecked && (
            <span
              aria-hidden
              // pointer-events stay ON: the handle protrudes past the row's left
              // edge, so without this its half would pass the cursor through to the
              // background and the row would drop its hover. As a row descendant its
              // pointer events bubble to the row's own drag listeners.
              className="absolute -left-[3px] top-1/2 flex h-6 w-[18px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border border-border-subtle bg-[var(--color-surface-elevated)] text-text-tertiary opacity-0 shadow-[var(--shadow-sm)] transition-opacity duration-150 group-hover/row:opacity-100"
            >
              <GripVertical size={12} strokeWidth={1.5} />
            </span>
          )}

          {/* External drag handle (BRDG-389): a host-supplied cross-list drag activator (e.g.
              refinement "drag into queue", BRDG-336). Lives over the row's leading edge like the
              native grip and is hidden during multiselect, so the inline checkbox + handle can
              coexist while rows are checked. Mirrors the ChildIssueRow gutter treatment. */}
          {dragHandleSlot && !someChecked && (
            <span className="absolute -left-[3px] top-1/2 z-10 flex h-6 w-[18px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border border-border-subtle bg-[var(--color-surface-elevated)] text-text-tertiary opacity-0 shadow-[var(--shadow-sm)] transition-opacity duration-150 group-hover/row:opacity-100 focus-within:opacity-100">
              {dragHandleSlot}
            </span>
          )}

          {/* Dedicated checkbox gutter on every row: always reserves space so content never
              shifts. The checkbox itself stays hidden until row hover (or when a selection is
              active) - see the `checkbox` definition above. Dropped entirely on views with no
              bulk selection (hideCheckbox), e.g. the Story Writer landing (BRDG-325). */}
          {!hideCheckbox && (
            <div
              className="flex w-3.5 shrink-0 cursor-pointer items-center justify-center"
              role="checkbox"
              aria-checked={isChecked}
              aria-label={`Select ${ticket.key}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onCheckboxClick(ticket.key, ticketIdx, e.shiftKey); }}
            >
              {checkbox}
            </div>
          )}

          <div className="relative flex shrink-0 items-center gap-1.5" style={{ fontVariantNumeric: "tabular-nums" }}>
            <span onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
              <TicketStatusPill
                ticketKey={ticket.key}
                jiraStatus={ticket.jiraStatus}
                title={ticket.title}
                issueType={ticket.type}
                readiness={isRemoved ? null : (readinessMap[ticket.key] ?? null)}
                showReadiness={showReadiness}
                onReadinessChange={isRemoved ? undefined : (onReadinessChange ? (r) => onReadinessChange(ticket.key, r) : undefined)}
                onJiraStatusChange={isRemoved ? undefined : (onJiraStatusChange ? (s) => onJiraStatusChange(ticket.key, s) : undefined)}
                onIssueTypeChange={isRemoved ? undefined : (onIssueTypeChange ? (t) => onIssueTypeChange(ticket.key, t) : undefined)}
                variant="list"
                size="lg"
                showKey={showKey}
                showStatus={showStatus}
                removedFromJira={isRemoved}
                onStoryPointsChange={isRemoved ? undefined : (onStoryPointsChange ? (v) => onStoryPointsChange(ticket.key, v) : undefined)}
                onBusinessValueChange={isRemoved ? undefined : (onBusinessValueChange ? (v) => onBusinessValueChange(ticket.key, v) : undefined)}
                onAssigneeChange={isRemoved ? undefined : (onAssigneeChange ? (u) => onAssigneeChange(ticket.key, u) : undefined)}
                onEpicChange={isRemoved ? undefined : (onEpicChange ? (e) => onEpicChange(ticket.key, e) : undefined)}
                onSprintChange={isRemoved ? undefined : (onSprintChange ? (s) => onSprintChange(ticket.key, s) : undefined)}
                onToggleFollow={isRemoved ? undefined : (() => (isFollowed ? unfollow?.(ticket.key) : follow?.(ticket.key)))}
                onRunReview={isRemoved || !onRunReview ? undefined : () => onRunReview(ticket.key)}
                sprints={sprints}
                hoverData={{
                  title: ticket.title,
                  storyPoints: ticket.storyPoints,
                  businessValue: ticket.businessValue,
                  sprintId: ticket.sprintId ?? null,
                  sprintName: ticket.sprintId ? (sprintNameMap[ticket.sprintId] ?? ticket.sprintId) : null,
                  epicKey: ticket.epicKey,
                  epic: ticket.epic,
                  assignee: ticket.assignee ?? null,
                  reporter: ticket.reporter ?? null,
                  openSubtaskCount: ticket.openSubtaskCount ?? 0,
                  totalSubtaskCount: ticket.totalSubtaskCount ?? 0,
                  flagged: ticket.flagged,
                  pipelineHealth: health,
                  lastDeploy,
                  readiness: isRemoved ? null : (readinessMap[ticket.key] ?? null),
                  qualityScore: ticket.qualityScore,
                  notes: ticket.notes,
                  followed: isFollowed,
                  editState: isRemoved || !ticket.editState || ticket.editState === "clean" ? null : ticket.editState,
                  refinementNames: refinementSessions?.map((s) => s.name),
                }}
              />
            </span>
            {tags.has("editState") && !isRemoved && ticket.editState === "local_edits" && <EditStateDot state="local_edits" />}
            {tags.has("editState") && !isRemoved && ticket.editState === "conflict" && <EditStateDot state="conflict" />}
          </div>

          {/* Split-session badge (BRDG-325). Violet from the row-marker family (BRDG-321),
              kept theme-aware via --meta-bv-fg. Inert on the board (splitTarget absent). */}
          {isSplit && (
            <span
              className="inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[11px] font-medium leading-none"
              style={{ color: "var(--meta-bv-fg)", backgroundColor: "color-mix(in srgb, #8b5cf6 14%, transparent)" }}
            >
              <Scissors size={10} strokeWidth={2} className="shrink-0 opacity-80" aria-hidden />
              Split
            </span>
          )}

          {isEditingTitle ? (
            <div ref={titleEditContainerRef} className="z-20 flex min-w-0 flex-1 items-start gap-1" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <textarea
                ref={titleInputRef}
                value={editTitleValue}
                onChange={(e) => { setEditTitleValue(e.target.value); autoSizeTextarea(e.target); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    const trimmed = editTitleValue.trim();
                    if (trimmed && trimmed !== ticket.title) onTitleChange?.(ticket.key, trimmed);
                    onEditingTitleKeyChange?.(null);
                  } else if (e.key === "Escape") {
                    onEditingTitleKeyChange?.(null);
                  }
                }}
                rows={1}
                className="min-w-0 flex-1 resize-none overflow-hidden rounded border border-[var(--color-brand-500)]/40 bg-[var(--color-surface-elevated)] px-1.5 py-1 text-body-lg leading-snug text-text-primary shadow-[var(--shadow-lg)] outline-none focus:border-[var(--color-brand-500)]/70"
              />
              <button
                type="button"
                onClick={() => {
                  const trimmed = editTitleValue.trim();
                  if (trimmed && trimmed !== ticket.title) onTitleChange?.(ticket.key, trimmed);
                  onEditingTitleKeyChange?.(null);
                }}
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded border border-border-strong bg-[var(--color-surface-elevated)] text-text-tertiary shadow-[var(--shadow-lg)] transition-colors duration-100 hover:text-text-secondary"
                title="Save"
              >
                <Check size={14} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={() => onEditingTitleKeyChange?.(null)}
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded border border-border-strong bg-[var(--color-surface-elevated)] text-text-tertiary shadow-[var(--shadow-lg)] transition-colors duration-100 hover:text-text-secondary"
                title="Cancel"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>
          ) : (
            <>
              {/* Title — the only element that yields space (BRDG-239). */}
              <div className="flex min-w-0 flex-1 items-center gap-1.5 text-text-primary">
                <span className="min-w-0 truncate text-body-lg">{ticket.title}</span>
                {/* Split target title (BRDG-325): the destination story, muted, after the
                    source. Yields width with the source title. */}
                {isSplit && splitTarget && (
                  <span className="flex min-w-0 shrink items-center gap-1 text-body-sm text-text-tertiary">
                    <Scissors size={10} strokeWidth={1.75} className="shrink-0 rotate-90 opacity-50" aria-hidden />
                    <span className="min-w-0 truncate">{splitTarget}</span>
                  </span>
                )}
                {onTitleChange && !isRemoved && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditTitleValue(ticket.title);
                      onEditingTitleKeyChange?.(ticket.key);
                      requestAnimationFrame(() => {
                        const ta = titleInputRef.current;
                        if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); autoSizeTextarea(ta); }
                      });
                    }}
                    className="ml-0.5 hidden h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-text-muted transition-colors duration-100 group-hover/row:flex hover:!bg-overlay-default hover:!text-text-secondary"
                    title="Edit summary"
                  >
                    <Pencil size={11} strokeWidth={1.5} />
                  </button>
                )}
              </div>

              {/* Hover-revealed placeholders for the still-empty planning fields
                  (BRDG-310). They reserve no space (HoverRevealSlot) and open on row
                  hover to the LEFT of every set badge below, keeping the natural
                  epic -> SP -> BV order. Set values render in their own slots further
                  right. */}
              {showEpicPlaceholder && (
                <HoverRevealSlot hideWhenNarrow forceOpen={metaPickerOpen}>
                  <AddEpicPill ticketKey={ticket.key} onChange={(epic) => onEpicChange?.(ticket.key, epic)} />
                </HoverRevealSlot>
              )}
              {showEstimatePlaceholder && (
                <HoverRevealSlot hideWhenNarrow forceOpen={metaPickerOpen}>
                  <EstimatePicker
                    storyPoints={ticket.storyPoints}
                    guestimation={ticket.guestimation ?? null}
                    onStoryPointsChange={onStoryPointsChange ? (v) => onStoryPointsChange(ticket.key, v) : () => {}}
                    onGuestimationChange={onGuestimationChange ? (v) => onGuestimationChange(ticket.key, v) : () => {}}
                    planningMode={estimatePlanning}
                    onOpenChange={handleEstimateOpenChange}
                    dense
                    showMetricIcon
                    richTooltip
                  />
                </HoverRevealSlot>
              )}
              {showBvPlaceholder && (
                <HoverRevealSlot hideWhenNarrow forceOpen={metaPickerOpen}>
                  <BusinessValuePicker
                    value={ticket.businessValue}
                    onChange={onBusinessValueChange ? (v) => onBusinessValueChange(ticket.key, v) : () => {}}
                    onOpenChange={setMetaPickerOpen}
                    dense
                    showMetricIcon
                    richTooltip
                  />
                </HoverRevealSlot>
              )}

              {/* Per-row estimate-hygiene badges (BRDG-313/366). Shown only while the warning
                  filter mode is active (the parent only passes warnings then) and only when the
                  row is wide enough: gated by display (not opacity) so narrow rows reserve no
                  space. Rendered AFTER the hover-revealed planning placeholders above so that
                  revealing those placeholders on hover never shifts these badges out from under
                  the cursor - the placeholders open to the badges' left and the badges stay put
                  (BRDG-366). Same warning tokens as the header triangle; "No subtasks" and
                  "Closed with open subtasks" are interactive (WarningBadge). */}
              {warnings && warnings.length > 0 && (
                <span className="hidden shrink-0 items-center gap-1.5 @[52rem]/boardrow:inline-flex">
                  {warnings.map((kind) => (
                    <WarningBadge
                      key={kind}
                      kind={kind}
                      ticket={ticket}
                      onCloseSubtasks={onCloseSubtasks}
                      onSubtasksAdded={onSubtasksAdded}
                    />
                  ))}
                </span>
              )}

              {/* Notes + refinement signals, placed just left of the epic chip. */}
              {tags.has("notes") && ticket.notes && (
                <span className="shrink-0" title={ticket.notes}>
                  <MessageSquare className="h-3.5 w-3.5 text-text-muted" strokeWidth={1.5} />
                </span>
              )}
              {tags.has("refinement") && refinementSessions && refinementSessions.length > 0 && (
                <RefinementGemTrigger
                  sessions={refinementSessions}
                  currentKey={ticket.key}
                  ticketInfoMap={ticketInfoMap}
                  onRemoveFromRefinement={onRemoveFromRefinement}
                  onViewRefinement={onViewRefinement}
                >
                  <span
                    className="inline-flex h-5 shrink-0 items-center justify-center"
                    style={{ color: "var(--meta-refine-fg)" }}
                  >
                    <Boxes size={14} strokeWidth={1.75} className="shrink-0" />
                  </span>
                </RefinementGemTrigger>
              )}

              {/* "Jira changed" badge (BRDG-325): positioned at the far left of the
                  metadata cluster, just before the epic chip. Reuses the same
                  status-warning chip treatment as the per-row warning labels. Inert on
                  the board (sessionJiraChanged absent). */}
              {sessionJiraChanged && (
                <span className="inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] leading-none text-[color-mix(in_srgb,var(--color-status-warning)_80%,var(--color-text-secondary))] bg-[color-mix(in_srgb,var(--color-status-warning)_6%,transparent)]">
                  <AlertTriangle size={11} strokeWidth={2} className="shrink-0 opacity-70" aria-hidden />
                  Jira changed
                </span>
              )}

              {/* Epic chip (set epics only) — shrinks with the title when space is
                  tight. Clicking it opens the epic picker dropdown (view in sidebar /
                  new tab / unlink / change) rather than navigating away or selecting
                  the row (BRDG-131). Rows without an epic show the hover-revealed
                  "Add epic" placeholder above instead. Suppressed when grouped by epic
                  (hideEpic). */}
              {tags.has("epic") && !hideEpic && ticket.epic && ticket.epicKey && (
                onEpicChange && !isRemoved ? (
                  <span className="flex min-w-0 shrink" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                    <EpicPicker
                      value={{ key: ticket.epicKey, name: ticket.epic }}
                      onChange={(epic) => onEpicChange(ticket.key, epic)}
                      ticketKey={ticket.key}
                      onViewInSidebar={() => onSelectTicket(ticket.epicKey!)}
                      triggerClassName="min-w-0 shrink"
                      align="left"
                    />
                  </span>
                ) : (
                  <EpicBadge epic={ticket.epic} className="min-w-0 shrink" />
                )
              )}

              {/* Sprint name — only when several sprints are visible at once (All view / saved view). */}
              {showSprint && ticket.sprintId && (
                <span
                  className="inline-flex h-5 min-w-0 shrink items-center gap-1 truncate whitespace-nowrap rounded-md px-1.5 text-[11px] leading-none text-text-tertiary"
                  style={{ backgroundColor: "var(--color-overlay-subtle)" }}
                  title={sprintNameMap[ticket.sprintId] ?? ticket.sprintId}
                >
                  <IterationCw size={10} strokeWidth={1.75} className="shrink-0 opacity-70" />
                  {sprintNameMap[ticket.sprintId] ?? ticket.sprintId}
                </span>
              )}

              {/* Conditional inline tags (do not yield space). */}
              {tags.has("flag") && ticket.flagged && (
                <Flag className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-status-error)" }} fill="currentColor" strokeWidth={1.5} />
              )}
              {/* Quality Score: only shown once a review exists. Unscored tickets show nothing
                  here; a review can be requested from the hover card instead (BRDG-239). */}
              {tags.has("quality") && ticket.qualityScore != null && (
                <span
                  className="shrink-0 leading-none"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <QualityBadge
                    score={ticket.qualityScore}
                    ticketKey={ticket.key}
                    isPopoverOpen={reviewPopoverKey === ticket.key}
                    onTogglePopover={onToggleReviewPopover ? () => onToggleReviewPopover(ticket.key) : undefined}
                  />
                </span>
              )}
              {/* SP / BV values (set only) — empty cells live in the hover-revealed
                  placeholder cluster above, so a set value simply renders inline here
                  in natural order (BRDG-310). */}
              {showEstimateValue && (
                <span className="shrink-0" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                  <EstimatePicker
                    storyPoints={ticket.storyPoints}
                    guestimation={ticket.guestimation ?? null}
                    onStoryPointsChange={onStoryPointsChange ? (v) => onStoryPointsChange(ticket.key, v) : () => {}}
                    onGuestimationChange={onGuestimationChange ? (v) => onGuestimationChange(ticket.key, v) : () => {}}
                    planningMode={estimatePlanning}
                    onOpenChange={handleEstimateOpenChange}
                    dense
                    showMetricIcon
                    richTooltip
                  />
                </span>
              )}
              {showBvValue && (
                <span className="shrink-0" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                  <BusinessValuePicker
                    value={ticket.businessValue}
                    onChange={onBusinessValueChange ? (v) => onBusinessValueChange(ticket.key, v) : () => {}}
                    onOpenChange={setMetaPickerOpen}
                    dense
                    showMetricIcon
                    richTooltip
                  />
                </span>
              )}

              {/* Open/total subtask-count chip (BRDG-367) — epic-children hosts only.
                  Display-only; SubtaskCountBadge self-hides when total <= 0. Sits after the
                  SP/BV metrics so the cluster reads SP -> BV -> subtasks -> sprint -> assignee. */}
              {subtaskCounts && (
                <span className="shrink-0" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                  <SubtaskCountBadge open={subtaskCounts.open} total={subtaskCounts.total} />
                </span>
              )}

              {/* Relative time (BRDG-325), right of the metric cluster. Inert on the
                  board (the prop is absent there). */}
              {sessionTimeAgo && (
                <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-label text-text-tertiary">
                  <Clock size={10} strokeWidth={1.75} className="text-text-muted" aria-hidden />
                  {sessionTimeAgo}
                </span>
              )}

              {/* Created date (BRDG-358) — shown by the inbox only when its grouping
                  no longer conveys it (i.e. not grouped by Date). Absent elsewhere. */}
              {createdAtLabel && (
                <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-label text-text-tertiary">
                  <Clock size={10} strokeWidth={1.75} className="text-text-muted" aria-hidden />
                  {createdAtLabel}
                </span>
              )}

              {/* Reporter — read-only "by <name>" chip rather than a second avatar,
                  so it is never mistaken for the editable assignee. */}
              {tags.has("creator") && ticket.reporter && (
                <span
                  className="inline-flex h-5 min-w-0 max-w-[140px] shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[11px] leading-none text-text-tertiary"
                  style={{ backgroundColor: "var(--color-overlay-subtle)" }}
                  title={`Reported by ${ticket.reporter.name}`}
                >
                  <span className="shrink-0 opacity-60">by</span>
                  <span className="truncate">{ticket.reporter.name}</span>
                </span>
              )}

              {/* Open in Story Writer pill (BRDG-395): sits at the right of the metadata
                  cluster, just left of the assignee. Only on freshly inline-created rows
                  this session. */}
              {showStoryWriterLink && (
                <a
                  href={`/tickets/${ticket.key}/write`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--color-brand-500)]/[0.1] px-3 py-1 text-body-sm font-medium leading-none text-[var(--color-brand-500)] transition-[opacity,transform] duration-150 hover:bg-[var(--color-brand-500)]/[0.16] hover:text-[var(--color-brand-400)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:scale-95"
                  title="Open in Story Writer"
                >
                  <NotebookPen size={13} strokeWidth={1.75} aria-hidden />
                  <span>Open in Story Writer</span>
                </a>
              )}

              {/* Assignee — right-aligned. Clickable avatar opens the people
                  picker inline, mirroring the ticket sidebar. */}
              {tags.has("assignee") && (
                <div
                  // The wrapper always reserves the 26px avatar width (BRDG-325), so
                  // fading the avatar in/out via opacity never shifts the row (BRDG-368).
                  // Opacity-only transition, matching the row's other hover overlays;
                  // focus-within keeps keyboard/focus-visible access to the picker.
                  className={`ml-1.5 shrink-0${
                    hideAssignee && !assigneePickerOpen
                      ? " opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 focus-within:opacity-100"
                      : ""
                  }`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  {!isRemoved && onAssigneeChange ? (
                    <AssigneePicker
                      value={ticket.assignee ?? null}
                      onChange={(u) => onAssigneeChange(ticket.key, u)}
                      onOpenChange={setAssigneePickerOpen}
                      variant="avatar"
                      avatarSize={26}
                      align="right"
                    />
                  ) : ticket.assignee ? (
                    <Avatar assignee={ticket.assignee} size={26} />
                  ) : (
                    // Read-only and unassigned: reserve the avatar's width so the column stays
                    // aligned, but render nothing (no grey placeholder circle) (BRDG-325).
                    <span aria-hidden className="block h-[26px] w-[26px]" />
                  )}
                </div>
              )}

              {/* Host-specific trailing metadata (BRDG-389): cleanup score/disposition badges,
                  refinement session badges. Click-isolated + lifted (z-20) so an interactive
                  control inside it (e.g. the BV/SP picker) stays reachable and its clicks never
                  bubble to row-select. Inert on the board (metadataSlot absent). */}
              {metadataSlot && (
                <span className="relative z-20 flex shrink-0 items-center gap-1.5" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                  {metadataSlot}
                </span>
              )}
            </>
          )}

          {/* Clear-session overlay (BRDG-325): a textual action that floats over the row
              content from the right on hover, with a gradient fade so it reads cleanly over
              the metadata (same concept as the subtask Edit/Delete actions). stopPropagation
              keeps the click from activating the row. Inert on the board (onDiscard absent). */}
          {onDiscard && !isEditingTitle && (
            <div
              className="absolute inset-y-0 right-0 z-10 flex items-center pl-8 pr-4 opacity-0 transition-opacity duration-150 group-hover/row:opacity-100"
              style={{ background: "linear-gradient(to right, transparent, var(--color-surface-elevated) 24px)" }}
            >
              <button
                type="button"
                title="Clear session"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onDiscard(ticket.key); }}
                className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-text-muted transition-[background-color,color] duration-150 hover:bg-[color-mix(in_srgb,var(--color-status-error)_12%,transparent)] hover:text-[var(--color-status-error)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:bg-[color-mix(in_srgb,var(--color-status-error)_18%,transparent)]"
              >
                <X size={14} strokeWidth={2} />
                <span>Clear session</span>
              </button>
            </div>
          )}

          {/* Mark-as-read overlay (BRDG-357): floats over the row's right edge on hover,
              same gradient-fade concept as onDiscard. Inert on the board (onMarkRead absent). */}
          {onMarkRead && !isEditingTitle && (
            <div
              className="absolute inset-y-0 right-0 z-10 flex items-center pl-8 pr-4 opacity-0 transition-opacity duration-150 group-hover/row:opacity-100"
              style={{ background: "linear-gradient(to right, transparent, var(--color-surface-elevated) 24px)" }}
            >
              <button
                type="button"
                title="Mark as read"
                aria-label="Mark as read"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onMarkRead(ticket.key); }}
                className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-text-muted transition-[background-color,color] duration-150 hover:bg-[var(--color-brand-subtle)] hover:text-[var(--color-brand-300)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:bg-[color-mix(in_srgb,var(--color-brand-500)_18%,transparent)]"
              >
                <Check size={14} strokeWidth={2} />
                <span>Mark read</span>
              </button>
            </div>
          )}
        </div>
        {/* BRDG-414: the status-change review line stacks beneath the row surface, inside the
            same <td>, so the virtualizer keeps measuring the full row height. */}
        {statusChange && onStatusChangeSeen && onStatusChangeMoveToBottom && (
          <StatusChangeLine
            change={statusChange}
            deploy={lastDeploy}
            health={health}
            onSeen={() => onStatusChangeSeen(statusChange.id)}
            onMoveToBottom={() => onStatusChangeMoveToBottom(statusChange.ticketKey, statusChange.id)}
          />
        )}
      </td>
    </tr>
  );
}));

export const SortableBoardRow = memo(function SortableBoardRow(props: Omit<BoardRowBaseProps, "rowStyle" | "dragListeners" | "dragAttributes"> & {
  sortableData?: Record<string, unknown>;
  // In a virtualized list the same <tr> must feed the virtualizer's measureElement;
  // compose it with the sortable node ref so dynamic row heights keep working.
  measureRef?: (el: HTMLElement | null) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props.ticket.key,
    data: props.sortableData ?? { sprintId: props.ticket.sprintId },
  });

  const { measureRef } = props;
  const composedRef = useCallback((el: HTMLTableRowElement | null) => {
    setNodeRef(el);
    measureRef?.(el);
  }, [setNodeRef, measureRef]);

  const rowStyle = useMemo<React.CSSProperties>(() => ({
    transform: isDragging ? undefined : CSS.Transform.toString(transform) || undefined,
    transition: isDragging ? undefined : transition ?? undefined,
    ...(isDragging ? {
      opacity: 0.3,
      outline: "1px dashed var(--color-overlay-strong)",
      outlineOffset: "-1px",
    } : {}),
  }), [isDragging, transform, transition]);

  const { sortableData: _sortableData, measureRef: _measureRef, ...rowProps } = props;

  return (
    <BoardRow
      {...rowProps}
      ref={composedRef}
      rowStyle={rowStyle}
      dragListeners={listeners}
      dragAttributes={attributes}
    />
  );
});
