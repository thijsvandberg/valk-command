"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { Attachment } from "@/types/ticket";
import { CloudUpload, Loader2, ChevronDown, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/api-client";
import { useLocalEditSaver, type LocalEditSaver } from "@/lib/local-edit-saver";
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
  saver: externalSaver,
  onConflictReload,
}: {
  ticketKey: string;
  initialDescription: string;
  serverLocalEdit?: { value: string; isDraft: boolean; modifiedAt?: string };
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
  /** Shared concurrency saver (detail page passes one shared with the title editor). */
  saver?: LocalEditSaver;
  /** When provided, the cross-tab conflict banner offers "Reload draft" via this handler. */
  onConflictReload?: () => void | Promise<void>;
}) {
  const syncEditState = useTicketEditStateSync();
  const ownSaver = useLocalEditSaver();
  const saver = externalSaver ?? ownSaver;
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
  const [showDraftDiff, setShowDraftDiff] = useState(false);
  // Autosave is the only save; this drives the quiet Saving…/Saved indicator.
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifiedDescRef = useRef(false);
  // Only call onLocalEdit(true) once per editing session to avoid parent re-renders per keystroke
  const localEditNotifiedRef = useRef(false);

  // Seed the concurrency token from the server payload so even the first save
  // after load is protected against another surface's edits (BRDG-340).
  const tokenSeededRef = useRef(false);
  const seededModifiedAt = serverLocalEdit?.modifiedAt;
  useEffect(() => {
    if (!tokenSeededRef.current && seededModifiedAt) {
      tokenSeededRef.current = true;
      saver.setToken(ticketKey, "description", seededModifiedAt);
    }
  }, [seededModifiedAt, saver, ticketKey]);

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

  // Auto-save on change (debounced). This IS the save — there is no Save
  // button anymore (BRDG-340). Carries the concurrency token via the saver.
  const autoSaveDraft = useCallback((content: string) => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setSaveState("saving");
    autoSaveTimerRef.current = setTimeout(async () => {
      autoSaveTimerRef.current = null;
      if (saver.isPaused()) return;
      try {
        await saver.persistLocalEdit(ticketKey, "description", content.trim(), { isDraft: true });
        syncEditState(ticketKey, "local_edits");
        setSaveState("saved");
      } catch { /* 409 surfaces via saver.conflict; other errors retry on the next edit */ }
    }, 800);
  }, [ticketKey, syncEditState, saver]);

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
      if (!localEditNotifiedRef.current) {
        localEditNotifiedRef.current = true;
        onLocalEdit(true);
      }
      autoSaveDraft(newValue);
    }
  }, [initialDescription, onLocalEdit, autoSaveDraft]);

  /**
   * Flush the pending debounce right now (close paths: Escape, Cmd-S, push).
   * When the content reverted to the Jira version, clean the edit up instead.
   */
  const flushPending = useCallback(async () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (markdownEqualIgnoringSpacing(value, initialDescription)) {
      setLocalValue(null);
      localEditNotifiedRef.current = false;
      onLocalEdit(false);
      if (!hasLocalEdit && saveState === "idle") return;
      const res = await apiFetch<{ editState?: TicketEditState }>(`/api/tickets/${encodeURIComponent(ticketKey)}/local-edits?draftsOnly=true`, { method: "DELETE" });
      syncEditState(ticketKey, res?.editState ?? "clean");
      setSaveState("idle");
      return;
    }
    if (saver.isPaused()) return;
    await saver.persistLocalEdit(ticketKey, "description", value.trim(), { isDraft: true });
    setLocalValue(value.trim());
    onLocalEdit(true);
    syncEditState(ticketKey, "local_edits");
    setSaveState("saved");
  }, [ticketKey, value, initialDescription, hasLocalEdit, saveState, onLocalEdit, syncEditState, saver]);

  const save = useCallback(async () => {
    setEditingState(false);
    try {
      await flushPending();
    } catch (err) {
      console.error("Operation failed:", err);
    }
  }, [flushPending, setEditingState]);

  const handleDiscard = useCallback(() => {
    setEditingState(false);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (hasLocalEdit || !markdownEqualIgnoringSpacing(value, initialDescription)) {
      onDiscard?.();
    }
  }, [hasLocalEdit, value, initialDescription, onDiscard, setEditingState]);

  const handlePushToJira = useCallback(async () => {
    try {
      await flushPending();
    } catch (err) {
      console.error("Failed to save before push:", err);
      return;
    }
    await onPushToJira?.();
  }, [flushPending, onPushToJira]);

  useEffect(() => {
    if (!editing) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        // Closing never loses work: flush whatever the debounce still holds.
        void save();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editing, save]);

  const isDirtyOrLocal = hasLocalEdit || !markdownEqualIgnoringSpacing(value, initialDescription);
  const showPush = isDirtyOrLocal && !!onPushToJira;

  return (
    <div className={!editing && hasLocalEdit ? "mt-2" : "mt-6"}>
      {/* Cross-tab conflict: autosave is paused until the PO picks a side. */}
      {saver.conflict && (
        <div className="mb-3 flex items-center gap-3 rounded-md border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2 text-body-sm text-amber-400">
          <span className="flex-1">This draft was changed in another tab. Autosave is paused.</span>
          {onConflictReload && (
            <button
              type="button"
              onClick={() => { saver.clearConflict(); void onConflictReload(); }}
              className="shrink-0 rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-body-sm font-medium text-amber-400 cursor-pointer hover:bg-amber-500/20 transition-colors duration-150"
            >
              Reload draft
            </button>
          )}
          <button
            type="button"
            onClick={() => { void saver.overwrite().catch(() => {}); }}
            className="shrink-0 rounded-md border border-amber-500/20 px-2.5 py-1 text-body-sm font-medium text-amber-400/80 cursor-pointer hover:bg-amber-500/10 transition-colors duration-150"
          >
            Overwrite
          </button>
        </div>
      )}
      {/* Local-edit indicator badge: click to reveal an inline diff of the changes. */}
      {!editing && hasLocalEdit && (
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setShowDraftDiff((v) => !v)}
            aria-expanded={showDraftDiff}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-body-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 border-[var(--color-brand-500)]/20 bg-[var(--color-brand-500)]/[0.06] text-[var(--color-brand-400)] hover:bg-[var(--color-brand-500)]/[0.12] focus-visible:outline-[var(--color-brand-500)]/50"
            style={{ transition: "background-color 0.15s ease" }}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-brand-500)]/70" />
            Local edits
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
              {/* Autosave is the save; this only reports it (BRDG-340). */}
              {saveState !== "idle" && (
                <span className="flex items-center gap-1.5 pr-1 text-label font-medium text-text-muted">
                  {saveState === "saving" ? (
                    <>
                      <Loader2 size={12} strokeWidth={1.75} className="animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Check size={12} strokeWidth={2} className="text-[var(--color-brand-400)]" />
                      Saved
                    </>
                  )}
                </span>
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
