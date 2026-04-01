"use client";

import { useState, useEffect, useRef, useCallback, use } from "react";
import Link from "next/link";
import {
  EPIC_COLORS,
  PO_STATUS_OPTIONS,
  type Ticket,
  type POStatus,
  type Attachment,
  type TicketDetail,
  type StoryVersion,
} from "@/types/ticket";
import { StoryDiff } from "@/components/story-diff/StoryDiff";
import type { DiffMode } from "@/components/story-diff/StoryDiff";
import { exportDiffAsMarkdown } from "@/components/story-diff/export-diff";
import {
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  ExternalLink,
  RefreshCw,
  Flag,
  Pencil,
  Trash2,
  Download,
  Plus,
  Check,
  Loader2,
  Sparkles,
  File,
  FileMinus,
  ChevronsUp,
  ChevronUp,
  Minus,
  ChevronsDown,
  AlertTriangle,
} from "lucide-react";
import { reviewStory, type ReviewResult } from "@/lib/agent-client";
import { useTicketDetail, useJiraSprints, useConflictCheck } from "@/hooks/useSprintBoard";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { StatusBadge, JIRA_STATUS_COLORS } from "@/components/shared/StatusBadge";
import { EpicLabel } from "@/components/shared/EpicLabel";
import { getJiraUrl, QualityBadge } from "@/components/sprint-board/TicketTable";
import { PO_STATUS_COLORS } from "@/components/sprint-board/FilterBar";

// ---------------------------------------------------------------------------
// Color maps (page-specific)
// ---------------------------------------------------------------------------

const PRIORITY_COLORS: Record<string, { icon: string; text: string }> = {
  Highest: { icon: "#e5534b", text: "#e5534b" },
  High: { icon: "#ea8744", text: "#ea8744" },
  Medium: { icon: "#eab308", text: "#eab308" },
  Low: { icon: "#4a90d9", text: "#4a90d9" },
  Lowest: { icon: "#94a3b8", text: "#94a3b8" },
};

// ---------------------------------------------------------------------------
// Page-specific sub-components
// ---------------------------------------------------------------------------

const PRIORITY_ICONS: Record<string, { Icon: React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>; color: string }> = {
  Highest: { Icon: ChevronsUp,   color: "#e5534b" },
  High:    { Icon: ChevronUp,    color: "#ea8744" },
  Medium:  { Icon: Minus,        color: "#eab308" },
  Low:     { Icon: ChevronDown,  color: "#4a90d9" },
  Lowest:  { Icon: ChevronsDown, color: "#94a3b8" },
};

function PriorityIcon({ priority }: { priority: string }) {
  const entry = PRIORITY_ICONS[priority];
  if (!entry) return null;
  const { Icon, color } = entry;
  return <Icon size={14} strokeWidth={2} style={{ color }} />;
}

// ---------------------------------------------------------------------------
// Simple markdown renderer
// ---------------------------------------------------------------------------

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let orderedItems: React.ReactNode[] = [];
  let codeBlock: string[] | null = null;

  function flushList() {
    if (listItems.length > 0) {
      elements.push(<ul key={`ul-${elements.length}`} className="my-2 ml-5 list-disc space-y-1 text-white/60">{listItems}</ul>);
      listItems = [];
    }
    if (orderedItems.length > 0) {
      elements.push(<ol key={`ol-${elements.length}`} className="my-2 ml-5 list-decimal space-y-1 text-white/60">{orderedItems}</ol>);
      orderedItems = [];
    }
  }

  function inlineFormat(text: string): React.ReactNode {
    const parts: React.ReactNode[] = [];
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
    let lastIndex = 0;
    let match;
    let i = 0;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      if (match[2]) {
        parts.push(<strong key={i++} className="font-semibold text-white/80">{match[2]}</strong>);
      } else if (match[3]) {
        parts.push(<em key={i++} className="italic text-white/70">{match[3]}</em>);
      } else if (match[4]) {
        parts.push(<code key={i++} className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.85em] text-[var(--color-brand-300)]">{match[4]}</code>);
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    return parts.length === 1 ? parts[0] : parts;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      flushList();
      if (codeBlock !== null) {
        elements.push(
          <pre key={`code-${elements.length}`} className="my-3 overflow-x-auto rounded-lg border border-white/[0.06] bg-white/[0.03] p-4 font-mono text-sm leading-relaxed text-white/60">
            {codeBlock.join("\n")}
          </pre>
        );
        codeBlock = null;
      } else {
        codeBlock = [];
      }
      continue;
    }

    if (codeBlock !== null) {
      codeBlock.push(line);
      continue;
    }

    if (line.startsWith("## ")) {
      flushList();
      elements.push(<h3 key={`h3-${i}`} className="mt-6 mb-2 font-[var(--font-display)] text-base font-semibold text-white/90">{line.slice(3)}</h3>);
    } else if (line.startsWith("### ")) {
      flushList();
      elements.push(<h4 key={`h4-${i}`} className="mt-4 mb-1.5 text-sm font-semibold text-white/80">{line.slice(4)}</h4>);
    } else if (line.startsWith("- [ ] ")) {
      flushList();
      elements.push(
        <div key={`cb-${i}`} className="my-1 flex items-start gap-2 text-sm text-white/60">
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-white/[0.12] bg-white/[0.03]" />
          <span>{inlineFormat(line.slice(6))}</span>
        </div>
      );
    } else if (line.startsWith("- [x] ")) {
      flushList();
      elements.push(
        <div key={`cb-${i}`} className="my-1 flex items-start gap-2 text-sm text-white/60">
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)]">
            <Check size={10} strokeWidth={1.5} />
          </span>
          <span className="line-through opacity-60">{inlineFormat(line.slice(6))}</span>
        </div>
      );
    } else if (/^- /.test(line)) {
      listItems.push(<li key={`li-${i}`} className="text-sm">{inlineFormat(line.slice(2))}</li>);
    } else if (/^\d+\. /.test(line)) {
      const content = line.replace(/^\d+\.\s*/, "");
      orderedItems.push(<li key={`oli-${i}`} className="text-sm">{inlineFormat(content)}</li>);
    } else if (line.trim() === "") {
      flushList();
      elements.push(<div key={`br-${i}`} className="h-2" />);
    } else {
      flushList();
      elements.push(<p key={`p-${i}`} className="text-sm leading-[1.7] text-white/60">{inlineFormat(line)}</p>);
    }
  }

  flushList();
  return elements;
}

// ---------------------------------------------------------------------------
// Section components
// ---------------------------------------------------------------------------

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 border-b border-white/[0.06] pb-2">
      <h3 className="font-[var(--font-display)] text-sm font-semibold text-white/80">{title}</h3>
      {count !== undefined && count > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/[0.06] px-1.5 text-[10px] font-medium tabular-nums text-white/40">
          {count}
        </span>
      )}
    </div>
  );
}

