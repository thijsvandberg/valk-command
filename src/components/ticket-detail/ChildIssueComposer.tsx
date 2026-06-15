"use client";

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Pencil, X } from "lucide-react";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { usePickerState } from "@/components/shared/BasePicker";
import type { IssueType } from "@/types/ticket";

// Shared issue-type options for child creation, used by both the bottom composer
// in EpicChildrenSection and the per-sprint composer in EpicChildrenBySprint, so
// the selector and its Jira mapping cannot drift between the two.
export const CHILD_ISSUE_TYPES: { value: IssueType; label: string; jiraType: string }[] = [
  { value: "story", label: "Story", jiraType: "Story" },
  { value: "bug", label: "Bug", jiraType: "Bug" },
  { value: "task", label: "Task", jiraType: "Task" },
  { value: "spike", label: "Spike", jiraType: "Spike" },
];

interface ChildIssueComposerProps {
  /** Create a child of the chosen type. Receives the trimmed title and the Jira type name. */
  onCreate: (title: string, jiraType: string) => void;
  /** Fired on Escape when the input is already empty (e.g. close the per-sprint composer). */
  onEscapeEmpty?: () => void;
  placeholder?: string;
  /** Reserve a fixed width on the type button so the input aligns with the key column. */
  alignKey?: boolean;
  autoFocus?: boolean;
  /** Extra controls pinned to the right (e.g. the bottom composer's "Link existing"). */
  trailing?: ReactNode;
  /** Extra classes on the row container (border, etc.). */
  className?: string;
  /**
   * Visual treatment. "default" is the inline row used by the epic child views.
   * "bar" is the sprint-board create row (BRDG-315): a raised inset bar floating in a
   * faint footer strip, with a pill type chip and an "Enter to add" hint.
   */
  variant?: "default" | "bar";
  /** When true, the type dropdown offers a "Placeholder" option (BRDG-304) so the same
   *  create flow makes a Bridge-local placeholder instead of a real Jira issue. */
  allowPlaceholder?: boolean;
  /** Create a Bridge-local placeholder with the given title (used when Placeholder is the
   *  selected "type"). */
  onCreatePlaceholder?: (title: string) => void;
}

