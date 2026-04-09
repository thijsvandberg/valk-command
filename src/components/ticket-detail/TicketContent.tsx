"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import type { Attachment, TicketDetail } from "@/types/ticket";
import {
  Trash2,
  File,
  FileMinus,
  CloudUpload,
  Loader2,
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
  serverLocalEdit,
  onLocalEdit,
  onEditingChange,
}: {
  ticketKey: string;
  initialTitle: string;
  serverLocalEdit?: { value: string; isDraft: boolean };
  onLocalEdit: (hasEdit: boolean) => void;
  onEditingChange?: (isEditing: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  // Persisted local edit - only updated on save, drives the "Locally modified" badge
  const [localValue, setLocalValue] = useState<string | null>(serverLocalEdit?.value ?? null);
  // In-progress value while the textarea is open - never persisted until save
  const [editDraft, setEditDraft] = useState<string>("");
  // Ref mirror so save() always reads the latest draft regardless of closure age
  const editDraftRef = useRef(editDraft);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const notifiedRef = useRef(false);
  // Set before an intentional discard (Escape) so onBlur skips saving
  const discardingRef = useRef(false);
  // Set during an in-flight save so a subsequent onBlur doesn't double-save
  const savingRef = useRef(false);

  const hasLocalEdit = localValue !== null;
  // Display value when not editing
  const displayValue = localValue ?? initialTitle;

  useEffect(() => { onEditingChange?.(editing); }, [editing, onEditingChange]);

  // Notify parent once if we have a server-provided local edit
  useEffect(() => {
    if (serverLocalEdit && !notifiedRef.current) {
      notifiedRef.current = true;
      onLocalEdit(true);
    }
  }, [serverLocalEdit, onLocalEdit]);

  useEffect(() => {
    if (editing && inputRef.current) {
      const el = inputRef.current;
      el.focus();
      // Position cursor at end so backspace deletes one character at a time
      el.setSelectionRange(el.value.length, el.value.length);
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [editing]);

  const startEditing = () => {
    const draft = localValue ?? initialTitle;
    setEditDraft(draft);
    editDraftRef.current = draft;
    // Reset in case a previous save fetch is still in-flight
    savingRef.current = false;
    setEditing(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditDraft(e.target.value);
    editDraftRef.current = e.target.value;
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const discard = () => {
    discardingRef.current = true;
    setEditing(false);
    // editDraft is simply abandoned - localValue stays unchanged
  };

  const save = useCallback(async () => {
    if (discardingRef.current) { discardingRef.current = false; return; }
    if (savingRef.current) return;
    savingRef.current = true;
    setEditing(false);
    const draft = editDraftRef.current.trim();
    try {
      // Empty title: discard silently, don't persist garbage
      if (draft === "") {
        return;
      }
      if (draft === initialTitle) {
        setLocalValue(null);
        onLocalEdit(false);
        return;
      }
      await fetch(`/api/tickets/${ticketKey}/local-edits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: "title", localValue: draft }),
      });
      setLocalValue(draft);
      onLocalEdit(true);
    } catch (err) {
      console.error("Operation failed:", err);
    } finally {
      savingRef.current = false;
    }
  }, [ticketKey, initialTitle, onLocalEdit]);

  if (editing) {
    return (
      <textarea
        ref={inputRef}
        rows={1}
        value={editDraft}
        onChange={handleChange}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); save(); }
          if (e.key === "Escape") { e.preventDefault(); discard(); }
        }}
        className="w-full resize-none overflow-hidden border-b-2 border-[var(--color-brand-500)]/40 bg-transparent text-2xl font-bold leading-tight text-white outline-none"
        style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.04em" }}
      />
    );
  }

  return (
    <div className="group flex items-start gap-2">
      <h1
        onClick={startEditing}
        className="cursor-pointer text-2xl font-bold leading-tight text-white hover:text-white/90"
        style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.04em" }}
        title="Click to edit"
      >
        {displayValue}
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
  serverLocalEdit,
  attachments,
  onLocalEdit,
  onEditingChange,
  onDiscard,
  onPushToJira,
  isPushing,
  pushError,
  showConflictWarning,
  overrideConfirmed,
  onOverrideChange,
}: {
  ticketKey: string;
  initialDescription: string;
  serverLocalEdit?: { value: string; isDraft: boolean };
  attachments?: Attachment[];
  onLocalEdit: (hasEdit: boolean) => void;
  onEditingChange?: (isEditing: boolean) => void;
  onDiscard?: () => void;
  onPushToJira?: () => Promise<void>;
  isPushing?: boolean;
  pushError?: string | null;
  showConflictWarning?: boolean;
  overrideConfirmed?: boolean;
  onOverrideChange?: (val: boolean) => void;
}) {
  const resolvedInitial = resolveLocalValue(serverLocalEdit?.value, initialDescription, attachments);
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState<string | null>(resolvedInitial ?? null);
  const [editIsDraft, setEditIsDraft] = useState(serverLocalEdit?.isDraft ?? false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifiedDescRef = useRef(false);

  const hasLocalEdit = localValue !== null;
  const value = localValue ?? initialDescription;

  useEffect(() => { onEditingChange?.(editing); }, [editing, onEditingChange]);

  // Notify parent once if we have a server-provided local edit
  useEffect(() => {
    if (serverLocalEdit && !notifiedDescRef.current) {
      notifiedDescRef.current = true;
      onLocalEdit(true);
    }
  }, [serverLocalEdit, onLocalEdit]);

  // Auto-save draft on change (debounced)
  const autoSaveDraft = useCallback((content: string) => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/tickets/${ticketKey}/local-edits`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field: "description", localValue: content.trim(), isDraft: true }),
        });
      } catch { /* ignore */ }
    }, 800);
  }, [ticketKey]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  // beforeunload: flush pending draft save synchronously
  useEffect(() => {
    function handleBeforeUnload() {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        // Use sendBeacon for a last-chance save
        const body = JSON.stringify({ field: "description", localValue: value.trim(), isDraft: true });
        navigator.sendBeacon(`/api/tickets/${ticketKey}/local-edits`, new Blob([body], { type: "application/json" }));
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [ticketKey, value]);

  const handleChange = useCallback((newValue: string) => {
    setLocalValue(newValue);
    if (newValue.trim() !== initialDescription.trim()) {
      setEditIsDraft(true);
      onLocalEdit(true);
      autoSaveDraft(newValue);
    }
  }, [initialDescription, onLocalEdit, autoSaveDraft]);

  const saveLocal = useCallback(async () => {
    if (value.trim() === initialDescription.trim()) {
      setLocalValue(null);
      setEditIsDraft(false);
      onLocalEdit(false);
      // Clean up any draft
      await fetch(`/api/tickets/${ticketKey}/local-edits?draftsOnly=true`, { method: "DELETE" });
      return;
    }
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    await fetch(`/api/tickets/${ticketKey}/local-edits`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "description", localValue: value.trim() }),
    });
    setLocalValue(value.trim());
    setEditIsDraft(false);
    onLocalEdit(true);
  }, [ticketKey, value, initialDescription, onLocalEdit]);

  const save = useCallback(async () => {
    setEditing(false);
    try {
      await saveLocal();
    } catch (err) {
      console.error("Operation failed:", err);
    }
  }, [saveLocal]);

  const handleDiscard = useCallback(() => {
    setEditing(false);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (hasLocalEdit || value.trim() !== initialDescription.trim()) {
      onDiscard?.();
    }
  }, [hasLocalEdit, value, initialDescription, onDiscard]);

  const handlePushToJira = useCallback(async () => {
    try {
      await saveLocal();
    } catch (err) {
      console.error("Failed to save before push:", err);
      return;
    }
    await onPushToJira?.();
  }, [saveLocal, onPushToJira]);

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

  const isDirtyOrLocal = hasLocalEdit || value.trim() !== initialDescription.trim();
  const showPush = isDirtyOrLocal && !!onPushToJira;

  return (
    <div className="mt-6">
      {/* Draft indicator badge */}
      {!editing && hasLocalEdit && editIsDraft && (
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[#4a90d9]/20 bg-[#4a90d9]/[0.06] px-2.5 py-1 text-xs font-medium text-[#4a90d9]/80">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#4a90d9]/70" />
            Unsaved changes
          </span>
        </div>
      )}
      {!editing && hasLocalEdit && !editIsDraft && (
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-brand-500)]/20 bg-[var(--color-brand-500)]/[0.06] px-2.5 py-1 text-xs font-medium text-[var(--color-brand-400)]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-brand-500)]/70" />
            Local edits
          </span>
        </div>
      )}

      {/* Content */}
      {editing ? (
        <RichEditor
          value={value}
          onChange={handleChange}
          onSave={save}
          placeholder="Write a description..."
          minHeight={300}
          stickyToolbar
          fullWidthToolbar
          actions={
            <div className="flex items-center gap-1">
              {pushError && (
                <span className="text-[11px] text-[#e5534b]">{pushError}</span>
              )}
              {showConflictWarning && (
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overrideConfirmed}
                    onChange={(e) => onOverrideChange?.(e.target.checked)}
                    className="h-3 w-3 rounded border-white/20 bg-white/[0.03] accent-[var(--color-brand-500)] cursor-pointer"
                  />
                  <span className="text-[10px] text-white/40">Override remote</span>
                </label>
              )}
              <button
                type="button"
                onClick={handleDiscard}
                className="cursor-pointer flex items-center rounded h-7 px-2 text-[12px] font-medium text-white/35 hover:bg-white/[0.06] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
                style={{ transition: "color 0.15s ease, background-color 0.15s ease" }}
              >
                Discard
              </button>
              <button
                type="button"
                onClick={save}
                className="cursor-pointer flex items-center rounded h-7 bg-white/[0.08] px-2.5 text-[12px] font-medium text-white/70 hover:bg-white/[0.12] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98]"
                style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
              >
                Save
              </button>
              {showPush && (
                <button
                  type="button"
                  disabled={isPushing || (showConflictWarning && !overrideConfirmed)}
                  title={showConflictWarning && !overrideConfirmed ? "Review the diff and confirm before pushing" : undefined}
                  onClick={handlePushToJira}
                  className="cursor-pointer flex items-center gap-1 rounded h-7 bg-[var(--color-brand-600)] px-2.5 text-[12px] font-medium text-white hover:bg-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_2px_8px_rgba(46,145,73,0.15)]"
                  style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
                >
                  {isPushing ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" /> : <CloudUpload size={12} strokeWidth={1.5} />}
                  {isPushing ? "Pushing..." : "Push to Jira"}
                </button>
              )}
            </div>
          }
        />
      ) : (
        <div
          className="description-content cursor-pointer"
          onClick={(e) => {
            if (window.getSelection()?.toString()) return;
            if ((e.target as HTMLElement).closest("summary, a, button")) return;
            setEditing(true);
          }}
          title="Click to edit"
        >
          {renderMarkdown(value)}
        </div>
      )}
    </div>
  );
}

