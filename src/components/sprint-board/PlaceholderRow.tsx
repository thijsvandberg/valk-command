"use client";

import { memo, useCallback, useRef, useState, type ReactNode } from "react";
import { BookDashed, MessageSquare, Check, X, SquareArrowUpRight, IterationCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PlaceholderTicket } from "@/types/ticket";
import { getSpColor } from "@/types/ticket";
import { EstimatePicker } from "@/components/shared/EstimatePicker";
import { BusinessValuePicker } from "@/components/shared/BusinessValuePicker";
import { HoverRevealSlot } from "@/components/shared/HoverRevealSlot";
import { useOutsideClick } from "@/hooks/useOutsideClick";

// Hover action button, mirroring the subtask row's Edit/Delete treatment exactly
// (SubtasksSection): small text+icon, muted by default, red on hover for the
// destructive one.
function PhActionButton({
  icon: Icon,
  label,
  title,
  onClick,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  title: string;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
      className={`flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-label font-medium text-text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
        tone === "danger"
          ? "hover:bg-red-500/10 hover:text-red-500 active:bg-red-500/15"
          : "hover:bg-overlay-subtle hover:text-text-secondary active:bg-overlay-subtle/80"
      }`}
    >
      <Icon size={tone === "danger" ? 14 : 13} strokeWidth={2} />
      <span>{label}</span>
    </button>
  );
}

// Forward-planning placeholder row (BRDG-304/328). Reads like a real ticket row
// (ChildIssueRow geometry): a BookDashed icon + a status-style "Placeholder" pill in
// the leading slot, with the key column reserved so titles align with real rows. It
// exposes NO Jira controls and never navigates to /tickets/:key (it has no Jira key).
// SP/BV follow the real story-row show-when-set / hover-reveal logic; Convert + Delete
// overlay the content on hover (so width never changes). In the epic view the row is
// made draggable by a useSortable wrapper that passes dragHandleSlot/style/dndProps.

const TONE = getSpColor(1);
const SLATE_FG = TONE.text;
const SLATE_BG = TONE.bg;

export interface PlaceholderRowProps {
  placeholder: PlaceholderTicket;
  /** Show the sprint name inline (multi-sprint views). */
  showSprint?: boolean;
  sprintNameMap?: Record<string, string>;
  onUpdate: (id: string, patch: Partial<PlaceholderTicket>) => void;
  onDelete: (id: string) => void;
  onPromote: (id: string) => void;
  isLastInCard?: boolean;
  /** Reserve a leading checkbox-width gutter so the icon/title align with sibling rows
   *  that show a (possibly hidden) selection checkbox: always on the Sprint Board's
   *  BoardRow, and on epic rows when the checkboxes field is enabled. */
  reserveCheckboxGutter?: boolean;
  /** Drag handle (epic view); rendered in the left gutter like ChildIssueRow. */
  dragHandleSlot?: ReactNode;
  /** DnD transform/transition styles from useSortable. */
  style?: React.CSSProperties;
  /** DnD attributes spread on the row. */
  dndProps?: Record<string, unknown>;
  className?: string;
}

