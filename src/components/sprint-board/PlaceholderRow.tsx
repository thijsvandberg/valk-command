"use client";

import { memo, useCallback, useRef, useState } from "react";
import { Pencil, SquarePen, MessageSquare, Check, X, SquareArrowUpRight, IterationCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PlaceholderTicket } from "@/types/ticket";
import { getSpColor } from "@/types/ticket";
import { EstimatePicker } from "@/components/shared/EstimatePicker";
import { BusinessValuePicker } from "@/components/shared/BusinessValuePicker";
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
      className={`flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
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

// Forward-planning placeholder row (BRDG-304). A deliberately provisional surface:
// dashed/ghosted, badged "Placeholder", carrying the BRDG-321/323 "penciled in"
// slate motif so it is unmistakably not a real ticket. It exposes NO Jira controls
// (no status workflow, assignee, follow/review) and never navigates to /tickets/:key
// because it has no Jira key. Editing content/BV/guestimation and promoting are the
// only actions.

const TONE = getSpColor(1);
const SLATE_FG = TONE.text;
const SLATE_BG = TONE.bg;
const DASH = `color-mix(in srgb, ${SLATE_FG} 38%, transparent)`;
const GHOST_BG = `color-mix(in srgb, ${TONE.solid} 5%, transparent)`;

export interface PlaceholderRowProps {
  placeholder: PlaceholderTicket;
  /** Show the sprint name inline (multi-sprint views). */
  showSprint?: boolean;
  sprintNameMap?: Record<string, string>;
  onUpdate: (id: string, patch: Partial<PlaceholderTicket>) => void;
  onDelete: (id: string) => void;
  onPromote: (id: string) => void;
  isLastInCard?: boolean;
}

export const PlaceholderRow = memo(function PlaceholderRow({
  placeholder,
  showSprint = false,
  sprintNameMap = {},
  onUpdate,
  onDelete,
  onPromote,
  isLastInCard = false,
}: PlaceholderRowProps) {
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(placeholder.title);
  const [descDraft, setDescDraft] = useState(placeholder.description);
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

  return (
    <div
      className={`group/phrow relative flex items-start gap-2 border-l-[3px] border-l-transparent py-2.5 pl-3 pr-3 transition-colors duration-100 ${isLastInCard ? "rounded-b-[11px]" : ""}`}
      style={{ backgroundColor: GHOST_BG }}
      data-placeholder-id={placeholder.id}
    >
      {/* Provisional badge: pencil motif + slate "Placeholder" pill (BRDG-304). */}
      <span
        className="mt-0.5 flex h-6 shrink-0 items-center gap-1 rounded-md border border-dashed px-1.5 text-[11px] font-medium leading-none"
        style={{ color: SLATE_FG, backgroundColor: SLATE_BG, borderColor: DASH }}
        title="Placeholder - a provisional, Bridge-local forward-planning stand-in"
      >
        <Pencil size={11} strokeWidth={2} aria-hidden />
        Placeholder
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
              className="flex h-6 items-center gap-1 rounded border border-border-strong bg-[var(--color-surface-elevated)] px-2 text-[11px] font-medium text-text-secondary transition-colors duration-100 hover:text-text-primary cursor-pointer"
            >
              <Check size={12} strokeWidth={2} /> Save
            </button>
            <button
              type="button"
              onClick={cancel}
              className="flex h-6 items-center gap-1 rounded px-2 text-[11px] text-text-muted transition-colors duration-100 hover:text-text-secondary cursor-pointer"
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
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-text-secondary cursor-pointer"
            title="Edit placeholder title"
          >
            <span className="min-w-0 truncate text-body-lg">{placeholder.title}</span>
            <Pencil
              size={11}
              strokeWidth={1.5}
              className="hidden shrink-0 text-text-muted group-hover/phrow:block"
              aria-hidden
            />
          </button>

          {hasDescription && (
            <span className="mt-1 shrink-0" title={placeholder.description}>
              <MessageSquare className="h-3.5 w-3.5 text-text-muted" strokeWidth={1.5} />
            </span>
          )}

          {showSprint && placeholder.sprintId && (
            <span
              className="mt-0.5 inline-flex h-5 min-w-0 shrink items-center gap-1 truncate whitespace-nowrap rounded-md px-1.5 text-[11px] leading-none text-text-tertiary"
              style={{ backgroundColor: "var(--color-overlay-subtle)" }}
              title={sprintNameMap[placeholder.sprintId] ?? placeholder.sprintName ?? placeholder.sprintId}
            >
              <IterationCw size={10} strokeWidth={1.75} className="shrink-0 opacity-70" />
              {sprintNameMap[placeholder.sprintId] ?? placeholder.sprintName ?? placeholder.sprintId}
            </span>
          )}

          {/* Guestimation (no real SP on a placeholder) + business value. */}
          <span className="mt-0.5 shrink-0" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <EstimatePicker
              storyPoints={null}
              guestimation={placeholder.guestimation}
              onStoryPointsChange={() => {}}
              onGuestimationChange={(v) => onUpdate(placeholder.id, { guestimation: v })}
              planningMode
              guessOnly
              dense
              showMetricIcon
              richTooltip
            />
          </span>
          <span className="mt-0.5 shrink-0" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <BusinessValuePicker
              value={placeholder.businessValue}
              onChange={(v) => onUpdate(placeholder.id, { businessValue: v })}
              dense
              showMetricIcon
              richTooltip
            />
          </span>

          {/* Hover-revealed actions, spelled out like the subtask rows: convert into a
              real ticket, edit content, or delete. */}
          <span className="mt-0.5 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-100 group-hover/phrow:opacity-100">
            <PhActionButton
              icon={SquareArrowUpRight}
              label="Convert to ticket"
              title="Convert this placeholder into a real ticket"
              onClick={() => onPromote(placeholder.id)}
            />
            <PhActionButton
              icon={SquarePen}
              label="Edit"
              title="Edit placeholder content"
              onClick={openEditor}
            />
            <PhActionButton
              icon={X}
              label="Delete"
              title="Delete placeholder"
              tone="danger"
              onClick={() => onDelete(placeholder.id)}
            />
          </span>
        </>
      )}
    </div>
  );
});
