"use client";

import { useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import type { IssueType } from "@/types/ticket";

// Shared issue-type options for child creation, used by both the bottom composer
// in EpicChildrenSection and the per-sprint composer in EpicChildrenBySprint, so
// the Story/Task/Bug selector and its Jira mapping cannot drift between the two.
export const CHILD_ISSUE_TYPES: { value: IssueType; label: string; jiraType: string }[] = [
  { value: "story", label: "Story", jiraType: "Story" },
  { value: "task", label: "Task", jiraType: "Task" },
  { value: "bug", label: "Bug", jiraType: "Bug" },
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
}: ChildIssueComposerProps) {
  const [title, setTitle] = useState("");
  const [selectedType, setSelectedType] = useState<IssueType>("story");
  const [showTypePicker, setShowTypePicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const typePickerRef = useRef<HTMLDivElement>(null);

  const currentTypeConfig = CHILD_ISSUE_TYPES.find((t) => t.value === selectedType) ?? CHILD_ISSUE_TYPES[0];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = title.trim();
      if (!trimmed) return;
      onCreate(trimmed, currentTypeConfig.jiraType);
      setTitle("");
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

  return (
    <div
      className={`relative flex items-center gap-3 px-3 py-2 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <IssueTypeIcon type={selectedType} size={14} />
      <div className="relative" ref={typePickerRef}>
        <button
          type="button"
          onClick={() => setShowTypePicker((v) => !v)}
          className="flex cursor-pointer items-center gap-1 rounded py-0.5 text-text-muted transition-colors duration-150 hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          style={alignKey ? { minWidth: 69 } : undefined}
        >
          <span className="text-body-sm font-medium text-text-muted">{currentTypeConfig.label}</span>
          <ChevronDown size={10} className="text-text-muted" />
        </button>
        {showTypePicker && (
          <div className="absolute top-full left-0 z-20 mt-1 overflow-hidden rounded-lg border border-border-default bg-[var(--color-surface-elevated)] shadow-[0_4px_12px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.08)]">
            {CHILD_ISSUE_TYPES.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setSelectedType(opt.value);
                  setShowTypePicker(false);
                  inputRef.current?.focus();
                }}
                className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-body-lg transition-colors duration-150 hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-overlay-subtle/80 ${
                  opt.value === selectedType ? "text-text-primary" : "text-text-secondary"
                }`}
              >
                <IssueTypeIcon type={opt.value} size={14} />
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="text"
        value={title}
        autoFocus={autoFocus}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setShowTypePicker(false)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-body-lg text-text-primary placeholder:text-text-muted outline-none"
      />

      {trailing}
    </div>
  );
}
