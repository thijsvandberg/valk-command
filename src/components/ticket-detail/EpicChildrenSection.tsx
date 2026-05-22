"use client";

import { useState, useRef, useCallback } from "react";
import type { TicketDetail, JiraStatus, Subtask, IssueType } from "@/types/ticket";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { tickets, ApiError } from "@/lib/api-client";
import { Loader2, ChevronDown } from "lucide-react";

type StatusFilter = "all" | JiraStatus;

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "TO DO", label: "To Do" },
  { value: "IN PROGRESS", label: "In Progress" },
  { value: "DONE", label: "Done" },
];

const CHILD_ISSUE_TYPES: { value: IssueType; label: string; jiraType: string }[] = [
  { value: "story", label: "Story", jiraType: "Story" },
  { value: "task", label: "Task", jiraType: "Task" },
  { value: "bug", label: "Bug", jiraType: "Bug" },
];

interface EpicChildrenSectionProps {
  items: TicketDetail["epicChildren"];
  ticketKey: string;
  onMutate: () => void;
  onSelectTicket?: (key: string) => void;
}

export function EpicChildrenSection({
  items,
  ticketKey,
  onMutate,
  onSelectTicket,
}: EpicChildrenSectionProps) {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [newTitle, setNewTitle] = useState("");
  const [selectedType, setSelectedType] = useState<IssueType>("story");
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locallyAdded, setLocallyAdded] = useState<Subtask[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const typePickerRef = useRef<HTMLDivElement>(null);

  const mergedItems = [
    ...items,
    ...locallyAdded.filter((la) => !items.some((i) => i.key === la.key)),
  ];

  const filtered = filter === "all"
    ? mergedItems
    : mergedItems.filter((i) => i.jiraStatus === filter);

  const statusCounts = {
    all: mergedItems.length,
    "TO DO": mergedItems.filter((i) => i.jiraStatus === "TO DO").length,
    "IN PROGRESS": mergedItems.filter((i) => i.jiraStatus === "IN PROGRESS").length,
    DONE: mergedItems.filter((i) => i.jiraStatus === "DONE").length,
  };

  const currentTypeConfig = CHILD_ISSUE_TYPES.find((t) => t.value === selectedType) ?? CHILD_ISSUE_TYPES[0];

  const handleCreate = useCallback(() => {
    const title = newTitle.trim();
    if (!title) return;

    const placeholderKey = `pending-${Date.now()}`;
    const placeholder: Subtask = {
      key: placeholderKey,
      title,
      type: selectedType,
      jiraStatus: "TO DO",
      assignee: null,
    };
    setLocallyAdded((prev) => [...prev, placeholder]);
    setNewTitle("");
    setError(null);

    tickets.createChildIssue(ticketKey, { title, issueType: currentTypeConfig.jiraType })
      .then((created) => {
        setLocallyAdded((prev) =>
          prev.map((i) => i.key === placeholderKey ? created : i),
        );
        onMutate();
      })
      .catch((err) => {
        setLocallyAdded((prev) => prev.filter((i) => i.key !== placeholderKey));
        const detail = err instanceof ApiError ? err.message : "Jira API error";
        setError(`Failed to create child issue: ${detail}`);
        console.error("Failed to create child issue:", err);
      });
  }, [newTitle, selectedType, ticketKey, currentTypeConfig.jiraType, onMutate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreate();
    } else if (e.key === "Escape") {
      setNewTitle("");
      inputRef.current?.blur();
    }
  }, [handleCreate]);

  const childRows = filtered.map((child, idx) => {
    const isPending = child.key.startsWith("pending-");
    return (
      <div
        key={child.key}
        className={`flex items-center gap-3 px-3 py-2.5 ${
          onSelectTicket && !isPending ? "cursor-pointer hover:bg-overlay-subtle" : ""
        } ${idx < filtered.length - 1 ? "border-b border-border-subtle" : ""} ${
          isPending ? "opacity-50" : ""
        }`}
        onClick={!isPending && onSelectTicket ? (e) => {
          if (e.metaKey || e.ctrlKey) {
            window.open(`/tickets/${child.key}`, "_blank");
            return;
          }
          onSelectTicket(child.key);
        } : undefined}
      >
        <IssueTypeIcon type={child.type} size={14} />
        {isPending ? (
          <span className="flex items-center gap-1.5 font-mono text-xs text-text-muted">
            <Loader2 size={10} className="animate-spin" />
          </span>
        ) : (
          <span className="font-mono text-xs text-[var(--color-brand-400)]">
            {child.key}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">{child.title}</span>
        <StatusBadge status={child.jiraStatus} />
        <Avatar assignee={child.assignee} size={22} />
      </div>
    );
  });

  const inlineInput = (
    <div
      className="flex items-center gap-2 px-3 py-2"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Type selector */}
      <div className="relative" ref={typePickerRef}>
        <button
          type="button"
          onClick={() => setShowTypePicker((v) => !v)}
          className="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-text-muted transition-colors duration-150 hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-overlay-subtle/80"
        >
          <IssueTypeIcon type={selectedType} size={14} />
          <span className="text-xs font-medium text-text-secondary">{currentTypeConfig.label}</span>
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
                className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-sm transition-colors duration-150 hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-overlay-subtle/80 ${
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
        value={newTitle}
        onChange={(e) => { setNewTitle(e.target.value); setError(null); }}
        onKeyDown={handleKeyDown}
        onFocus={() => setShowTypePicker(false)}
        placeholder="Create child issue..."
        className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
      />
    </div>
  );

  const listContent = (
    <div className="mt-3">
      {filtered.length > 0 && (
        <div className="overflow-hidden rounded-lg rounded-b-none border border-b-0 border-border-default">
          {childRows}
        </div>
      )}
      <div className={`rounded-lg border border-border-default ${filtered.length > 0 ? "rounded-t-none" : ""}`}>
        {inlineInput}
      </div>
    </div>
  );

  return (
    <div className="mt-8">
      <SectionHeader
        title="Child Issues"
        count={filter === "all" ? mergedItems.length : undefined}
        countLabel={filter !== "all" && mergedItems.length > 0 ? `${filtered.length} of ${mergedItems.length}` : undefined}
      />

      {/* Status filter chips */}
      {mergedItems.length > 0 && (
        <div className="mt-3 flex items-center gap-0.5 rounded-lg bg-overlay-subtle p-0.5">
          {FILTER_OPTIONS.map((opt) => {
            const isActive = filter === opt.value;
            const count = statusCounts[opt.value as keyof typeof statusCounts] ?? 0;
            if (opt.value !== "all" && count === 0) return null;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilter(opt.value)}
                className={`cursor-pointer flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                  isActive
                    ? "bg-[var(--color-surface-elevated)] text-text-primary shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                {opt.label}
                <span className={`tabular-nums text-[10px] ${isActive ? "text-text-secondary" : "text-text-muted"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-400/80">{error}</p>
      )}

      {/* Child list + inline input */}
      {filtered.length > 0 ? (
        listContent
      ) : mergedItems.length > 0 ? (
        <>
          <p className="mt-3 text-sm text-text-muted">No child issues matching this filter</p>
          {listContent}
        </>
      ) : (
        listContent
      )}
    </div>
  );
}
