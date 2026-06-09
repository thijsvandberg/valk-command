"use client";

import { forwardRef, memo, useRef, useCallback, useState, useMemo } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import type { Ticket, POStatus, TicketReadiness, IssueType, JiraStatus, Sprint } from "@/types/ticket";
import { AssigneePicker, type AssignableUser } from "@/components/shared/AssigneePicker";
import { EpicPicker, type EpicOption } from "@/components/shared/EpicPicker";
import { EpicBadge } from "@/components/shared/IssueMetaBadges";
import { AddEpicPill } from "@/components/shared/AddEpicPill";
import { HoverRevealSlot } from "@/components/shared/HoverRevealSlot";
import { Checkbox } from "@/components/shared/Checkbox";
import type { InlineTagId } from "@/components/sprint-board/filter-bar-types";
import { Avatar } from "@/components/shared/Avatar";
import { Flag, MessageSquare, Pencil, Check, X, Boxes, IterationCw, GripVertical, AlertTriangle } from "lucide-react";
import { OpenSubtasksIndicator } from "@/components/sprint-board/OpenSubtasksIndicator";
import type { TicketSessionEntry } from "@/hooks/useTicketSessionMap";
import { RefinementGemTrigger, type RefinementCardTicketInfo } from "@/components/sprint-board/RefinementGemHoverCard";
import type { PipelineHealthEntry, LastDeployedInfo } from "@/hooks/usePipelines";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EditStateDot, QualityBadge } from "@/components/sprint-board/TicketTableCells";
import { Tooltip } from "@/components/shared/Tooltip";
import { BusinessValuePicker } from "@/components/shared/BusinessValuePicker";
import { EstimatePicker } from "@/components/shared/EstimatePicker";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { prefetchTicketPage } from "@/lib/prefetch";

const ALL_TAGS: Set<InlineTagId> = new Set(["flag", "refinement", "quality", "notes", "poReadiness", "editState", "storyPoints", "businessValue", "epic", "assignee"]);

export interface BoardRowBaseProps {
  ticket: Ticket;
  ticketIdx: number;
  isChecked: boolean;
  isSelected: boolean;
  isFocused?: boolean;
  isInflight?: boolean;
  /** Highlighted because the open row context menu targets this row. */
  isContextTarget?: boolean;
  someChecked: boolean;
  isDragActive: boolean;
  /** Which secondary signals are shown inline. Omitted = all (BRDG-239). */
  tags?: Set<InlineTagId>;
  /** Suppress the epic chip (e.g. when the board is grouped by epic). */
  hideEpic?: boolean;
  /**
   * Estimate-hygiene problems for this ticket, shown as width-gated labels while the
   * warning filter mode is active (BRDG-313). Empty/undefined renders nothing, so the
   * labels only appear when the parent sets them (i.e. while the mode is on).
   */
  warningLabels?: string[];
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
   * Last row in its card: rounds the row surface's bottom corners so the hover/selection
   * fill follows the card's rounded edge instead of bleeding square into the corners. The
   * card lets content bleed past its edge (overflow-clip-margin) so the drag handle can
   * straddle the left border, which is why the corners need rounding here per-row.
   */
  isLastInCard?: boolean;
  rowStyle?: React.CSSProperties;
  dragListeners?: ReturnType<typeof useSortable>["listeners"];
  dragAttributes?: ReturnType<typeof useSortable>["attributes"];
  "data-index"?: number;
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
    someChecked,
    isDragActive,
    tags = ALL_TAGS,
    hideEpic = false,
    warningLabels,
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
    isLastInCard = false,
    rowStyle,
    dragListeners,
    dragAttributes,
    "data-index": dataIndex,
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
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const titleEditContainerRef = useRef<HTMLDivElement>(null);

  useOutsideClick(titleEditContainerRef, () => onEditingTitleKeyChange?.(null), { enabled: isEditingTitle, escapeClose: false });