export const PlaceholderRow = memo(function PlaceholderRow({
  placeholder,
  showSprint = false,
  sprintNameMap = {},
  onUpdate,
  onDelete,
  onPromote,
  isLastInCard = false,
  reserveCheckboxGutter = false,
  dragHandleSlot,
  style,
  dndProps,
  className = "",
}: PlaceholderRowProps) {
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(placeholder.title);
  const [descDraft, setDescDraft] = useState(placeholder.description);
  // Keeps the empty SP/BV hover placeholders open while any picker popover is open
  // (the popover is portaled, so its focus no longer lives in the row).
  const [metaPickerOpen, setMetaPickerOpen] = useState(false);
  // Freeze the estimate's slot (value vs placeholder) while its popover is open, so
  // picking a guess does not flip slots and remount the picker mid-edit (BRDG-323).
  const [estimateSlotFrozen, setEstimateSlotFrozen] = useState<null | "value" | "placeholder">(null);
  const editRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLTextAreaElement>(null);

  const autoSize = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const openEditor = useCallback(() => {
    setTitleDraft(placeholder.title);
    setDescDraft(placeholder.description);
    setEditing(true);
    requestAnimationFrame(() => {
      const ta = titleInputRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
        autoSize(ta);
      }
    });
  }, [placeholder.title, placeholder.description, autoSize]);

  const save = useCallback(() => {
    const title = titleDraft.trim();
    const patch: Partial<PlaceholderTicket> = {};
    if (title && title !== placeholder.title) patch.title = title;
    if (descDraft !== placeholder.description) patch.description = descDraft;
    if (Object.keys(patch).length > 0) onUpdate(placeholder.id, patch);
    setEditing(false);
  }, [titleDraft, descDraft, placeholder.id, placeholder.title, placeholder.description, onUpdate]);

  const cancel = useCallback(() => setEditing(false), []);

  useOutsideClick(editRef, save, { enabled: editing, escapeClose: false });

  const hasDescription = placeholder.description.trim().length > 0;

  // SP/BV visibility mirrors a real story row (BRDG-310): a set value renders inline;
  // an empty value reserves no space and only surfaces on row hover.
  const guessEmpty = placeholder.guestimation == null || placeholder.guestimation === 0;
  const bvEmpty = placeholder.businessValue == null || placeholder.businessValue === 0;
  const estimateInValue = estimateSlotFrozen ? estimateSlotFrozen === "value" : !guessEmpty;
  const handleEstimateOpenChange = (open: boolean) => {
    setMetaPickerOpen(open);
    setEstimateSlotFrozen(open ? (!guessEmpty ? "value" : "placeholder") : null);
  };

  const estimatePicker = (
    <EstimatePicker
      storyPoints={null}
      guestimation={placeholder.guestimation}
      onStoryPointsChange={() => {}}
      onGuestimationChange={(v) => onUpdate(placeholder.id, { guestimation: v })}
      planningMode
      guessOnly
      onOpenChange={handleEstimateOpenChange}
      dense
      showMetricIcon
      richTooltip
    />
  );
  const bvPicker = (
    <BusinessValuePicker
      value={placeholder.businessValue}
      onChange={(v) => onUpdate(placeholder.id, { businessValue: v })}
      onOpenChange={setMetaPickerOpen}
      dense
      showMetricIcon
      richTooltip
    />
  );

  return (
    <div
      style={style}
      className={`group/row @container/boardrow relative flex items-center gap-2 py-[7px] pl-4 pr-3 hover:bg-overlay-subtle ${isLastInCard ? "rounded-b-[11px]" : ""} ${className}`}
      data-placeholder-id={placeholder.id}
      {...(dndProps ?? {})}
    >
      {/* Drag handle in the left gutter (epic view), over the leading edge so it never
          pushes content right; revealed on hover. Mirrors ChildIssueRow. */}
      {dragHandleSlot && (
        <span className="absolute left-0 top-1/2 z-10 flex h-6 w-[18px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border border-border-subtle bg-[var(--color-surface-elevated)] text-text-tertiary opacity-0 shadow-[var(--shadow-sm)] transition-opacity duration-150 group-hover/row:opacity-100 focus-within:opacity-100">
          {dragHandleSlot}
        </span>
      )}

      {/* Reserved selection-checkbox gutter so the icon + title line up with sibling rows
          (BoardRow always; epic rows when the checkboxes field is on). */}
      {reserveCheckboxGutter && <span className="w-3.5 shrink-0" aria-hidden />}

      {/* Leading cluster, matching TicketStatusPill's list/lg geometry: a dashed-bookmark
          icon (in the issue-type-icon slot) + a reserved key column (placeholders have no
          key, so titles still align) + a status-style "Placeholder" pill. */}
      <span className="relative flex shrink-0 items-center gap-1.5">
        <span className="flex items-center justify-center rounded p-1" aria-hidden>
          <BookDashed size={14} strokeWidth={1.75} style={{ color: SLATE_FG }} />
        </span>
        <span className="-ml-1 font-mono text-body-sm" style={{ minWidth: "9ch" }} aria-hidden />
        <span
          className="flex items-center gap-1 rounded-md px-2 py-0.5 text-label font-medium tracking-wide"
          style={{ backgroundColor: SLATE_BG, color: SLATE_FG, opacity: 0.85 }}
          title="Placeholder - a provisional, Bridge-local forward-planning stand-in"
        >
          <span className="h-2 w-2 shrink-0 rounded-full opacity-70" style={{ backgroundColor: SLATE_FG }} />
          Placeholder
        </span>
      </span>

      {editing ? (
        <div
          ref={editRef}
          className="z-20 flex min-w-0 flex-1 flex-col gap-1.5"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <textarea
            ref={titleInputRef}
            value={titleDraft}
            onChange={(e) => { setTitleDraft(e.target.value); autoSize(e.target); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); }
              else if (e.key === "Escape") cancel();
            }}
            rows={1}
            placeholder="Placeholder title"
            className="min-w-0 resize-none overflow-hidden rounded border border-[var(--color-brand-500)]/40 bg-[var(--color-surface-elevated)] px-1.5 py-1 text-body-lg leading-snug text-text-primary outline-none focus:border-[var(--color-brand-500)]/70"
          />
          <textarea
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") cancel(); }}
            rows={2}
            placeholder="Notes / description (optional)"
            className="min-w-0 resize-y rounded border border-border-default bg-[var(--color-surface-elevated)] px-1.5 py-1 text-body-sm leading-relaxed text-text-secondary outline-none focus:border-[var(--color-brand-500)]/60"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={save}
              className="flex h-6 items-center gap-1 rounded border border-border-strong bg-[var(--color-surface-elevated)] px-2 text-label font-medium text-text-secondary transition-colors duration-100 hover:text-text-primary cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              <Check size={12} strokeWidth={2} /> Save
            </button>
            <button
              type="button"
              onClick={cancel}
              className="flex h-6 items-center gap-1 rounded px-2 text-label text-text-muted transition-colors duration-100 hover:text-text-secondary cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              <X size={12} strokeWidth={2} /> Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={openEditor}
            className="min-w-0 flex-1 truncate text-left text-body-lg text-text-secondary cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            title="Edit placeholder"
          >
            {placeholder.title}
          </button>

          {hasDescription && (
            <span className="shrink-0" title={placeholder.description}>
              <MessageSquare className="h-3.5 w-3.5 text-text-muted" strokeWidth={1.5} />
            </span>
          )}

          {showSprint && placeholder.sprintId && (
            <span
              className="inline-flex h-5 min-w-0 shrink items-center gap-1 truncate whitespace-nowrap rounded-md px-1.5 text-label leading-none text-text-tertiary"
              style={{ backgroundColor: "var(--color-overlay-subtle)" }}
              title={sprintNameMap[placeholder.sprintId] ?? placeholder.sprintName ?? placeholder.sprintId}
            >
              <IterationCw size={10} strokeWidth={1.75} className="shrink-0 opacity-70" />
              {sprintNameMap[placeholder.sprintId] ?? placeholder.sprintName ?? placeholder.sprintId}
            </span>
          )}

          {/* SP (guess) + BV. Set values render inline; empty ones hover-reveal, exactly
              like a real story row. The cluster sits above the actions overlay (z-20) so
              the pickers stay reachable while the actions are shown. */}
          <span className="relative z-20 flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {estimateInValue ? (
              <span className="shrink-0" onPointerDown={(e) => e.stopPropagation()}>{estimatePicker}</span>
            ) : (
              <HoverRevealSlot hideWhenNarrow forceOpen={metaPickerOpen}>{estimatePicker}</HoverRevealSlot>
            )}
            {!bvEmpty ? (
              <span className="shrink-0" onPointerDown={(e) => e.stopPropagation()}>{bvPicker}</span>
            ) : (
              <HoverRevealSlot hideWhenNarrow forceOpen={metaPickerOpen}>{bvPicker}</HoverRevealSlot>
            )}
          </span>

          {/* Actions overlay the row content on hover (ChildIssueRow.actionsSlot pattern):
              a fade masks the title under the buttons; pr clears the SP/BV cluster, which
              stays on top (z-20). Convert + Delete only - the title is click-to-edit. */}
          <div
            className="absolute inset-y-0 right-0 flex items-center gap-1 pl-8 pr-[88px] opacity-0 group-hover/row:opacity-100"
            style={{
              transition: "opacity 0.15s ease",
              background: "linear-gradient(to right, transparent, var(--color-surface-base) 24px)",
            }}
          >
            <PhActionButton
              icon={SquareArrowUpRight}
              label="Convert to ticket"
              title="Convert this placeholder into a real ticket"
              onClick={() => onPromote(placeholder.id)}
            />
            <PhActionButton
              icon={X}
              label="Delete"
              title="Delete placeholder"
              tone="danger"
              onClick={() => onDelete(placeholder.id)}
            />
          </div>
        </>
      )}
    </div>
  );
});
