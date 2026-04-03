"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import type { Attachment, TicketDetail } from "@/types/ticket";
import {
  Trash2,
  CloudUpload,
  File,
  FileMinus,
} from "lucide-react";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { JIRA_STATUS_COLORS } from "@/components/shared/StatusBadge";
import { SectionHeader } from "./SectionHeader";
import { renderMarkdown } from "./renderMarkdown";
import { RichEditor } from "@/components/rich-editor/RichEditor";

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
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  // When the Jira-synced title changes and there are no local edits, reflect the fresh value.
  useEffect(() => {
    if (!hasLocalEdit) {
      setValue(initialTitle);
    }
  }, [initialTitle, hasLocalEdit]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      // Auto-size height to match content
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
    }
  }, [editing]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

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
      <textarea
        ref={inputRef}
        rows={1}
        value={value}
        onChange={handleChange}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); save(); }
          if (e.key === "Escape") { setValue(hasLocalEdit ? value : initialTitle); setEditing(false); }
        }}
        className="w-full resize-none overflow-hidden border-b-2 border-[var(--color-brand-500)]/40 bg-transparent font-[var(--font-display)] text-2xl font-semibold leading-tight tracking-[-0.02em] text-white outline-none"
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editable description
// ---------------------------------------------------------------------------

export function EditableDescription({
  ticketKey,
  initialDescription,
  attachments,
  onLocalEdit,
  hasConflict = false,
  onViewDiff,
  onRemoteChanged,
  onPushSuccess,
}: {
  ticketKey: string;
  initialDescription: string;
  attachments?: Attachment[];
  onLocalEdit: (hasEdit: boolean) => void;
  hasConflict?: boolean;
  onViewDiff?: () => void;
  /** Called when push detects remote changes. contentChanged indicates whether content or only metadata changed. */
  onRemoteChanged?: (contentChanged: boolean) => void;
  /** Called after a successful push so the parent can refresh ticket data. */
  onPushSuccess?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialDescription);
  const [hasLocalEdit, setHasLocalEdit] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);

  // When the Jira-synced description changes and there are no local edits, reflect the fresh value.
  useEffect(() => {
    if (!hasLocalEdit) {
      setValue(initialDescription);
    }
  }, [initialDescription, hasLocalEdit]);

  useEffect(() => {
    async function loadLocalEdit() {
      try {
        const res = await fetch(`/api/tickets/${ticketKey}/local-edits`);
        if (res.ok) {
          const data = await res.json();
          const descEdit = data.find?.((e: { field: string }) => e.field === "description");
          if (descEdit) {
            let localValue: string = descEdit.localValue;
            // Resolve attachment placeholders using the synced attachment list
            if (attachments && attachments.length > 0) {
              const filenameToId = new Map(attachments.map((a) => [a.filename, a.id]));
              localValue = localValue.replace(
                /!\[([^\]]*)\]\(attachment[^)]*\)/g,
                (_match: string, alt: string) => {
                  const id = filenameToId.get(alt);
                  return id ? `![${alt}](/api/attachments/${id})` : `![${alt}](attachment)`;
                },
              );
            }
            // Restore images that were stripped by TipTap before Image extension support was added.
            // If initialDescription has resolved images but the local edit has none, re-append them.
            const resolvedImageRe = /!\[[^\]]*\]\(\/api\/attachments\/[^)]+\)/;
            const hasImages = (text: string) => resolvedImageRe.test(text);
            if (hasImages(initialDescription) && !hasImages(localValue)) {
              const imageLines = initialDescription
                .split("\n")
                .filter((line) => /^!\[[^\]]*\]\(\/api\/attachments\/[^)]+\)$/.test(line.trim()));
              if (imageLines.length > 0) {
                localValue = localValue.trimEnd() + "\n\n" + imageLines.join("\n");
              }
            }
            setValue(localValue);
            setHasLocalEdit(true);
            onLocalEdit(true);
          }
        }
      } catch (err) {
        console.error("Failed to load local description edit:", err);
      }
    }
    loadLocalEdit();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketKey, onLocalEdit]);

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

  const handlePush = useCallback(async () => {
    setPushing(true);
    try {
      const res = await fetch(`/api/tickets/${ticketKey}/push-to-jira`, { method: "POST" });
      const data = await res.json();
      if (data.conflict) {
        if (onRemoteChanged) {
          onRemoteChanged(data.contentChanged ?? true);
        } else {
          setPushError("Conflict: Jira was updated since your edit. Refresh the page to see the diff.");
        }
      } else if (data.success) {
        setHasLocalEdit(false);
        onLocalEdit(false);
        setPushError(null);
        setOverrideConfirmed(false);
        onPushSuccess?.();
      } else {
        setPushError(data.error ?? "Push failed");
      }
    } catch {
      setPushError("Failed to push to Jira");
    } finally {
      setPushing(false);
    }
  }, [ticketKey, onRemoteChanged, onLocalEdit, onPushSuccess]);

  useEffect(() => {
    if (!editing) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setEditing(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editing]);

  return (
    <div className="mt-6">
      {/* Header bar */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] pb-2">
        <h3 className="font-[var(--font-display)] text-sm font-semibold text-white/80">Description</h3>
        {hasLocalEdit && !editing && (
          <button
            type="button"
            onClick={onViewDiff}
            className="rounded bg-[var(--color-brand-500)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-[var(--color-brand-500)]/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            style={{ transition: "background-color 0.15s ease" }}
            title="View diff in History tab"
          >
            Locally modified
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {/* Push to Jira (when local edits exist and not editing) */}
          {hasLocalEdit && !editing && (
            <>
              {hasConflict && (
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overrideConfirmed}
                    onChange={(e) => setOverrideConfirmed(e.target.checked)}
                    className="h-3 w-3 rounded border-white/20 bg-white/[0.03] accent-[var(--color-brand-500)] cursor-pointer"
                  />
                  <span className="text-[10px] text-white/40">Override remote</span>
                </label>
              )}
              <button
                type="button"
                disabled={pushing || (hasConflict && !overrideConfirmed)}
                title={hasConflict && !overrideConfirmed ? "Review the diff and confirm before pushing" : undefined}
                onClick={handlePush}
                className="flex items-center gap-1.5 rounded-md bg-[var(--color-brand-600)] px-2.5 py-1 text-[11px] font-medium text-white cursor-pointer hover:bg-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CloudUpload size={12} strokeWidth={1.5} />
                {pushing ? "Pushing..." : "Push to Jira"}
              </button>
            </>
          )}
          {/* Edit mode: Save / Cancel */}
          {editing && (
            <>
              <button
                type="button"
                onClick={() => { setEditing(false); }}
                className="rounded-md px-3 py-1 text-xs font-medium text-white/40 cursor-pointer hover:bg-white/[0.04] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                className="rounded-md bg-[var(--color-brand-600)] px-3 py-1 text-xs font-medium text-white cursor-pointer hover:bg-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98]"
              >
                Save
              </button>
            </>
          )}
        </div>
      </div>

      {/* Push error */}
      {pushError && (
        <p className="mt-1.5 text-xs text-[#e5534b]">{pushError}</p>
      )}

      {/* Content */}
      {editing ? (
        <div className="mt-3">
          <RichEditor
            value={value}
            onChange={setValue}
            placeholder="Write a description..."
            minHeight={300}
          />
        </div>
      ) : (
        <div
          className="description-content group relative mt-3 cursor-pointer"
          onClick={() => setEditing(true)}
          title="Click to edit"
        >
          {renderMarkdown(value)}
          <span className="pointer-events-none absolute -top-1 -right-1 rounded p-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/30">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </span>
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
              className="flex h-24 items-center justify-center overflow-hidden"
              style={att.cleaned ? {} : { backgroundColor: `${att.color}08` }}
            >
              {att.cleaned ? (
                <div className="flex flex-col items-center gap-1 text-white/15">
                  <FileMinus className="h-6 w-6" strokeWidth={1.5} />
                  <span className="text-[10px]">Cleaned</span>
                </div>
              ) : att.mimeType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/attachments/${att.id}`}
                  alt={att.filename}
                  className="h-full w-full object-cover"
                />
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
