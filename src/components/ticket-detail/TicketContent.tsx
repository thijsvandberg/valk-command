"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import type { Attachment, TicketDetail } from "@/types/ticket";
import {
  Pencil,
  Trash2,
  Download,
  Check,
  File,
  FileMinus,
} from "lucide-react";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { JIRA_STATUS_COLORS } from "@/components/shared/StatusBadge";
import { SectionHeader } from "./SectionHeader";
import { renderMarkdown } from "./renderMarkdown";

// ---------------------------------------------------------------------------
// Editable title
// ---------------------------------------------------------------------------

export function EditableTitle({
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

// ---------------------------------------------------------------------------
// Editable description
// ---------------------------------------------------------------------------

export function EditableDescription({
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
  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
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
            disabled={pushing}
            onClick={async () => {
              setPushing(true);
              try {
                const res = await fetch(`/api/tickets/${ticketKey}/push-to-jira`, { method: "POST" });
                const data = await res.json();
                if (data.conflict) {
                  setPushError("Conflict: Jira was updated since your edit. Refresh the page to see the diff.");
                } else if (data.success) {
                  setHasLocalEdit(false);
                  onLocalEdit(false);
                  setPushError(null);
                } else {
                  setPushError(data.error ?? "Push failed");
                }
              } catch {
                setPushError("Failed to push to Jira");
              } finally {
                setPushing(false);
              }
            }}
            className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-[var(--color-brand-600)]/80 px-3 py-1.5 text-xs font-medium text-white/80 cursor-pointer hover:bg-[var(--color-brand-500)]/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={14} strokeWidth={1.2} />
            {pushing ? "Pushing..." : "Push to Jira"}
          </button>
          {pushError && (
            <p className="mt-1.5 text-xs text-[#e5534b]">{pushError}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export function AttachmentsSection({ attachments }: { attachments: Attachment[] }) {
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

// ---------------------------------------------------------------------------
// Subtasks
// ---------------------------------------------------------------------------

export function SubtasksSection({ subtasks }: { subtasks: TicketDetail["subtasks"] }) {
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

// ---------------------------------------------------------------------------
// Linked issues
// ---------------------------------------------------------------------------

export function LinkedIssuesSection({ issues }: { issues: TicketDetail["linkedIssues"] }) {
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
// Comments
// ---------------------------------------------------------------------------

export function CommentsSection({
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
