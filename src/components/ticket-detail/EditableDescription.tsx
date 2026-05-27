"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Attachment } from "@/types/ticket";
import { CloudUpload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { apiFetch, tickets } from "@/lib/api-client";
import { renderMarkdown } from "./renderMarkdown";
import { RichEditor } from "@/components/rich-editor/RichEditor";
import { usePrismLanguages } from "@/hooks/usePrismLanguages";

/** Resolve attachment placeholders in a local edit value. */
export function resolveLocalValue(
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
  onViewDiff,
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
  onViewDiff?: () => void;
}) {
  const resolvedInitial = resolveLocalValue(serverLocalEdit?.value, initialDescription, attachments);
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState<string | null>(resolvedInitial ?? null);
  const [editIsDraft, setEditIsDraft] = useState(serverLocalEdit?.isDraft ?? false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifiedDescRef = useRef(false);
  // Only call onLocalEdit(true) once per editing session to avoid parent re-renders per keystroke
  const localEditNotifiedRef = useRef(false);

  const hasLocalEdit = localValue !== null;
  const value = localValue ?? initialDescription;
  usePrismLanguages(value);

  // Call onEditingChange synchronously so the parent hides the title header
  // in the same React render as the editor mounting — prevents a one-frame layout bounce.
  const setEditingState = useCallback((next: boolean) => {
    setEditing(next);
    onEditingChange?.(next);
  }, [onEditingChange]);

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
        await tickets.saveLocalEdit(ticketKey, { field: "description", localValue: content.trim(), isDraft: true });
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
      if (!localEditNotifiedRef.current) {
        localEditNotifiedRef.current = true;
        onLocalEdit(true);
      }
      autoSaveDraft(newValue);
    }
  }, [initialDescription, onLocalEdit, autoSaveDraft]);

  const saveLocal = useCallback(async () => {
    if (value.trim() === initialDescription.trim()) {
      setLocalValue(null);
      setEditIsDraft(false);
      localEditNotifiedRef.current = false;
      onLocalEdit(false);
      // Clean up any draft
      await apiFetch<void>(`/api/tickets/${encodeURIComponent(ticketKey)}/local-edits?draftsOnly=true`, { method: "DELETE" });
      return;
    }
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    await tickets.saveLocalEdit(ticketKey, { field: "description", localValue: value.trim() });
    setLocalValue(value.trim());
    setEditIsDraft(false);
    onLocalEdit(true);
  }, [ticketKey, value, initialDescription, onLocalEdit]);

  const save = useCallback(async () => {
    setEditingState(false);
    try {
      await saveLocal();
    } catch (err) {
      console.error("Operation failed:", err);
    }
  }, [saveLocal, setEditingState]);

  const handleDiscard = useCallback(() => {
    setEditingState(false);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (hasLocalEdit || value.trim() !== initialDescription.trim()) {
      onDiscard?.();
    }
  }, [hasLocalEdit, value, initialDescription, onDiscard, setEditingState]);

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
        setEditingState(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editing, setEditingState]);

  const isDirtyOrLocal = hasLocalEdit || value.trim() !== initialDescription.trim();
  const showPush = isDirtyOrLocal && !!onPushToJira;

  return (
    <div className="mt-6">
      {/* Draft indicator badge */}
      {!editing && hasLocalEdit && editIsDraft && (
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-icon-task)]/20 bg-[var(--color-icon-task)]/[0.06] px-2.5 py-1 text-xs font-medium text-[var(--color-icon-task)]/80">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-icon-task)]/70" />
            Unsaved changes
          </span>
        </div>
      )}
      {!editing && hasLocalEdit && !editIsDraft && (
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onViewDiff}
            className={`inline-flex items-center gap-1.5 rounded-md border border-[var(--color-brand-500)]/20 bg-[var(--color-brand-500)]/[0.06] px-2.5 py-1 text-xs font-medium text-[var(--color-brand-400)]${onViewDiff ? " cursor-pointer hover:bg-[var(--color-brand-500)]/[0.12] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-500)]/50" : ""}`}
            style={{ transition: "background-color 0.15s ease" }}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-brand-500)]/70" />
            Local edits
          </button>
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
                <span className="text-label text-[var(--color-status-error)]">{pushError}</span>
              )}
              {showConflictWarning && (
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overrideConfirmed}
                    onChange={(e) => onOverrideChange?.(e.target.checked)}
                    className="h-3 w-3 rounded border-border-strong bg-overlay-subtle accent-[var(--color-brand-500)] cursor-pointer"
                  />
                  <span className="text-caption text-text-tertiary">Override remote</span>
                </label>
              )}
              <Button
                variant="ghost"
                size="md"
                onClick={handleDiscard}
                className="!text-text-tertiary hover:!text-text-secondary !text-body-sm"
              >
                Discard
              </Button>
              <Button
                variant="ghost"
                size="md"
                onClick={save}
                className="!bg-overlay-strong !text-text-secondary hover:!bg-overlay-strong hover:!text-text-primary !text-body-sm"
              >
                Save
              </Button>
              {showPush && (
                <Button
                  variant="primary"
                  size="md"
                  disabled={isPushing || (showConflictWarning && !overrideConfirmed)}
                  title={showConflictWarning && !overrideConfirmed ? "Review the diff and confirm before pushing" : undefined}
                  onClick={handlePushToJira}
                  icon={isPushing ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" /> : <CloudUpload size={12} strokeWidth={1.5} />}
                  className="!text-body-sm"
                >
                  {isPushing ? "Pushing..." : "Push to Jira"}
                </Button>
              )}
            </div>
          }
        />
      ) : value.trim() ? (
        <div
          className="description-content cursor-pointer"
          onClick={(e) => {
            if (window.getSelection()?.toString()) return;
            if ((e.target as HTMLElement).closest("summary, a, button")) return;
            setEditingState(true);
          }}
          title="Click to edit"
        >
          {renderMarkdown(value)}
        </div>
      ) : (
        <p
          className="mt-3 text-sm text-text-muted cursor-pointer"
          onClick={() => setEditingState(true)}
          title="Click to edit"
        >
          No description
        </p>
      )}
    </div>
  );
}