  const autoSizeTextarea = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const isFollowed = followedKeys?.includes(ticket.key) ?? false;
  const lastDeploy = lastDeployedMap?.[ticket.key];
  const health = healthMap?.[ticket.key];
  const isRemoved = Boolean(ticket.removedFromJiraAt);
  // Deprecated stories carry no planning metrics, so an empty SP/BV is suppressed
  // entirely here (no hover placeholder). A deprecated ticket that still carries a
  // value keeps showing it.
  const isDeprecated = ticket.jiraStatus === "DEPRECATED";

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
  // A ticket being refined is estimated with real story points only — no guess to
  // see or fill (BRDG-323). So the guess lifecycle is dropped on rows that are in a
  // refinement session, even while planning mode is on elsewhere.
  const inRefinementSession = Boolean(refinementSessions && refinementSessions.length > 0);
  const estimatePlanning = planningOn && Boolean(onGuestimationChange) && !inRefinementSession;
  const estimateSet = !spEmpty || (estimatePlanning && !guessEmpty);
  // While the estimate popover is open, hold its slot fixed so picking a guess
  // does not remount it (which would close the dropdown before you can commit).
  const estimateInValue = estimateSlotFrozen ? estimateSlotFrozen === "value" : estimateSet;
  const showEstimateValue = tags.has("storyPoints") && estimateInValue;
  const showEstimatePlaceholder = tags.has("storyPoints") && !estimateInValue && !isDeprecated;
  const handleEstimateOpenChange = (open: boolean) => {
    setMetaPickerOpen(open);
    setEstimateSlotFrozen(open ? (estimateSet ? "value" : "placeholder") : null);
  };
  const showEpicPlaceholder = tags.has("epic") && !hideEpic && !ticket.epic && Boolean(onEpicChange) && !isRemoved;

  // Checkbox always visible when checked or when any row is checked (bulk mode)
  const showCheckbox = isChecked || someChecked;

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

