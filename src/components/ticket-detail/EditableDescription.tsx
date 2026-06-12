"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { Attachment } from "@/types/ticket";
import { CloudUpload, Loader2, ChevronDown, Save, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { apiFetch, tickets } from "@/lib/api-client";
import { useTicketEditStateSync } from "@/hooks/useTicketEditStateSync";
import type { TicketEditState } from "@/types/ticket";
import { markdownEqualIgnoringSpacing, normalizeMarkdownForCompare } from "@/lib/normalize-markdown";
import { renderMarkdown } from "./renderMarkdown";
import { Checkbox } from "@/components/shared/Checkbox";
import { RichEditor } from "@/components/rich-editor/RichEditor";
import { StoryDiff } from "@/components/story-diff/StoryDiff";
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
  toolbarPortalId,
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
  toolbarPortalId?: string;
}) {
  const syncEditState = useTicketEditStateSync();
  const resolvedInitial = resolveLocalValue(serverLocalEdit?.value, initialDescription, attachments);
  // A server-side edit that differs from the Jira version only in cosmetic
  // blank-line spacing is a serializer round-trip artifact, not a real edit.
  // Ignore it so the "Unsaved changes" badge and push button do not appear for
  // a no-op (the recurring "lots of changed empty lines" complaint).
  const serverEditIsCosmetic = useMemo(
    () => resolvedInitial !== undefined && markdownEqualIgnoringSpacing(resolvedInitial, initialDescription),
    [resolvedInitial, initialDescription],
  );
  const effectiveInitial = serverEditIsCosmetic ? undefined : resolvedInitial;
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState<string | null>(effectiveInitial ?? null);
  const [editIsDraft, setEditIsDraft] = useState(serverLocalEdit?.isDraft ?? false);
  const [showDraftDiff, setShowDraftDiff] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifiedDescRef = useRef(false);
  // Only call onLocalEdit(true) once per editing session to avoid parent re-renders per keystroke
  const localEditNotifiedRef = useRef(false);

  const hasLocalEdit = localValue !== null;
  const value = localValue ?? initialDescription;

  // Ref mirrors for unmount flush (cleanup closures cannot read latest state)
  const valueRef = useRef(value);
  const ticketKeyRef = useRef(ticketKey);
  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { ticketKeyRef.current = ticketKey; }, [ticketKey]);
  usePrismLanguages(value);

  // Call onEditingChange synchronously so the parent hides the title header
  // in the same React render as the editor mounting — prevents a one-frame layout bounce.
  const setEditingState = useCallback((next: boolean) => {
    setEditing(next);
    onEditingChange?.(next);
  }, [onEditingChange]);

  // Notify parent once if we have a server-provided local edit. Skip (and clean
  // up) cosmetic-only drafts so they never surface as pending changes.
  useEffect(() => {
    if (serverEditIsCosmetic) {
      apiFetch<{ editState?: TicketEditState }>(
        `/api/tickets/${encodeURIComponent(ticketKey)}/local-edits?draftsOnly=true`,
        { method: "DELETE" },
      )
        .then((res) => syncEditState(ticketKey, res?.editState ?? "clean"))
        .catch(() => { /* best-effort cleanup */ });
      return;
    }
    if (serverLocalEdit && !notifiedDescRef.current) {
      notifiedDescRef.current = true;
      onLocalEdit(true);
    }
  }, [serverLocalEdit, onLocalEdit, serverEditIsCosmetic, ticketKey, syncEditState]);

  // Auto-save draft on change (debounced)
  const autoSaveDraft = useCallback((content: string) => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        await tickets.saveLocalEdit(ticketKey, { field: "description", localValue: content.trim(), isDraft: true });
        syncEditState(ticketKey, "local_edits");
      } catch { /* ignore */ }
    }, 800);
  }, [ticketKey, syncEditState]);

  // Flush pending draft on unmount (e.g. ticket navigation) via sendBeacon
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        const body = JSON.stringify({ field: "description", localValue: valueRef.current.trim(), isDraft: true });
        navigator.sendBeacon(
          `/api/tickets/${ticketKeyRef.current}/local-edits`,
          new Blob([body], { type: "application/json" }),
        );
      }
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
    if (!markdownEqualIgnoringSpacing(newValue, initialDescription)) {
      setEditIsDraft(true);
      if (!localEditNotifiedRef.current) {
        localEditNotifiedRef.current = true;
        onLocalEdit(true);
      }
      autoSaveDraft(newValue);
    }
  }, [initialDescription, onLocalEdit, autoSaveDraft]);

  const saveLocal = useCallback(async () => {
    if (markdownEqualIgnoringSpacing(value, initialDescription)) {
      setLocalValue(null);
      setEditIsDraft(false);
      localEditNotifiedRef.current = false;
      onLocalEdit(false);
      // Clean up any draft
      const res = await apiFetch<{ editState?: TicketEditState }>(`/api/tickets/${encodeURIComponent(ticketKey)}/local-edits?draftsOnly=true`, { method: "DELETE" });
      syncEditState(ticketKey, res?.editState ?? "clean");
      return;
    }
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    await tickets.saveLocalEdit(ticketKey, { field: "description", localValue: value.trim() });
    setLocalValue(value.trim());
    setEditIsDraft(false);
    onLocalEdit(true);
    syncEditState(ticketKey, "local_edits");
  }, [ticketKey, value, initialDescription, onLocalEdit, syncEditState]);

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
    if (hasLocalEdit || !markdownEqualIgnoringSpacing(value, initialDescription)) {
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

  const isDirtyOrLocal = hasLocalEdit || !markdownEqualIgnoringSpacing(value, initialDescription);
  const showPush = isDirtyOrLocal && !!onPushToJira;

  return (
    <div className={!editing && hasLocalEdit ? "mt-2" : "mt-6"}>
      {/* Local-edit indicator badge: click to reveal an inline diff of the changes. */}
      {!editing && hasLocalEdit && (
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setShowDraftDiff((v) => !v)}
            aria-expanded={showDraftDiff}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-body-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 ${
              editIsDraft
                ? "border-[var(--color-icon-task)]/20 bg-[var(--color-icon-task)]/[0.06] text-[var(--color-icon-task)]/80 hover:bg-[var(--color-icon-task)]/[0.12] focus-visible:outline-[var(--color-icon-task)]/50"
                : "border-[var(--color-brand-500)]/20 bg-[var(--color-brand-500)]/[0.06] text-[var(--color-brand-400)] hover:bg-[var(--color-brand-500)]/[0.12] focus-visible:outline-[var(--color-brand-500)]/50"
            }`}
            style={{ transition: "background-color 0.15s ease" }}
          >
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${editIsDraft ? "bg-[var(--color-icon-task)]/70" : "bg-[var(--color-brand-500)]/70"}`} />
            {editIsDraft ? "Unsaved changes" : "Local edits"}
            <ChevronDown
              size={14}
              strokeWidth={1.5}
              style={{ transition: "transform 0.15s ease", transform: showDraftDiff ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          </button>
          {showDraftDiff && (
            <div className="mt-3 rounded-lg border border-border-strong">
              <div className="p-3 pb-0">
                <StoryDiff
                  oldText={normalizeMarkdownForCompare(initialDescription)}
                  newText={normalizeMarkdownForCompare(value)}
                  mode="unified"
                />
              </div>
              {/* Sticky so the resolve actions stay reachable while scrolling a long diff. */}
              <div className="sticky bottom-0 z-10 flex items-center justify-end gap-1 rounded-b-lg border-t border-border-default bg-[var(--color-surface-elevated)]/95 px-3 py-3 backdrop-blur-sm">
                {pushError && (
                  <span className="mr-auto text-label text-[var(--color-status-error)]">{pushError}</span>
                )}
                {showConflictWarning && showPush && (
                  <label className="mr-2 flex cursor-pointer items-center gap-1.5">
                    <Checkbox checked={!!overrideConfirmed} />
                    <input
                      type="checkbox"
                      checked={overrideConfirmed}
                      onChange={(e) => onOverrideChange?.(e.target.checked)}
                      className="sr-only"
                    />
                    <span className="text-caption text-text-tertiary">Override remote</span>
                  </label>
                )}
                <Button
                  variant="ghost"
                  size="md"
                  onClick={handleDiscard}
                  title="Discard local changes and revert to the Jira version"
                  className="!text-text-tertiary hover:!text-text-secondary !text-body-sm"
                >
                  Discard
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
            </div>
          )}
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
          toolbarPortalId={toolbarPortalId}
          actions={
            <div className="flex items-center gap-1">
              {pushError && (
                <span className="text-label text-[var(--color-status-error)]">{pushError}</span>
              )}
              {showConflictWarning && (
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox checked={!!overrideConfirmed} />
                  <input
                    type="checkbox"
                    checked={overrideConfirmed}
                    onChange={(e) => onOverrideChange?.(e.target.checked)}
                    className="sr-only"
                  />
                  <span className="text-caption text-text-tertiary">Override remote</span>
                </label>
              )}
              <Button
                variant="ghost"
                size="md"
                onClick={handleDiscard}
                title="Discard"
                icon={<RotateCcw size={13} strokeWidth={1.5} />}
                className="!text-text-tertiary hover:!text-text-secondary !text-body-sm"
              >
                <span className="hidden @2xl:inline">Discard</span>
              </Button>
              <Button
                variant="ghost"
                size="md"
                onClick={save}
                title="Save"
                icon={<Save size={13} strokeWidth={1.5} />}
                className="!bg-overlay-strong !text-text-secondary hover:!bg-overlay-strong hover:!text-text-primary !text-body-sm"
              >
                <span className="hidden @2xl:inline">Save</span>
              </Button>
              {showPush && (
                <Button
                  variant="primary"
                  size="md"
                  disabled={isPushing || (showConflictWarning && !overrideConfirmed)}
                  title={showConflictWarning && !overrideConfirmed ? "Review the diff and confirm before pushing" : "Push to Jira"}
                  onClick={handlePushToJira}
                  icon={isPushing ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" /> : <CloudUpload size={12} strokeWidth={1.5} />}
                  className="!text-body-sm"
                >
                  <span className="hidden @2xl:inline">{isPushing ? "Pushing..." : "Push to Jira"}</span>
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
          {renderMarkdown(value, { linkifyRefs: true })}
        </div>
      ) : (
        <p
          className="mt-3 text-body-lg text-text-muted cursor-pointer"
          onClick={() => setEditingState(true)}
          title="Click to edit"
        >
          No description
        </p>
      )}
    </div>
  );
}