function AttachmentsSection({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) {
    return (
      <div className="mt-8">
        <SectionHeader title="Attachments" />
        <p className="mt-3 text-sm text-white/25">No attachments</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <SectionHeader title="Attachments" count={attachments.length} />
      <div className="mt-3 grid grid-cols-3 gap-3">
        {attachments.map((att) => (
          <div
            key={att.id}
            className={`group relative overflow-hidden rounded-lg border ${
              att.cleaned
                ? "border-white/[0.04] bg-white/[0.01]"
                : "border-white/[0.06] bg-white/[0.03] cursor-pointer hover:border-white/[0.10] hover:bg-white/[0.04]"
            }`}
          >
            <div
              className="flex h-24 items-center justify-center"
              style={att.cleaned ? {} : { backgroundColor: `${att.color}08` }}
            >
              {att.cleaned ? (
                <div className="flex flex-col items-center gap-1 text-white/15">
                  <FileMinus className="h-6 w-6" strokeWidth={1.5} />
                  <span className="text-[10px]">Cleaned</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1" style={{ color: att.color }}>
                  <File className="h-8 w-8 opacity-40" strokeWidth={1.5} />
                  <span className="text-[10px] font-medium opacity-60">
                    {att.mimeType.split("/")[1].toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <div className="border-t border-white/[0.04] px-2.5 py-2">
              <div className="truncate text-xs text-white/50">{att.filename}</div>
              <div className="mt-0.5 text-[10px] text-white/25">
                {att.cleaned && att.cleanedAt
                  ? `Cleaned ${new Date(att.cleanedAt).toLocaleDateString()}`
                  : `${(att.size / 1000).toFixed(0)} KB`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SubtasksSection({ subtasks }: { subtasks: TicketDetail["subtasks"] }) {
  if (subtasks.length === 0) {
    return (
      <div className="mt-8">
        <SectionHeader title="Subtasks" />
        <p className="mt-3 text-sm text-white/25">No subtasks</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <SectionHeader title="Subtasks" count={subtasks.length} />
      <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.06]">
        {subtasks.map((sub, idx) => {
          const statusColor = JIRA_STATUS_COLORS[sub.jiraStatus] ?? JIRA_STATUS_COLORS["TO DO"];
          return (
            <div
              key={sub.key}
              className={`flex items-center gap-3 px-3 py-2.5 ${
                idx < subtasks.length - 1 ? "border-b border-white/[0.04]" : ""
              }`}
            >
              <IssueTypeIcon type={sub.type} size={14} />
              <Link
                href={`/tickets/${sub.key}`}
                className="font-mono text-xs text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                onClick={(e) => e.stopPropagation()}
              >
                {sub.key}
              </Link>
              <span className="min-w-0 flex-1 truncate text-sm text-white/60">{sub.title}</span>
              <span
                className="shrink-0 rounded px-2 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: statusColor.bg, color: statusColor.text }}
              >
                {sub.jiraStatus}
              </span>
              <Avatar assignee={sub.assignee} size={22} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LinkedIssuesSection({ issues }: { issues: TicketDetail["linkedIssues"] }) {
  if (issues.length === 0) {
    return (
      <div className="mt-8">
        <SectionHeader title="Linked Issues" />
        <p className="mt-3 text-sm text-white/25">No linked items</p>
      </div>
    );
  }

  const grouped = issues.reduce<Record<string, typeof issues>>((acc, issue) => {
    if (!acc[issue.relation]) acc[issue.relation] = [];
    acc[issue.relation].push(issue);
    return acc;
  }, {});

  return (
    <div className="mt-8">
      <SectionHeader title="Linked Issues" count={issues.length} />
      <div className="mt-3 space-y-4">
        {Object.entries(grouped).map(([relation, items]) => (
          <div key={relation}>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/25">
              {relation}
            </div>
            <div className="overflow-hidden rounded-lg border border-white/[0.06]">
              {items.map((item, idx) => {
                const statusColor = JIRA_STATUS_COLORS[item.jiraStatus] ?? JIRA_STATUS_COLORS["TO DO"];
                return (
                  <div
                    key={item.key}
                    className={`flex items-center gap-3 px-3 py-2.5 ${
                      idx < items.length - 1 ? "border-b border-white/[0.04]" : ""
                    }`}
                  >
                    <IssueTypeIcon type={item.type} size={14} />
                    <Link
                      href={`/tickets/${item.key}`}
                      className="font-mono text-xs text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {item.key}
                    </Link>
                    <span className="min-w-0 flex-1 truncate text-sm text-white/60">{item.title}</span>
                    <span
                      className="shrink-0 rounded px-2 py-0.5 text-[10px] font-medium"
                      style={{ backgroundColor: statusColor.bg, color: statusColor.text }}
                    >
                      {item.jiraStatus}
                    </span>
                    <Avatar assignee={item.assignee} size={22} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comments section
// ---------------------------------------------------------------------------

function CommentsSection({
  ticketKey,
  jiraComments,
}: {
  ticketKey: string;
  jiraComments: TicketDetail["jiraComments"];
}) {
  const [poComments, setPoComments] = useState<Array<{ id: string; author: string; content: string; createdAt: string }>>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadComments() {
      try {
        const res = await fetch(`/api/tickets/${ticketKey}/comments`);
        if (res.ok) {
          const data = await res.json();
          setPoComments(data.poComments ?? []);
        }
      } catch (err) {
        console.error("Failed to load comments:", err);
      } finally {
        setLoading(false);
      }
    }
    loadComments();
  }, [ticketKey]);

  const handleAddComment = useCallback(async () => {
    if (!newComment.trim()) return;
    try {
      const res = await fetch(`/api/tickets/${ticketKey}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment.trim() }),
      });
      if (res.ok) {
        const created = await res.json();
        setPoComments((prev) => [...prev, created]);
        setNewComment("");
      }
    } catch (err) {
      console.error("Operation failed:", err);
    }
  }, [ticketKey, newComment]);

  const handleDeleteComment = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/tickets/${ticketKey}/comments/${id}`, { method: "DELETE" });
      if (res.ok) {
        setPoComments((prev) => prev.filter((c) => c.id !== id));
      }
    } catch (err) {
      console.error("Operation failed:", err);
    }
  }, [ticketKey]);

  return (
    <div className="mt-8 space-y-8">
      {/* PO Comments */}
      <div>
        <SectionHeader title="PO Comments" count={poComments.length} />
        <div className="mt-3 space-y-3">
          {/* Add comment */}
          <div className="flex gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-600)] text-[10px] font-semibold text-white">
              PO
            </div>
            <div className="min-w-0 flex-1">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a PO comment..."
                rows={2}
                className="w-full resize-none rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:border-[var(--color-brand-500)]/40 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    handleAddComment();
                  }
                }}
              />
              {newComment.trim() && (
                <div className="mt-1.5 flex justify-end">
                  <button
                    type="button"
                    onClick={handleAddComment}
                    className="rounded-md bg-[var(--color-brand-600)] px-3 py-1 text-xs font-medium text-white cursor-pointer hover:bg-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98]"
                  >
                    Comment
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Existing PO comments */}
          {poComments.map((comment) => (
            <div key={comment.id} className="group flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-600)] text-[10px] font-semibold text-white">
                PO
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-white/60">{comment.author || "Product Owner"}</span>
                  <span className="text-[10px] text-white/25">{new Date(comment.createdAt).toLocaleString()}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteComment(comment.id)}
                    className="ml-auto hidden text-white/20 cursor-pointer hover:text-[#e5534b] group-hover:block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                    title="Delete comment"
                  >
                    <Trash2 size={14} strokeWidth={1.2} />
                  </button>
                </div>
                <p className="mt-1 text-sm leading-[1.7] text-white/50">{comment.content}</p>
              </div>
            </div>
          ))}

          {!loading && poComments.length === 0 && !newComment.trim() && (
            <p className="pl-10 text-xs text-white/20">No comments yet</p>
          )}
        </div>
      </div>

      {/* Jira Comments */}
      {jiraComments.length > 0 && (
        <div>
          <SectionHeader title="Jira Comments" count={jiraComments.length} />
          <div className="mt-3 space-y-4">
            {jiraComments.map((comment) => (
              <div key={comment.id} className="flex gap-3">
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                  style={{ backgroundColor: comment.authorColor }}
                >
                  {comment.authorInitials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-white/60">{comment.authorName}</span>
                    <span className="text-[10px] text-white/25">{new Date(comment.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-1 text-sm leading-[1.7] text-white/50">{comment.content}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local editing: inline title and description editing
// ---------------------------------------------------------------------------

function EditableTitle({
  ticketKey,
  initialTitle,
  onLocalEdit,
}: {
  ticketKey: string;
  initialTitle: string;
  onLocalEdit: (hasEdit: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialTitle);
  const [hasLocalEdit, setHasLocalEdit] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadLocalEdit() {
      try {
        const res = await fetch(`/api/tickets/${ticketKey}/local-edits`);
        if (res.ok) {
          const data = await res.json();
          const titleEdit = data.find?.((e: { field: string }) => e.field === "title");
          if (titleEdit) {
            setValue(titleEdit.localValue);
            setHasLocalEdit(true);
            onLocalEdit(true);
          }
        }
      } catch (err) {
        console.error("Failed to load local title edit:", err);
      }
    }
    loadLocalEdit();
  }, [ticketKey, onLocalEdit]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const save = useCallback(async () => {
    setEditing(false);
    if (value.trim() === initialTitle) {
      setHasLocalEdit(false);
      onLocalEdit(false);
      return;
    }
    try {
      await fetch(`/api/tickets/${ticketKey}/local-edits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: "title", localValue: value.trim() }),
      });
      setHasLocalEdit(true);
      onLocalEdit(true);
    } catch (err) {
      console.error("Operation failed:", err);
    }
  }, [ticketKey, value, initialTitle, onLocalEdit]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") { setValue(hasLocalEdit ? value : initialTitle); setEditing(false); }
        }}
        className="w-full border-b-2 border-[var(--color-brand-500)]/40 bg-transparent font-[var(--font-display)] text-2xl font-semibold leading-tight tracking-[-0.02em] text-white outline-none"
      />
    );
  }

  return (
    <div className="group flex items-start gap-2">
      <h1
        onClick={() => setEditing(true)}
        className="cursor-pointer font-[var(--font-display)] text-2xl font-semibold leading-tight tracking-[-0.02em] text-white hover:text-white/90"
        title="Click to edit"
      >
        {value}
      </h1>
      {hasLocalEdit && (
        <span className="mt-1 shrink-0 rounded bg-[var(--color-brand-500)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-brand-400)]">
          Locally modified
        </span>
      )}
      <Pencil size={14} strokeWidth={1.2} className="mt-2 shrink-0 text-white/15 opacity-0 group-hover:opacity-100" style={{ transition: "opacity 150ms" }} />
    </div>
  );
}

function EditableDescription({
  ticketKey,
  initialDescription,
  onLocalEdit,
}: {
  ticketKey: string;
  initialDescription: string;
  onLocalEdit: (hasEdit: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialDescription);
  const [hasLocalEdit, setHasLocalEdit] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    async function loadLocalEdit() {
      try {
        const res = await fetch(`/api/tickets/${ticketKey}/local-edits`);
        if (res.ok) {
          const data = await res.json();
          const descEdit = data.find?.((e: { field: string }) => e.field === "description");
          if (descEdit) {
            setValue(descEdit.localValue);
            setHasLocalEdit(true);
            onLocalEdit(true);
          }
        }
      } catch (err) {
        console.error("Failed to load local description edit:", err);
      }
    }
    loadLocalEdit();
  }, [ticketKey, onLocalEdit]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      const el = textareaRef.current;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [editing]);

  const save = useCallback(async () => {
    setEditing(false);
    if (value.trim() === initialDescription.trim()) {
      setHasLocalEdit(false);
      onLocalEdit(false);
      return;
    }
    try {
      await fetch(`/api/tickets/${ticketKey}/local-edits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: "description", localValue: value.trim() }),
      });
      setHasLocalEdit(true);
      onLocalEdit(true);
    } catch (err) {
      console.error("Operation failed:", err);
    }
  }, [ticketKey, value, initialDescription, onLocalEdit]);

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 border-b border-white/[0.06] pb-2">
        <h3 className="font-[var(--font-display)] text-sm font-semibold text-white/80">Description</h3>
        {hasLocalEdit && (
          <span className="rounded bg-[var(--color-brand-500)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-brand-400)]">
            Locally modified
          </span>
        )}
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-auto text-white/20 cursor-pointer hover:text-white/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            title="Edit description"
          >
            <Pencil size={14} strokeWidth={1.2} />
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-3">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            className="w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-3 font-mono text-sm leading-[1.7] text-white/70 placeholder:text-white/20 focus:border-[var(--color-brand-500)]/40 focus:outline-none"
            rows={15}
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              className="rounded-md bg-[var(--color-brand-600)] px-3 py-1.5 text-xs font-medium text-white cursor-pointer hover:bg-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98]"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); }}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-white/40 cursor-pointer hover:bg-white/[0.04] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          className="group mt-3 cursor-pointer rounded-lg p-1 hover:bg-white/[0.02]"
          onClick={() => setEditing(true)}
          title="Click to edit"
        >
          {renderMarkdown(value)}
        </div>
      )}
      {hasLocalEdit && (
        <div className="mt-3">
          <button
            type="button"
            disabled
            className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-white/25 cursor-not-allowed"
            title="Write access not yet configured"
          >
            <Download size={14} strokeWidth={1.2} />
            Push to Jira
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Details rail (right column)
// ---------------------------------------------------------------------------

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2">
      <span className="shrink-0 text-xs text-white/30">{label}</span>
      <div className="min-w-0 text-right text-sm text-white/60">{children}</div>
    </div>
  );
}

function DetailsRail({
  ticket,
  detail,
}: {
  ticket: Ticket;
  detail: TicketDetail | undefined;
}) {
  const [poStatus, setPoStatus] = useState<POStatus>(ticket.poStatus);
  const [poNotes, setPoNotes] = useState(ticket.notes);
  const [statusOpen, setStatusOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
    }
    if (statusOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [statusOpen]);

  const handlePoStatusChange = useCallback(async (v: POStatus) => {
    setPoStatus(v);
    setStatusOpen(false);
    try {
      await fetch(`/api/tickets/${ticket.key}/metadata`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poStatus: v }),
      });
    } catch (err) {
      console.error("Operation failed:", err);
    }
  }, [ticket.key]);

  const handleNotesChange = useCallback(async (notes: string) => {
    setPoNotes(notes);
    try {
      await fetch(`/api/tickets/${ticket.key}/metadata`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poNotes: notes }),
      });
    } catch (err) {
      console.error("Operation failed:", err);
    }
  }, [ticket.key]);

  const epicColor = ticket.epic ? EPIC_COLORS[ticket.epic] : null;
  const priority = detail?.priority ?? "Medium";
  const priorityColor = PRIORITY_COLORS[priority];

  return (
    <div className="w-72 shrink-0 space-y-6 border-l border-white/[0.06] bg-[var(--color-surface-elevated)] p-5 xl:w-80">
      {/* Jira details */}
      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/25">Details</h3>
        <div className="mt-2 divide-y divide-white/[0.04]">
          <DetailRow label="Points">
            <span className="tabular-nums">{ticket.storyPoints ?? "--"}</span>
          </DetailRow>
          <DetailRow label="Assignee">
            <div className="flex items-center justify-end gap-2">
              <span className="truncate">{ticket.assignee?.name ?? "Unassigned"}</span>
              <Avatar assignee={ticket.assignee} size={20} />
            </div>
          </DetailRow>
          {detail?.reporter && (
            <DetailRow label="Reporter">
              <div className="flex items-center justify-end gap-2">
                <span className="truncate">{detail.reporter.name}</span>
                <Avatar assignee={detail.reporter} size={20} />
              </div>
            </DetailRow>
          )}
          {detail?.labels && detail.labels.length > 0 && (
            <DetailRow label="Labels">
              <div className="flex flex-wrap justify-end gap-1">
                {detail.labels.map((l) => (
                  <span key={l} className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/40">
                    {l}
                  </span>
                ))}
              </div>
            </DetailRow>
          )}
          <DetailRow label="Sprint">
            <span>--</span>
          </DetailRow>
          {ticket.epic && (
            <DetailRow label="Epic">
              <span
                className="inline-block rounded px-1.5 py-0.5 text-xs font-medium"
                style={epicColor ? { backgroundColor: epicColor.bg, color: epicColor.text } : {}}
              >
                {ticket.epic}
              </span>
            </DetailRow>
          )}
          <DetailRow label="Priority">
            <div className="flex items-center justify-end gap-1.5">
              <span style={{ color: priorityColor?.text }}>{priority}</span>
              <PriorityIcon priority={priority} />
            </div>
          </DetailRow>
          {detail?.components && detail.components.length > 0 && (
            <DetailRow label="Components">
              <div className="flex flex-wrap justify-end gap-1">
                {detail.components.map((c) => (
                  <span key={c} className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/40">
                    {c}
                  </span>
                ))}
              </div>
            </DetailRow>
          )}
          {detail && (
            <>
              <DetailRow label="Created">
                {new Date(detail.createdAt).toLocaleDateString()}
              </DetailRow>
              <DetailRow label="Updated">
                {new Date(detail.updatedAt).toLocaleDateString()}
              </DetailRow>
            </>
          )}
        </div>
      </div>

      {/* PO Metadata */}
      <div>
        <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-white/25">
          PO Metadata
          {poNotes.trim() && (
            <span
              className="h-2 w-2 rounded-full bg-[var(--color-brand-500)]"
              title="Has PO notes"
            />
          )}
        </h3>
        <div className="mt-3 space-y-4">
          {/* PO Status */}
          <div>
            <label className="mb-1.5 block text-xs text-white/30">PO Status</label>
            <div ref={statusRef} className="relative">
              <button
                type="button"
                onClick={() => setStatusOpen(!statusOpen)}
                className="flex w-full items-center justify-between rounded-md border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-sm cursor-pointer hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              >
                <span className="flex items-center gap-2">
                  {poStatus && (
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: PO_STATUS_COLORS[poStatus]?.dot ?? "#94a3b8" }}
                    />
                  )}
                  <span className="text-white/60">{poStatus ?? "--"}</span>
                </span>
                <ChevronDown size={12} strokeWidth={1.2} className="text-white/25" />
              </button>
              {statusOpen && (
                <div className="absolute top-full right-0 left-0 z-50 mt-1 rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] py-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                  {PO_STATUS_OPTIONS.map((opt) => {
                    const optColors = opt.value ? PO_STATUS_COLORS[opt.value] : null;
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => handlePoStatusChange(opt.value)}
                        className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-sm cursor-pointer hover:bg-white/[0.04] ${
                          opt.value === poStatus ? "text-white" : "text-white/50"
                        }`}
                      >
                        {optColors && (
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: optColors.dot }} />
                        )}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Quality Score */}
          <div>
            <label className="mb-1.5 block text-xs text-white/30">Quality Score</label>
            <div className="flex items-center gap-2">
              <QualityBadge score={ticket.qualityScore} stale={ticket.qualityStale} />
              {ticket.qualityStale && (
                <span className="text-[10px] text-white/20">Story changed since review</span>
              )}
            </div>
          </div>

          {/* PO Notes */}
          <div>
            <label className="mb-1.5 block text-xs text-white/30">Notes</label>
            <textarea
              defaultValue={poNotes}
              placeholder="Add PO notes..."
              rows={3}
              onBlur={(e) => handleNotesChange(e.target.value)}
              className="w-full resize-none rounded-md border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white/70 placeholder:text-white/20 focus:border-[var(--color-brand-500)]/40 focus:outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story version history section
// ---------------------------------------------------------------------------

function formatVersionDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const VERSION_TAGS = ["pre-refinement", "post-refinement", "final"] as const;

const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  "pre-refinement": { bg: "rgba(234, 179, 8, 0.12)", text: "#eab308" },
  "post-refinement": { bg: "rgba(96, 165, 250, 0.12)", text: "#60a5fa" },
  "final": { bg: "rgba(46, 145, 73, 0.12)", text: "#4aaa60" },
};

function HistorySection({ ticket }: { ticket: Ticket }) {
  const [ticketVersions, setTicketVersions] = useState<StoryVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [diffMode, setDiffMode] = useState<DiffMode>("unified");
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [versionTags, setVersionTags] = useState<Record<number, string | null>>({});

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tickets/${ticket.key}/versions`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data) && data.length > 0) {
          const mapped: StoryVersion[] = data.map((v: Record<string, unknown>, idx: number) => ({
            versionNumber: idx + 1,
            date: (v.createdAt as string) || new Date().toISOString(),
            source: "Jira sync" as const,
            contentHash: (v.contentHash as string) || "",
            qualityScore: null,
            content: (v.description as string) || "",
          }));
          setTicketVersions(mapped);
        }
      })
      .catch((err) => {
        console.error("Failed to load versions:", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [ticket.key]);

  const handleSaveSnapshot = useCallback(async () => {
    setSavingSnapshot(true);
    try {
      const detailRes = await fetch(`/api/tickets/${ticket.key}`);
      const detailData = detailRes.ok ? await detailRes.json() : null;
      const description = detailData?.description ?? "";
      const res = await fetch(`/api/tickets/${ticket.key}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      if (res.ok) {
        const created = await res.json();
        const newVersion: StoryVersion = {
          versionNumber: ticketVersions.length + 1,
          date: created.createdAt || new Date().toISOString(),
          source: "Local edit",
          contentHash: created.contentHash || "",
          qualityScore: null,
          content: created.description || description,
        };
        setTicketVersions((prev) => [...prev, newVersion]);
      }
    } catch (err) {
      console.error("Operation failed:", err);
    } finally {
      setSavingSnapshot(false);
    }
  }, [ticket.key, ticketVersions.length]);

  const handleExportDiff = useCallback(
    (oldText: string, newText: string, oldLabel: string, newLabel: string) => {
      exportDiffAsMarkdown({
        ticketKey: ticket.key,
        oldText,
        newText,
        oldLabel,
        newLabel,
      });
    },
    [ticket.key],
  );

  const sorted = [...ticketVersions].sort(
    (a, b) => b.versionNumber - a.versionNumber,
  );

  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  // Two-version comparison selectors (default: latest vs previous)
  const defaultNewVer = sorted.length > 0 ? sorted[0].versionNumber : null;
  const defaultOldVer = sorted.length > 1 ? sorted[1].versionNumber : null;
  const [compareOld, setCompareOld] = useState<number | null>(defaultOldVer);
  const [compareNew, setCompareNew] = useState<number | null>(defaultNewVer);

  // The selected version and the one before it (for diffing from list click)
  const selectedIdx = selectedVersion !== null
    ? sorted.findIndex((v) => v.versionNumber === selectedVersion)
    : null;
  const current = selectedIdx !== null ? sorted[selectedIdx] : null;
  const previous = selectedIdx !== null ? sorted[selectedIdx + 1] ?? null : null;

  // Versions for the two-selector comparison
  const compareOldVersion = sorted.find((v) => v.versionNumber === compareOld) ?? null;
  const compareNewVersion = sorted.find((v) => v.versionNumber === compareNew) ?? null;

  const selectStyle = "rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs text-white/70 cursor-pointer focus:border-[var(--color-brand-500)]/40 focus:outline-none";

  if (loading) {
    return (
      <div className="mt-8">
        <SectionHeader title="History" />
        <div className="mt-3 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-white/[0.06] px-4 py-3">
              <div className="h-7 w-7 animate-pulse rounded-full bg-white/[0.06]" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 animate-pulse rounded bg-white/[0.06]" />
                <div className="h-2.5 w-20 animate-pulse rounded bg-white/[0.04]" />
              </div>
              <div className="h-3 w-8 animate-pulse rounded bg-white/[0.06]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="mt-8">
        <SectionHeader title="History" count={0} />
        <p className="mt-3 text-sm text-white/30">No version history yet</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
        <div className="flex items-center gap-2">
          <h3 className="font-[var(--font-display)] text-sm font-semibold text-white/80">History</h3>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/[0.06] px-1.5 text-[10px] font-medium tabular-nums text-white/40">
            {sorted.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Diff mode toggle */}
          <div className="flex items-center overflow-hidden rounded-md border border-white/[0.08]">
            <button
              type="button"
              onClick={() => setDiffMode("unified")}
              title="Unified diff view"
              className={`px-2 py-1 text-[11px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-brand-400)] ${
                diffMode === "unified"
                  ? "bg-white/[0.08] text-white/70"
                  : "text-white/30 hover:bg-white/[0.03] hover:text-white/50"
              }`}
              style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
            >
              Unified
            </button>
            <button
              type="button"
              onClick={() => setDiffMode("side-by-side")}
              title="Side-by-side diff view"
              className={`border-l border-white/[0.08] px-2 py-1 text-[11px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-brand-400)] ${
                diffMode === "side-by-side"
                  ? "bg-white/[0.08] text-white/70"
                  : "text-white/30 hover:bg-white/[0.03] hover:text-white/50"
              }`}
              style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
            >
              Split
            </button>
          </div>

          {/* Save snapshot */}
          <button
            type="button"
            onClick={handleSaveSnapshot}
            disabled={savingSnapshot}
            className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[11px] font-medium text-white/40 cursor-pointer hover:bg-white/[0.04] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
          >
            <Plus size={12} strokeWidth={1.3} />
            {savingSnapshot ? "Saving..." : "Save snapshot"}
          </button>
        </div>
      </div>

      {/* Two-version comparison selector */}
      {sorted.length > 1 && (
        <div className="mt-3 mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <span className="text-xs text-white/40">Compare</span>
          <select
            value={compareOld ?? ""}
            onChange={(e) => setCompareOld(Number(e.target.value))}
            className={selectStyle}
          >
            {sorted.map((v) => (
              <option key={v.versionNumber} value={v.versionNumber}>
                v{v.versionNumber} - {formatVersionDate(v.date)}
              </option>
            ))}
          </select>
          <span className="text-xs text-white/20">with</span>
          <select
            value={compareNew ?? ""}
            onChange={(e) => setCompareNew(Number(e.target.value))}
            className={selectStyle}
          >
            {sorted.map((v) => (
              <option key={v.versionNumber} value={v.versionNumber}>
                v{v.versionNumber} - {formatVersionDate(v.date)}
              </option>
            ))}
          </select>
          {compareOldVersion && compareNewVersion && compareOld !== compareNew && (
            <button
              type="button"
              onClick={() => {
                setSelectedVersion(null);
              }}
              className="ml-2 rounded-md bg-[var(--color-brand-600)] px-3 py-1.5 text-xs font-medium text-white cursor-pointer hover:bg-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
              style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
            >
              View comparison
            </button>
          )}
        </div>
      )}

      {/* Show comparison from selectors when no specific version is clicked */}
      {selectedVersion === null && compareOldVersion && compareNewVersion && compareOld !== compareNew && sorted.length > 1 ? (
        <div className="mt-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-white/40">
              <span className="font-medium text-white/60">
                Version {compareOldVersion.versionNumber} &rarr; Version {compareNewVersion.versionNumber}
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                handleExportDiff(
                  compareOldVersion.content,
                  compareNewVersion.content,
                  `v${compareOldVersion.versionNumber}`,
                  `v${compareNewVersion.versionNumber}`,
                )
              }
              className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[11px] font-medium text-white/40 cursor-pointer hover:bg-white/[0.04] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
              style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
              title="Export diff as markdown"
            >
              <Download size={12} strokeWidth={1.2} />
              Export diff
            </button>
          </div>
          <StoryDiff
            oldText={compareOldVersion.content}
            newText={compareNewVersion.content}
            oldLabel={`v${compareOldVersion.versionNumber}`}
            newLabel={`v${compareNewVersion.versionNumber}`}
            mode={diffMode}
          />
        </div>
      ) : null}

      {selectedVersion !== null && current ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setSelectedVersion(null)}
            className="mb-3 flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-white/50 cursor-pointer hover:bg-white/[0.04] hover:text-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-95"
            style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
          >
            <ChevronLeft size={14} strokeWidth={1.5} className="text-white/40" />
            Back to version list
          </button>

          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-white/40">
              <span className="font-medium text-white/60">
                {previous
                  ? `Version ${previous.versionNumber} \u2192 Version ${current.versionNumber}`
                  : `Version ${current.versionNumber} (initial)`}
              </span>
              <span>{formatVersionDate(current.date)}</span>
              <span
                className="rounded-full border px-2 py-0.5"
                style={{
                  borderColor: current.source === "Jira sync" ? "rgba(68, 170, 187, 0.3)" : "rgba(160, 90, 200, 0.3)",
                  color: current.source === "Jira sync" ? "#44aabb" : "#a05ac8",
                }}
              >
                {current.source}
              </span>
              {current.qualityScore !== null && (
                <span className="text-white/30">Quality: {current.qualityScore}</span>
              )}
            </div>
            {previous && (
              <button
                type="button"
                onClick={() =>
                  handleExportDiff(
                    previous.content,
                    current.content,
                    `v${previous.versionNumber}`,
                    `v${current.versionNumber}`,
                  )
                }
                className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[11px] font-medium text-white/40 cursor-pointer hover:bg-white/[0.04] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
                style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
                title="Export diff as markdown"
              >
                <Download size={12} strokeWidth={1.2} />
                Export diff
              </button>
            )}
          </div>

          {previous ? (
            <StoryDiff
              oldText={previous.content}
              newText={current.content}
              oldLabel={`v${previous.versionNumber}`}
              newLabel={`v${current.versionNumber}`}
              mode={diffMode}
            />
          ) : (
            <div className="rounded-lg border border-white/[0.06] bg-[var(--color-surface-elevated)] p-5 font-[var(--font-body)] text-sm leading-[1.7] text-white/80 whitespace-pre-wrap">
              {current.content}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.06]">
          {sorted.map((version, idx) => {
            const isFirst = idx === sorted.length - 1;
            let scoreColor = "#94a3b8";
            if (version.qualityScore !== null) {
              if (version.qualityScore < 30) scoreColor = "#e5534b";
              else if (version.qualityScore < 70) scoreColor = "#ea8744";
              else scoreColor = "#4aaa60";
            }
            const currentTag = versionTags[version.versionNumber] ?? null;
            const tagColor = currentTag ? TAG_COLORS[currentTag] : null;

            return (
              <div
                key={version.versionNumber}
                onClick={() => setSelectedVersion(version.versionNumber)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left cursor-pointer hover:bg-white/[0.03] active:bg-white/[0.04] ${
                  idx < sorted.length - 1 ? "border-b border-white/[0.04]" : ""
                }`}
                style={{ transition: "background-color 0.15s ease" }}
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] text-[10px] font-semibold tabular-nums text-white/40">
                  v{version.versionNumber}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white/60">
                      {isFirst ? "Initial version" : `Version ${version.versionNumber}`}
                    </span>
                    <span
                      className="rounded-full border px-1.5 py-0.5 text-[10px]"
                      style={{
                        borderColor: version.source === "Jira sync" ? "rgba(68, 170, 187, 0.2)" : "rgba(160, 90, 200, 0.2)",
                        color: version.source === "Jira sync" ? "#44aabb" : "#a05ac8",
                      }}
                    >
                      {version.source}
                    </span>
                    {tagColor && currentTag && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                        style={{ backgroundColor: tagColor.bg, color: tagColor.text }}
                      >
                        {currentTag}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-white/25">
                    {formatVersionDate(version.date)}
                  </div>
                </div>
                {/* Tag selector */}
                <select
                  value={currentTag ?? ""}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    e.stopPropagation();
                    const newTag = e.target.value || null;
                    setVersionTags((prev) => ({ ...prev, [version.versionNumber]: newTag }));
                  }}
                  className="shrink-0 rounded-md border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-white/40 cursor-pointer focus:border-[var(--color-brand-500)]/40 focus:outline-none"
                  title="Set version tag"
                >
                  <option value="">No tag</option>
                  {VERSION_TAGS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {version.qualityScore !== null && (
                  <div className="flex items-center gap-1.5 tabular-nums text-xs" style={{ color: scoreColor }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: scoreColor }} />
                    {version.qualityScore}
                  </div>
                )}
                <ChevronRight size={10} strokeWidth={1} className="shrink-0 text-white/15" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review section
// ---------------------------------------------------------------------------

interface ReviewDimension {
  key: string;
  label: string;
  value: number;
}

interface ReviewEntry {
  id: string;
  date: string;
  reviewer: string;
  dimensions: ReviewDimension[];
  overallScore: number;
}

const INITIAL_REVIEW_HISTORY: ReviewEntry[] = [];

function getScoreColor(score: number): string {
  if (score < 30) return "#e5534b";
  if (score < 70) return "#ea8744";
  return "#4aaa60";
}

function ReviewSection({ ticketKey }: { ticketKey: string }) {
  const [dimensions, setDimensions] = useState<ReviewDimension[]>([
    { key: "clarity", label: "Clarity", value: 50 },
    { key: "testability", label: "Testability", value: 50 },
    { key: "completeness", label: "Completeness", value: 50 },
    { key: "feasibility", label: "Technical Feasibility", value: 50 },
  ]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reviews, setReviews] = useState<ReviewEntry[]>(INITIAL_REVIEW_HISTORY);
  const [agentReviewing, setAgentReviewing] = useState(false);
  const [agentResult, setAgentResult] = useState<ReviewResult | null>(null);

  const overallScore = Math.round(
    dimensions.reduce((sum, d) => sum + d.value, 0) / dimensions.length,
  );

  const handleDimensionChange = useCallback((key: string, value: number) => {
    setDimensions((prev) =>
      prev.map((d) => (d.key === key ? { ...d, value } : d)),
    );
    setSaved(false);
  }, []);

  const handleSaveReview = useCallback(async () => {
    setSaving(true);
    try {
      await fetch(`/api/tickets/${ticketKey}/metadata`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qualityScore: overallScore }),
      });

      const newReview: ReviewEntry = {
        id: `rev-${Date.now()}`,
        date: new Date().toISOString(),
        reviewer: "Product Owner",
        dimensions: [...dimensions],
        overallScore,
      };
      setReviews((prev) => [newReview, ...prev]);
      setSaved(true);
    } catch (err) {
      console.error("Operation failed:", err);
    } finally {
      setSaving(false);
    }
  }, [ticketKey, dimensions, overallScore]);

  const handleAgentReview = useCallback(async () => {
    setAgentReviewing(true);
    setAgentResult(null);
    try {
      const result = await reviewStory(ticketKey);
      setAgentResult(result);
      // Apply agent scores to the sliders
      setDimensions((prev) =>
        prev.map((d) => {
          const agentDim = result.dimensions.find((ad) => ad.key === d.key);
          return agentDim ? { ...d, value: agentDim.score } : d;
        }),
      );
    } catch (err) {
      console.error("Operation failed:", err);
    } finally {
      setAgentReviewing(false);
    }
  }, [ticketKey]);

  return (
    <div className="mt-6 space-y-8">
      {/* Agent review */}
      <div>
        <SectionHeader title="Agent Review" />
        <div className="mt-3">
          <button
            type="button"
            onClick={handleAgentReview}
            disabled={agentReviewing}
            className="flex items-center gap-2 rounded-md border border-[var(--color-brand-500)]/20 bg-[var(--color-brand-500)]/[0.06] px-4 py-2 text-xs font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-[var(--color-brand-500)]/[0.10] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
          >
            {agentReviewing ? (
              <>
                <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
                Reviewing...
              </>
            ) : (
              <>
                <Sparkles size={14} strokeWidth={1.2} />
                Review Story via Agent
              </>
            )}
          </button>

          {agentResult && (
            <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
              <p className="text-sm text-white/60">{agentResult.summary}</p>
              {agentResult.suggestions.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-white/25">Suggestions</p>
                  <ul className="space-y-1">
                    {agentResult.suggestions.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-white/50">
                        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-white/20" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap gap-3 pt-1">
                {agentResult.dimensions.map((dim) => (
                  <div key={dim.key} className="text-[10px] text-white/30">
                    {dim.label}: <span className="font-medium tabular-nums" style={{ color: getScoreColor(dim.score) }}>{dim.score}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        <SectionHeader title="Quality Review" />
        <div className="mt-4 space-y-5">
          {dimensions.map((dim) => {
            const color = getScoreColor(dim.value);
            return (
              <div key={dim.key}>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-medium text-white/50">{dim.label}</label>
                  <span className="text-xs font-semibold tabular-nums" style={{ color }}>
                    {dim.value}
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={dim.value}
                    onChange={(e) => handleDimensionChange(dim.key, Number(e.target.value))}
                    className="w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-white/[0.06] [&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--color-surface-base)] [&::-webkit-slider-thumb]:shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
                  />
                  <div
                    className="pointer-events-none absolute top-[50%] left-0 h-1.5 -translate-y-[50%] rounded-full"
                    style={{ width: `${dim.value}%`, backgroundColor: color, opacity: 0.4 }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <span className="text-sm font-medium text-white/50">Overall Score</span>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold tabular-nums" style={{ color: getScoreColor(overallScore) }}>
              {overallScore}
            </span>
            <span className="text-xs text-white/25">/100</span>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSaveReview}
            disabled={saving}
            className="rounded-md bg-[var(--color-brand-600)] px-4 py-1.5 text-xs font-medium text-white cursor-pointer hover:bg-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
          >
            {saving ? "Saving..." : "Save Review"}
          </button>
          {saved && <span className="text-xs text-[#4aaa60]">Review saved</span>}
        </div>
      </div>

      <div>
        <SectionHeader title="Review History" count={reviews.length} />
        <div className="mt-3 space-y-3">
          {reviews.map((review) => (
            <div key={review.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <span className="font-medium text-white/60">{review.reviewer}</span>
                  <span>{new Date(review.date).toLocaleDateString()}</span>
                </div>
                <span className="text-sm font-semibold tabular-nums" style={{ color: getScoreColor(review.overallScore) }}>
                  {review.overallScore}
                </span>
              </div>
              <div className="mt-2 flex gap-3">
                {review.dimensions.map((dim) => (
                  <div key={dim.key} className="flex items-center gap-1.5 text-[10px] text-white/30">
                    <span>{dim.label}:</span>
                    <span className="font-medium tabular-nums" style={{ color: getScoreColor(dim.value) }}>{dim.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {reviews.length === 0 && <p className="text-sm text-white/25">No reviews yet</p>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Refinement section
// ---------------------------------------------------------------------------

interface TeamEstimate {
  member: string;
  points: number | null;
}

const REFINEMENT_CHECKLIST = [
  { key: "description", label: "Description complete" },
  { key: "acceptance", label: "Acceptance criteria defined" },
  { key: "designs", label: "Designs attached (if applicable)" },
  { key: "dependencies", label: "Dependencies identified" },
  { key: "estimated", label: "Estimated" },
] as const;

function RefinementSection({ ticketKey }: { ticketKey: string }) {
  const [estimates, setEstimates] = useState<TeamEstimate[]>([
    { member: "Developer A", points: null },
    { member: "Developer B", points: null },
    { member: "Developer C", points: null },
  ]);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    description: false,
    acceptance: false,
    designs: false,
    dependencies: false,
    estimated: false,
  });

  const filledEstimates = estimates.filter((e) => e.points !== null);
  const avgEstimate =
    filledEstimates.length > 0
      ? Math.round(
          (filledEstimates.reduce((s, e) => s + (e.points ?? 0), 0) / filledEstimates.length) * 10,
        ) / 10
      : null;

  const allChecked = Object.values(checklist).every(Boolean);

  const handleChecklistChange = useCallback(
    (key: string, checked: boolean) => {
      setChecklist((prev) => {
        const next = { ...prev, [key]: checked };
        const allDone = Object.values(next).every(Boolean);
        if (allDone) {
          fetch(`/api/tickets/${ticketKey}/metadata`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ poStatus: "Ready for Refinement" }),
          }).catch((err) => console.error("Failed to update PO status:", err));
        }
        return next;
      });
    },
    [ticketKey],
  );

  const handleEstimateChange = useCallback((idx: number, value: string) => {
    setEstimates((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, points: value ? Number(value) : null } : e)),
    );
  }, []);

  return (
    <div className="mt-6 space-y-8">
      <div>
        <SectionHeader title="Team Estimation" />
        <div className="mt-3 space-y-2">
          {estimates.map((est, idx) => (
            <div key={est.member} className="flex items-center gap-3 rounded-lg border border-white/[0.06] px-4 py-2.5">
              <span className="min-w-0 flex-1 text-sm text-white/60">{est.member}</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={est.points ?? ""}
                onChange={(e) => handleEstimateChange(idx, e.target.value)}
                placeholder="SP"
                className="w-16 rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-right text-sm tabular-nums text-white/70 placeholder:text-white/15 focus:border-[var(--color-brand-500)]/40 focus:outline-none"
              />
            </div>
          ))}
        </div>
        {avgEstimate !== null && (
          <div className="mt-3 flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <span className="text-sm font-medium text-white/50">Average Estimate</span>
            <span className="text-lg font-semibold tabular-nums text-white/80">
              {avgEstimate} <span className="text-xs font-normal text-white/30">SP</span>
            </span>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
          <h3 className="font-[var(--font-display)] text-sm font-semibold text-white/80">Ready for Refinement</h3>
          {allChecked && (
            <span className="rounded-full bg-[rgba(46,145,73,0.12)] px-2.5 py-0.5 text-[10px] font-medium text-[#4aaa60]">
              All complete
            </span>
          )}
        </div>
        <div className="mt-3 space-y-2">
          {REFINEMENT_CHECKLIST.map((item) => (
            <label
              key={item.key}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/[0.06] px-4 py-2.5 hover:bg-white/[0.02]"
              style={{ transition: "background-color 0.15s ease" }}
            >
              <input
                type="checkbox"
                checked={checklist[item.key] ?? false}
                onChange={(e) => handleChecklistChange(item.key, e.target.checked)}
                className="sr-only"
              />
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  checklist[item.key]
                    ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/10"
                    : "border-white/[0.12] bg-white/[0.03]"
                }`}
                style={{ transition: "background-color 0.15s ease, border-color 0.15s ease" }}
              >
                {checklist[item.key] && (
                  <Check size={10} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
                )}
              </span>
              <span className={`text-sm ${checklist[item.key] ? "text-white/40 line-through" : "text-white/60"}`}>
                {item.label}
              </span>
            </label>
          ))}
        </div>
        {allChecked && (
          <p className="mt-3 text-xs text-[#4aaa60]/70">
            PO status automatically set to &quot;Ready for Refinement&quot;
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ticket detail page
// ---------------------------------------------------------------------------

export default function TicketDetailPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = use(params);

  // Fetch ticket + detail from API
  const { data: apiData, isLoading: ticketLoading } = useTicketDetail(key);

  // Map API response to Ticket and TicketDetail shapes
  const ticket: Ticket | undefined = apiData ? {
    key: apiData.key,
    title: apiData.title,
    type: apiData.type,
    epic: apiData.epic ?? null,
    jiraStatus: apiData.jiraStatus,
    storyPoints: apiData.storyPoints ?? null,
    assignee: apiData.assignee ?? null,
    flagged: apiData.flagged ?? false,
    poStatus: apiData.poStatus ?? null,
    qualityScore: apiData.qualityScore ?? null,
    qualityStale: apiData.qualityStale ?? false,
    notes: apiData.notes ?? "",
    sprintId: apiData.sprintId,
    freshness: apiData.freshness,
  } : undefined;

  const detail: TicketDetail | undefined = apiData ? {
    description: apiData.description ?? "",
    reporter: apiData.reporter ?? null,
    labels: apiData.labels ?? [],
    components: apiData.components ?? [],
    priority: apiData.priority ?? "Medium",
    createdAt: apiData.createdAt ?? "",
    updatedAt: apiData.updatedAt ?? "",
    attachments: apiData.attachments ?? [],
    subtasks: apiData.subtasks ?? [],
    linkedIssues: apiData.linkedIssues ?? [],
    jiraComments: apiData.jiraComments ?? [],
  } : undefined;

  const [hasLocalTitleEdit, setHasLocalTitleEdit] = useState(false);
  const [hasLocalDescEdit, setHasLocalDescEdit] = useState(false);
  const [activeTab, setActiveTab] = useState<"content" | "history" | "review" | "refinement">("content");
  const [versionCount, setVersionCount] = useState(0);

  // Fetch actual version count from API
  useEffect(() => {
    let cancelled = false;
    async function loadVersionCount() {
      try {
        const res = await fetch(`/api/tickets/${key}/versions`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          setVersionCount(data.length);
        }
      } catch (err) {
        console.error("Failed to load version count:", err);
      }
    }
    loadVersionCount();
    return () => { cancelled = true; };
  }, [key]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleTitleLocalEdit = useCallback((has: boolean) => setHasLocalTitleEdit(has), []);
  const handleDescLocalEdit = useCallback((has: boolean) => setHasLocalDescEdit(has), []);

  // Conflict detection: check if Jira version changed while local edits exist
  const hasLocalEditsForCheck = hasLocalTitleEdit || hasLocalDescEdit;
  const { data: conflictData } = useConflictCheck(hasLocalEditsForCheck ? key : null);
  const conflictWarning = conflictData?.stale ? { remoteUpdated: conflictData.remoteUpdated as string } : null;

  const handleRefreshFromJira = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetch("/api/jira/sync-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketKeys: [key] }),
      });
      window.location.reload();
    } catch (err) {
      console.error("Failed to refresh from Jira:", err);
      setIsRefreshing(false);
    }
  }, [key]);

  // Fetch sprints for breadcrumb
  const { data: rawSprints } = useJiraSprints();
  const activeSprint = rawSprints?.find((s) => s.state === "active");
  const activeSprintName = activeSprint?.name ?? null;

  if (ticketLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} strokeWidth={2} className="animate-spin text-white/20" />
          <span className="text-sm text-white/30">Loading ticket...</span>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h1 className="font-[var(--font-display)] text-2xl font-semibold text-white/80">Ticket not found</h1>
          <p className="mt-2 text-sm text-white/40">No ticket with key &quot;{key}&quot; exists in the current data.</p>
          <Link
            href="/sprint-board"
            className="mt-4 inline-block rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white cursor-pointer hover:bg-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98]"
          >
            Back to Sprint Board
          </Link>
        </div>
      </div>
    );
  }

  const jiraStatusColor = JIRA_STATUS_COLORS[ticket.jiraStatus] ?? JIRA_STATUS_COLORS["TO DO"];
  const epicColor = ticket.epic ? EPIC_COLORS[ticket.epic] : null;
  const hasLocalEdits = hasLocalTitleEdit || hasLocalDescEdit;

  return (
    <div className="flex h-full">
      {/* Main content (left, scrollable) */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-8 py-6">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs">
            <Link
              href="/sprint-board"
              className="text-white/40 cursor-pointer hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              Sprint Board
            </Link>
            <ChevronRight size={10} strokeWidth={1} className="text-white/15" />
            {activeSprintName && (
              <>
                <Link
                  href="/sprint-board"
                  className="text-white/40 cursor-pointer hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                >
                  {activeSprintName}
                </Link>
                <ChevronRight size={10} strokeWidth={1} className="text-white/15" />
              </>
            )}
            <span className="font-mono text-white/60">{key}</span>
          </nav>

          {/* Conflict warning: Jira version changed while local edits exist */}
          {conflictWarning && (
            <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3">
              <AlertTriangle size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-amber-400/70" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-amber-300/90">Remote version changed</p>
                <p className="mt-0.5 text-xs text-white/40">
                  This ticket was updated in Jira ({new Date(conflictWarning.remoteUpdated).toLocaleString()}) since your local edits. Review the changes before saving.
                </p>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="mt-4">
            <div className="flex items-center gap-2.5">
              <IssueTypeIcon type={ticket.type} size={20} />
              <span className="font-mono text-sm text-white/40">{key}</span>
              {ticket.flagged && (
                <Flag size={16} className="text-[#e5534b]" fill="currentColor" strokeWidth={0} />
              )}
              {hasLocalEdits && (
                <span className="rounded bg-[var(--color-brand-500)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-brand-400)]">
                  Modified locally
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRefreshFromJira}
                  disabled={isRefreshing}
                  className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-white/40 cursor-pointer hover:bg-white/[0.04] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RefreshCw size={14} strokeWidth={1.2} className={isRefreshing ? "animate-spin" : ""} />
                  {isRefreshing ? "Syncing..." : "Refresh from Jira"}
                </button>
                <a
                  href={getJiraUrl(key)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-white/40 cursor-pointer hover:bg-white/[0.04] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98]"
                >
                  <ExternalLink size={14} strokeWidth={1.2} />
                  Open in Jira
                </a>
              </div>
            </div>

            {/* Title */}
            <div className="mt-3">
              <EditableTitle
                ticketKey={key}
                initialTitle={ticket.title}
                onLocalEdit={handleTitleLocalEdit}
              />
            </div>

            {/* Status badges */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium"
                style={{ backgroundColor: jiraStatusColor.bg, color: jiraStatusColor.text }}
              >
                {ticket.jiraStatus}
              </span>
              {epicColor && (
                <span
                  className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium"
                  style={{ backgroundColor: epicColor.bg, color: epicColor.text }}
                >
                  {ticket.epic}
                </span>
              )}
              {ticket.storyPoints !== null && (
                <span className="inline-flex items-center rounded-md bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-white/50">
                  {ticket.storyPoints} pts
                </span>
              )}
            </div>
          </div>

          {/* Tab bar */}
          <div className="mt-6 flex items-center gap-1 border-b border-white/[0.06]">
            <button
              type="button"
              onClick={() => setActiveTab("content")}
              className={`relative px-3 py-2 text-xs font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                activeTab === "content"
                  ? "text-white/80"
                  : "text-white/30 hover:text-white/50"
              }`}
              style={{ transition: "color 0.15s ease" }}
            >
              Content
              {activeTab === "content" && (
                <span className="absolute right-0 bottom-0 left-0 h-0.5 rounded-full bg-[var(--color-brand-500)]" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                activeTab === "history"
                  ? "text-white/80"
                  : "text-white/30 hover:text-white/50"
              }`}
              style={{ transition: "color 0.15s ease" }}
            >
              History
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-white/[0.06] px-1 text-[10px] tabular-nums text-white/30">
                {versionCount}
              </span>
              {activeTab === "history" && (
                <span className="absolute right-0 bottom-0 left-0 h-0.5 rounded-full bg-[var(--color-brand-500)]" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("review")}
              className={`relative px-3 py-2 text-xs font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                activeTab === "review"
                  ? "text-white/80"
                  : "text-white/30 hover:text-white/50"
              }`}
              style={{ transition: "color 0.15s ease" }}
            >
              Review
              {activeTab === "review" && (
                <span className="absolute right-0 bottom-0 left-0 h-0.5 rounded-full bg-[var(--color-brand-500)]" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("refinement")}
              className={`relative px-3 py-2 text-xs font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                activeTab === "refinement"
                  ? "text-white/80"
                  : "text-white/30 hover:text-white/50"
              }`}
              style={{ transition: "color 0.15s ease" }}
            >
              Refinement
              {activeTab === "refinement" && (
                <span className="absolute right-0 bottom-0 left-0 h-0.5 rounded-full bg-[var(--color-brand-500)]" />
              )}
            </button>
          </div>

          {activeTab === "content" && (
            <>
              <EditableDescription
                ticketKey={key}
                initialDescription={detail?.description ?? "No description available."}
                onLocalEdit={handleDescLocalEdit}
              />
              {detail && <AttachmentsSection attachments={detail.attachments} />}
              {detail && <SubtasksSection subtasks={detail.subtasks} />}
              {detail && <LinkedIssuesSection issues={detail.linkedIssues} />}
              <CommentsSection
                ticketKey={key}
                jiraComments={detail?.jiraComments ?? []}
              />
            </>
          )}

          {activeTab === "history" && <HistorySection ticket={ticket} />}

          {activeTab === "review" && <ReviewSection ticketKey={key} />}

          {activeTab === "refinement" && <RefinementSection ticketKey={key} />}

          {/* Bottom padding */}
          <div className="h-12" />
        </div>
      </div>

      {/* Details rail (right, sticky) */}
      <div className="sticky top-0 min-h-full self-stretch overflow-y-auto">
        <DetailsRail ticket={ticket} detail={detail} />
      </div>
    </div>
  );
}