// The create row: an issue-type dropdown plus a title input. Enter creates and
// clears (staying focused for rapid entry); Escape clears, then closes on a second
// press. The type picker closes on selection and when the input regains focus.
export function ChildIssueComposer({
  onCreate,
  onEscapeEmpty,
  placeholder = "Create child issue...",
  alignKey,
  autoFocus,
  trailing,
  className = "",
  variant = "default",
  allowPlaceholder = false,
  onCreatePlaceholder,
}: ChildIssueComposerProps) {
  const [title, setTitle] = useState("");
  const [selectedType, setSelectedType] = useState<IssueType>("story");
  // Placeholder mode (BRDG-304): the dropdown's "Placeholder" entry switches the
  // composer to create a Bridge-local placeholder instead of a real Jira issue.
  const [isPlaceholder, setIsPlaceholder] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Portal the type menu so it escapes the surrounding card's overflow-clip and
  // auto-flips up near the viewport bottom instead of being cut off.
  const { open, pos, triggerRef, popoverRef, handleOpen, handleClose, getPopoverStyle } =
    usePickerState({ align: "left", popoverHeight: 180 });

  const currentTypeConfig = CHILD_ISSUE_TYPES.find((t) => t.value === selectedType) ?? CHILD_ISSUE_TYPES[0];

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    if (isPlaceholder && onCreatePlaceholder) {
      onCreatePlaceholder(trimmed);
    } else {
      onCreate(trimmed, currentTypeConfig.jiraType);
    }
    setTitle("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      if (title) {
        setTitle("");
      } else if (onEscapeEmpty) {
        onEscapeEmpty();
      } else {
        inputRef.current?.blur();
      }
    }
  };

  const typeMenu =
    open && pos && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popoverRef}
            // surface-elevated (not literal white) so the popover is opaque in both themes (BRDG-315).
            className="fixed z-[9999] min-w-[160px] overflow-hidden rounded-lg border border-border-default bg-[var(--color-surface-elevated)] shadow-[var(--shadow-popover)]"
            style={getPopoverStyle()}
          >
            {CHILD_ISSUE_TYPES.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setSelectedType(opt.value);
                  setIsPlaceholder(false);
                  handleClose();
                  inputRef.current?.focus();
                }}
                className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-body-lg transition-colors duration-150 hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-overlay-subtle/80 ${
                  opt.value === selectedType && !isPlaceholder ? "text-text-primary" : "text-text-secondary"
                }`}
              >
                <IssueTypeIcon type={opt.value} size={15} strokeWidth={2} />
                <span>{opt.label}</span>
              </button>
            ))}
            {/* Placeholder (BRDG-304): a provisional, Bridge-local stand-in created via the
                same flow, set apart by a dashed pencil entry below the real issue types. */}
            {allowPlaceholder && (
              <>
                <div className="my-1 border-t border-border-subtle" />
                <button
                  type="button"
                  onClick={() => {
                    setIsPlaceholder(true);
                    handleClose();
                    inputRef.current?.focus();
                  }}
                  className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-body-lg transition-colors duration-150 hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-overlay-subtle/80 ${
                    isPlaceholder ? "text-text-primary" : "text-text-secondary"
                  }`}
                >
                  <Pencil size={15} strokeWidth={2} className="text-text-muted" />
                  <span>Placeholder</span>
                </button>
              </>
            )}
          </div>,
          document.body,
        )
      : null;

  // In placeholder mode, reflect it in the input hint too (e.g. "Create story in X" -> "Create placeholder in X").
  const effectivePlaceholder = isPlaceholder
    ? placeholder.replace(/Create (?:issue|story|child issue)/i, "Create placeholder")
    : placeholder;

  const input = (
    <input
      ref={inputRef}
      type="text"
      value={title}
      autoFocus={autoFocus}
      onChange={(e) => setTitle(e.target.value)}
      onKeyDown={handleKeyDown}
      onFocus={() => handleClose()}
      placeholder={effectivePlaceholder}
      className="min-w-0 flex-1 bg-transparent text-body-lg text-text-primary placeholder:text-text-muted outline-none"
    />
  );

  if (variant === "bar") {
    // Raised inset bar floating in a faint footer strip (the chosen B3d treatment).
    return (
      <div
        className={`bg-[var(--color-surface-chrome)]/40 p-3 lg:p-4 ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex items-center gap-3 rounded-lg border border-border-default bg-[var(--color-surface-elevated)] px-3 py-2 shadow-[var(--shadow-sm)]">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => (open ? handleClose() : handleOpen())}
            className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border bg-[var(--color-surface-elevated)] px-2.5 py-1 text-text-secondary transition-colors duration-150 hover:border-[var(--color-brand-400)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${isPlaceholder ? "border-dashed border-border-strong" : "border-border-default"}`}
          >
            {isPlaceholder ? <Pencil size={13} strokeWidth={2} /> : <IssueTypeIcon type={selectedType} size={13} strokeWidth={2} />}
            <span className="text-body-sm font-medium">{isPlaceholder ? "Placeholder" : currentTypeConfig.label}</span>
            <ChevronDown size={10} className="text-text-muted" />
          </button>
          {typeMenu}
          {input}
          {/* The hint and a trailing control would crowd the right edge; show the hint only when
              there is no trailing element (e.g. the epic view's "Link existing"). */}
          {!trailing && (
            <button
              type="button"
              onClick={submit}
              disabled={!title.trim()}
              className="shrink-0 cursor-pointer rounded border border-border-subtle px-1.5 py-0.5 text-label font-medium text-text-muted transition-colors duration-150 hover:enabled:border-[var(--color-brand-400)] hover:enabled:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] disabled:cursor-default disabled:opacity-60"
            >
              ↵ to add
            </button>
          )}
          {trailing}
          {onEscapeEmpty && (
            <button
              type="button"
              onClick={onEscapeEmpty}
              aria-label="Close"
              className="shrink-0 cursor-pointer rounded p-1 text-text-muted transition-colors duration-150 hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
            >
              <X size={14} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative flex items-center gap-3 px-3 py-2 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {isPlaceholder ? <Pencil size={14} strokeWidth={2} className="text-text-muted" /> : <IssueTypeIcon type={selectedType} size={14} strokeWidth={2} />}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => (open ? handleClose() : handleOpen())}
          className="flex cursor-pointer items-center gap-1 rounded py-0.5 text-text-muted transition-colors duration-150 hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          style={alignKey ? { minWidth: 69 } : undefined}
        >
          <span className="text-body-sm font-medium text-text-muted">{isPlaceholder ? "Placeholder" : currentTypeConfig.label}</span>
          <ChevronDown size={10} className="text-text-muted" />
        </button>
        {typeMenu}
      </div>

      {input}

      {trailing}
    </div>
  );
}