/** Resolve attachment placeholders in a local edit value. */
function resolveLocalValue(
  localValue: string | undefined,
  initialDescription: string,
  attachments?: Attachment[],
): string | undefined {
  if (!localValue) return undefined;

  let resolved = localValue;

  if (attachments && attachments.length > 0) {
    const filenameToId = new Map(attachments.map((a) => [a.filename, a.id]));
    resolved = resolved.replace(
      /!\[([^\]]*)\]\(attachment[^)]*\)/g,
      (_match: string, alt: string) => {
        const id = filenameToId.get(alt);
        return id ? `![${alt}](/api/attachments/${id})` : `![${alt}](attachment)`;
      },
    );
  }

  // Restore images that were stripped by TipTap
  const resolvedImageRe = /!\[[^\]]*\]\(\/api\/attachments\/[^)]+\)/;
  const hasImages = (text: string) => resolvedImageRe.test(text);
  if (hasImages(initialDescription) && !hasImages(resolved)) {
    const imageLines = initialDescription
      .split("\n")
      .filter((line) => /^!\[[^\]]*\]\(\/api\/attachments\/[^)]+\)$/.test(line.trim()));
    if (imageLines.length > 0) {
      resolved = resolved.trimEnd() + "\n\n" + imageLines.join("\n");
    }
  }

  return resolved;
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
                <div className="description-content mt-1 text-sm leading-[1.7] text-white/50">{renderMarkdown(comment.content)}</div>
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
                  <div className="description-content mt-1 text-sm leading-[1.7] text-white/50">{renderMarkdown(comment.content)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