  return (
    <tr
      ref={ref}
      data-index={dataIndex}
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
        onSelectTicket(ticket.key === selectedTicket ? null : ticket.key);
      }}
      {...dragListeners}
      {...dragAttributes}
    >
      <td className="p-0">
        {/* Horizontal gutters: pl-4 + the issue-icon's internal padding reads as ~24px on the
            left, so the right uses pr-[23px] to make the assignee sit the same distance from
            the edge as the issue icon does on the left. Rows are line-less and use py-3 for an
            airier rhythm (BRDG-239, "B+C").
            The row surface (background, left accent, hover) lives on this div rather than the
            <tr>: a div honours border-radius, so the last row can round its bottom corners to
            the card edge. A <tr>/<td> with border-collapse ignores radius, which is why the
            hover fill used to bleed square into the card's rounded corners. */}
        <div className={`group/row @container/boardrow relative flex items-center gap-2 border-l-[3px] py-2.5 pl-4 pr-[23px] transition-colors duration-100 ${
          dragListeners ? "cursor-grab active:cursor-grabbing select-none" : "cursor-pointer"
        } ${
          isSelected || isContextTarget
            ? "bg-[var(--color-brand-600)]/12 border-l-[var(--color-brand-300)]"
            : isChecked
            ? "bg-[var(--color-brand-500)]/6 border-l-[var(--color-brand-300)] hover:bg-[var(--color-brand-500)]/10"
            : ticket.flagged
            ? "bg-[color-mix(in_srgb,var(--color-status-error)_6%,transparent)] border-l-[var(--color-status-error)] hover:bg-[color-mix(in_srgb,var(--color-status-error)_8%,transparent)]"
            : "border-l-transparent hover:bg-overlay-subtle hover:border-l-[var(--color-brand-400)]/25"
        } ${isFocused && !isSelected && !isContextTarget ? "outline outline-1 -outline-offset-1 outline-[var(--color-brand-500)]/40" : ""} ${isRemoved ? "opacity-50" : isDeprecated ? "opacity-60" : isInflight ? "opacity-70" : ""} ${isLastInCard ? "rounded-b-[11px]" : ""}`}>
          {/* Drag affordance in the left gutter (Jira-style). Visual only: the whole row is the
              drag activator, so this never needs its own listeners. Shown only when reordering
              is possible (dragListeners present) and never during multiselect. */}
          {dragListeners && !someChecked && (
            <span
              aria-hidden
              className="pointer-events-none absolute -left-[3px] top-1/2 flex h-6 w-[18px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border border-border-subtle bg-[var(--color-surface-elevated)] text-text-tertiary opacity-0 shadow-[var(--shadow-sm)] transition-opacity duration-150 group-hover/row:opacity-100"
            >
              <GripVertical size={12} strokeWidth={1.5} />
            </span>
          )}

          {/* Dedicated checkbox gutter on every row: always reserves space so content never
              shifts. The checkbox itself stays hidden until row hover (or when a selection is
              active) - see the `checkbox` definition above. */}
          <div
            className="flex w-3.5 shrink-0 cursor-pointer items-center justify-center"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onCheckboxClick(ticket.key, ticketIdx, e.shiftKey); }}
          >
            {checkbox}
          </div>

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
            {tags.has("editState") && !isRemoved && ticket.editState === "draft" && <EditStateDot state="draft" />}
            {tags.has("editState") && !isRemoved && ticket.editState === "local_edits" && <EditStateDot state="local_edits" />}
            {tags.has("editState") && !isRemoved && ticket.editState === "conflict" && <EditStateDot state="conflict" />}
          </div>

          {isEditingTitle ? (
            <div ref={titleEditContainerRef} className="z-20 flex min-w-0 flex-1 items-start gap-1" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
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
                {/* Warning: open subtasks on an otherwise-done ticket. Self-hides in every other case. */}
                <OpenSubtasksIndicator
                  ticketKey={ticket.key}
                  jiraStatus={ticket.jiraStatus}
                  openCount={ticket.openSubtaskCount ?? 0}
                  totalCount={ticket.totalSubtaskCount ?? 0}
                  onCloseSubtasks={onCloseSubtasks}
                />
                <span className="min-w-0 truncate text-body-lg">{ticket.title}</span>
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

              {/* Per-row estimate-hygiene labels (BRDG-313). Shown only while the warning
                  filter mode is active (the parent only passes warningLabels then) and only
                  when the row is wide enough: gated by display (not opacity) so narrow rows
                  reserve no space. shrink-0 + placement after the truncating title means the
                  title yields width first. Same warning tokens as the header triangle. */}
              {warningLabels && warningLabels.length > 0 && (
                <span className="hidden shrink-0 items-center gap-1.5 @[52rem]/boardrow:inline-flex">
                  {warningLabels.map((labelText) => (
                    <span
                      key={labelText}
                      className="inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] leading-none text-[color-mix(in_srgb,var(--color-status-warning)_80%,var(--color-text-secondary))] bg-[color-mix(in_srgb,var(--color-status-warning)_6%,transparent)]"
                    >
                      <AlertTriangle size={11} strokeWidth={2} className="shrink-0 opacity-70" aria-hidden />
                      {labelText}
                    </span>
                  ))}
                </span>
              )}

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
                <Flag className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-status-error)" }} fill="currentColor" strokeWidth={0} />
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

              {/* Assignee — right-aligned. Clickable avatar opens the people
                  picker inline, mirroring the ticket sidebar. */}
              {tags.has("assignee") && (
                <div
                  className="ml-1.5 shrink-0"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  {!isRemoved && onAssigneeChange ? (
                    <AssigneePicker
                      value={ticket.assignee ?? null}
                      onChange={(u) => onAssigneeChange(ticket.key, u)}
                      variant="avatar"
                      avatarSize={26}
                      align="right"
                    />
                  ) : (
                    <Avatar assignee={ticket.assignee} size={26} />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}));

export const SortableBoardRow = memo(function SortableBoardRow(props: Omit<BoardRowBaseProps, "rowStyle" | "dragListeners" | "dragAttributes" | "data-index"> & {
  sortableData?: Record<string, unknown>;
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

  const rowStyle = useMemo<React.CSSProperties>(() => ({
    transform: isDragging ? undefined : CSS.Transform.toString(transform) || undefined,
    transition: isDragging ? undefined : transition ?? undefined,
    ...(isDragging ? {
      opacity: 0.3,
      outline: "1px dashed var(--color-overlay-strong)",
      outlineOffset: "-1px",
    } : {}),
  }), [isDragging, transform, transition]);

  const { sortableData: _sortableData, ...rowProps } = props;

  return (
    <BoardRow
      {...rowProps}
      ref={setNodeRef}
      rowStyle={rowStyle}
      dragListeners={listeners}
      dragAttributes={attributes}
    />
  );
});
