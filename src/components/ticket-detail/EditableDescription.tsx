"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { Attachment } from "@/types/ticket";
import { CloudUpload, Loader2, ChevronDown, Check, RotateCcw, X, AlertTriangle, Info } from "lucide-react";
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
import { describeDescriptionSize, JIRA_DESCRIPTION_LIMIT } from "@/lib/jira-content-limits";
import { CONTENT_LIMIT_MESSAGE } from "@/lib/push-error-message";

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
  onClearPushError,
  showConflictWarning,
  overrideConfirmed,
  onOverrideChange,
  toolbarPortalId,
  saver: externalSaver,
  onConflictReload,
  titleInitial,
  titleLocalValue,
}: {
  ticketKey: string;
  initialDescription: string;
  serverLocalEdit?: { value: string; isDraft: boolean; modifiedAt?: string };
  attachments?: Attachment[];
  onLocalEdit: (hasEdit: boolean) => void;
  onEditingChange?: (isEditing: boolean) => void;
  onDiscard?: () => void;
  onPushToJira?: (pushed?: { description?: string }) => Promise<void>;
  isPushing?: boolean;
  pushError?: string | null;
  /** Clears a stale push failure once the PO edits the description (BRDG-349). */
  onClearPushError?: () => void;
  showConflictWarning?: boolean;
  overrideConfirmed?: boolean;
  onOverrideChange?: (val: boolean) => void;
  toolbarPortalId?: string;
  /** Shared concurrency saver (detail page passes one shared with the title editor). */
  saver?: LocalEditSaver;
  /** When provided, the cross-tab conflict banner offers "Reload draft" via this handler. */
  onConflictReload?: () => void | Promise<void>;
  /** Jira title and its current local value. A title-only edit surfaces through
   *  this component's "Local edits" badge so all local edits share one affordance. */
  titleInitial?: string;
  titleLocalValue?: string | null;
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
  // Live size feedback against Jira's content limit (BRDG-349). Derived in render
  // from `value` (no state/effect) - approximate, see jira-content-limits.ts.
  const descSize = describeDescriptionSize(value.length);

  // A failed push reports its reason via `pushError`. A content-limit rejection
  // is the authoritative truth (Jira measured the rendered ADF), so it outranks
  // our local estimate - even when the estimate still reads "near/under", because
  // the rendered ADF is larger than the markdown we count. The stale failure is
  // cleared the moment the PO edits the description (handleChange -> onClearPushError).
  const sizePushError = pushError === CONTENT_LIMIT_MESSAGE;
  const otherPushError = pushError && !sizePushError ? pushError : null;

  // The size figures are an estimate: Jira validates the rendered ADF, not the raw
  // markdown we count here, so the copy and the "~" prefix keep it advisory rather
  // than a hard cutoff. The push toast / confirmed-failure banner is authoritative.
  const APPROX_TITLE =
    "Estimate — Jira measures the rendered content, so the exact limit may differ.";
  const charsLeft = Math.max(0, JIRA_DESCRIPTION_LIMIT - value.length);

  // The over-limit banner is a WARNING (orange) while it is only our estimate:
  // the push is still allowed. It escalates to a confirmed ERROR (red) once a push
  // is actually rejected by Jira for the content limit, regardless of the estimate.
  const overWarn = descSize.state === "over" && !sizePushError;

  // Single full-width notice row beneath the toolbar buttons. Priority: a real
  // push failure (confirmed by Jira), then the live over/near size estimate.
  const noticeRow: React.ReactNode = otherPushError ? (
    <div
      className="flex items-center gap-2.5 border-t border-[var(--color-status-error)]/20 bg-[var(--color-status-error)]/10 px-3.5 py-2.5"
      style={{ animation: "fadeInUp 0.18s ease-out" }}
      role="alert"
    >
      <AlertTriangle size={14} strokeWidth={2} className="shrink-0 text-[var(--color-status-error)]" />
      <span className="text-body-sm font-medium text-[var(--color-status-error)]">{otherPushError}</span>
    </div>
  ) : sizePushError ? (
    <div
      className="flex items-center gap-2.5 border-t border-[var(--color-status-error)]/20 bg-[var(--color-status-error)]/10 px-3.5 py-2.5"
      style={{ animation: "fadeInUp 0.18s ease-out" }}
      role="alert"
    >
      <AlertTriangle size={14} strokeWidth={2} className="shrink-0 text-[var(--color-status-error)]" />
      <span className="text-body-sm font-medium text-[var(--color-status-error)]">
        Jira rejected this description &mdash; it is too large. Trim it and push again.
      </span>
    </div>
  ) : overWarn ? (
    <div
      className="flex items-center gap-2.5 border-t border-[var(--color-status-warning)]/20 bg-[var(--color-status-warning)]/10 px-3.5 py-2.5"
      style={{ animation: "fadeInUp 0.18s ease-out" }}
      role="status"
      title={APPROX_TITLE}
    >
      <AlertTriangle size={14} strokeWidth={2} className="shrink-0 text-[var(--color-status-warning)]" />
      <span className="text-body-sm font-medium text-[var(--color-status-warning)]">
        Likely too large for Jira &mdash; trim before pushing
      </span>
      <span className="ml-auto shrink-0 rounded-full bg-[var(--color-status-warning)]/15 px-2.5 py-0.5 text-body-sm font-semibold tabular-nums text-[var(--color-status-warning)]">
        ~{descSize.over.toLocaleString()} characters over
      </span>
    </div>
  ) : descSize.state === "near" ? (
    <div
      className="flex items-center gap-2.5 border-t border-border-default bg-surface-base px-3.5 py-2.5"
      style={{ animation: "fadeInUp 0.18s ease-out" }}
      title={APPROX_TITLE}
    >
      <Info size={14} strokeWidth={2} className="shrink-0 text-text-muted" />
      <span className="text-body-sm font-medium text-text-secondary">Getting close to Jira&apos;s size limit</span>
      <span className="ml-auto shrink-0 text-body-sm tabular-nums text-text-muted">
        ~{charsLeft.toLocaleString()} characters left
      </span>
    </div>
  ) : null;

  // Ref mirrors for unmount flush (cleanup closures cannot read latest state)
  const valueRef = useRef(value);
  const ticketKeyRef = useRef(ticketKey);
  // The Jira baseline, mirrored so the empty-dep unmount cleanup compares the
  // current value against the current baseline (not the first-render closure).
  const initialDescriptionRef = useRef(initialDescription);
  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { ticketKeyRef.current = ticketKey; }, [ticketKey]);
  useEffect(() => { initialDescriptionRef.current = initialDescription; }, [initialDescription]);
  usePrismLanguages(value);

  // Call onEditingChange synchronously so the parent hides the title header
  // in the same React render as the editor mounting — prevents a one-frame layout bounce.
  const setEditingState = useCallback((next: boolean) => {
    // Reset the indicator on open so "Saved · Done" only appears after the PO
    // actually types in this session, not because a prior session left it set.
    if (next) setSaveState("idle");
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

  // Flush pending draft on unmount (e.g. ticket navigation) via sendBeacon.
  // Skip the beacon for a cosmetic-only value (round-trip artefacts): persisting
  // it would leave a no-op draft masquerading as a pending change (BRDG-350).
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        if (markdownEqualIgnoringSpacing(valueRef.current, initialDescriptionRef.current)) return;
        const body = JSON.stringify({ field: "description", localValue: valueRef.current.trim(), isDraft: true });
        navigator.sendBeacon(
          `/api/tickets/${ticketKeyRef.current}/local-edits`,
          new Blob([body], { type: "application/json" }),
        );
      }
    };
  }, []);

  // beforeunload: flush pending draft save synchronously. Same cosmetic-only
  // skip as the unmount flush so a round-trip no-op is never persisted (BRDG-350).
  useEffect(() => {
    function handleBeforeUnload() {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        if (markdownEqualIgnoringSpacing(value, initialDescription)) return;
        // Use sendBeacon for a last-chance save
        const body = JSON.stringify({ field: "description", localValue: value.trim(), isDraft: true });
        navigator.sendBeacon(`/api/tickets/${ticketKey}/local-edits`, new Blob([body], { type: "application/json" }));
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [ticketKey, value, initialDescription]);

  const handleChange = useCallback((newValue: string) => {
    setLocalValue(newValue);
    // Any edit invalidates the previous push result, so drop a stale failure
    // banner (e.g. the content-limit error) the moment the PO starts fixing it.
    if (pushError) onClearPushError?.();
    if (!markdownEqualIgnoringSpacing(newValue, initialDescription)) {
      if (!localEditNotifiedRef.current) {
        localEditNotifiedRef.current = true;
        onLocalEdit(true);
      }
      autoSaveDraft(newValue);
    } else if (autoSaveTimerRef.current) {
      // Reverted to a cosmetic-only value: cancel the pending autosave so the
      // pre-revert value is not persisted in-place (BRDG-350). The existing
      // draft, if any, is cleaned up by flushPending on blur/close.
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
      setSaveState("idle");
    }
  }, [initialDescription, onLocalEdit, autoSaveDraft, pushError, onClearPushError]);

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
    // Only surface "Saved" if the PO actually edited this session. Flushing a
    // pre-existing local edit (e.g. on push without typing) should stay quiet.
    if (saveState !== "idle") setSaveState("saved");
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
    // Hand the pushed content to the page: the post-push cache patch needs the
    // editor's value because the SWR cache does not track autosaved drafts and
    // a dev-mode refetch can return stale data (BRDG-340).
    await onPushToJira?.({ description: value.trim() });
  }, [flushPending, onPushToJira, value]);

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
  // A title-only edit also surfaces here: the badge, diff and push/discard cover
  // the whole local-edit set, not just the description.
  const hasTitleEdit = titleLocalValue != null && titleLocalValue.trim() !== (titleInitial ?? "").trim();
  const hasAnyLocalEdit = hasLocalEdit || hasTitleEdit;
  const showPush = (isDirtyOrLocal || hasTitleEdit) && !!onPushToJira;
  const showSectionHeaders = hasTitleEdit && hasLocalEdit;

  return (
    <div className={!editing && hasAnyLocalEdit ? "mt-2" : "mt-6"}>
      {/* Cross-tab conflict: autosave is paused until the PO picks a side. */}
      {saver.conflict && (
        <div className="mb-3 flex items-center gap-3 rounded-md border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2 text-body-sm text-amber-400">
          <span className="flex-1">This draft was changed in another tab. Autosave is paused.</span>
          {onConflictReload && (
            <button
              type="button"
              onClick={() => { saver.clearConflict(); void onConflictReload(); }}
              className="shrink-0 rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-body-sm font-medium text-amber-400 cursor-pointer hover:bg-amber-500/20 transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              Reload draft
            </button>
          )}
          <button
            type="button"
            onClick={() => { void saver.overwrite().catch(() => {}); }}
            className="shrink-0 rounded-md border border-amber-500/20 px-2.5 py-1 text-body-sm font-medium text-amber-400/80 cursor-pointer hover:bg-amber-500/10 transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          >
            Overwrite
          </button>
        </div>
      )}
      {/* Local-edit indicator badge: click to reveal an inline diff of the changes.
          Covers title-only edits too, so all local edits share one affordance. */}
      {!editing && hasAnyLocalEdit && (
        <div className="mb-3">
          {/* The push lives here too, not only inside the expanded diff: a
              title-only edit never opens the description editor, so without this
              the only push affordance would be hidden behind the diff toggle. */}
          <div className="flex flex-wrap items-center gap-2">
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
            {/* Only when collapsed: once expanded, the diff card's own sticky
                push (with the override control) takes over. */}
            {showPush && !showDraftDiff && (
              <Button
                variant="primary"
                size="md"
                disabled={isPushing || (showConflictWarning && !overrideConfirmed)}
                title={showConflictWarning && !overrideConfirmed ? "Expand the diff to review and confirm before pushing" : "Push to Jira"}
                onClick={handlePushToJira}
                icon={isPushing ? <Loader2 size={12} strokeWidth={2} className="animate-spin" /> : <CloudUpload size={12} strokeWidth={2.5} />}
                className="!text-body-sm"
              >
                {isPushing ? "Pushing..." : "Push to Jira"}
              </Button>
            )}
            {pushError && !showDraftDiff && (
              <span className="text-label text-[var(--color-status-error)]">{pushError}</span>
            )}
          </div>
          {showDraftDiff && (
            <div className="mt-3 rounded-lg border border-border-strong">
              <div className="space-y-4 p-3">
                {hasTitleEdit && (
                  <div>
                    {/* Always label the title diff so a title-only change is unmistakably about the title. */}
                    <div className="mb-1.5 text-caption font-medium uppercase tracking-wide text-text-muted">Title</div>
                    <StoryDiff oldText={titleInitial ?? ""} newText={titleLocalValue ?? ""} mode="unified" />
                  </div>
                )}
                {hasLocalEdit && (
                  <div>
                    {showSectionHeaders && (
                      <div className="mb-1.5 text-caption font-medium uppercase tracking-wide text-text-muted">Description</div>
                    )}
                    <StoryDiff
                      oldText={normalizeMarkdownForCompare(initialDescription)}
                      newText={normalizeMarkdownForCompare(value)}
                      mode="unified"
                    />
                  </div>
                )}
              </div>
              {/* Sticky so the resolve actions stay reachable while scrolling a long diff. */}
              <div className="sticky bottom-0 z-10 flex items-center justify-end gap-1 rounded-b-lg border-t border-border-default bg-surface-elevated/95 px-3 py-3 backdrop-blur-sm">
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
                  onClick={() => onDiscard?.()}
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
                    icon={isPushing ? <Loader2 size={12} strokeWidth={2} className="animate-spin" /> : <CloudUpload size={12} strokeWidth={2.5} />}
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
          toolbarNotice={noticeRow}
          actions={
            <div className="flex items-center gap-1">
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
                <span className="flex items-center gap-1.5 pr-3 text-label font-medium text-text-muted">
                  {saveState === "saving" ? (
                    <>
                      <Loader2 size={12} strokeWidth={1.75} className="animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Check size={12} strokeWidth={2} className="text-[var(--color-brand-400)]" />
                      Saved
                      <span className="text-text-disabled" aria-hidden>·</span>
                      {/* Autosave means closing never loses work; this is the calm "I'm done" exit. */}
                      <button
                        type="button"
                        onClick={() => void save()}
                        className="cursor-pointer font-medium text-text-tertiary underline underline-offset-2 decoration-1 hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-500)]/50"
                        style={{ transition: "color 0.15s ease" }}
                      >
                        Done
                      </button>
                    </>
                  )}
                </span>
              )}
              <Button
                variant="ghost"
                size="md"
                onClick={handleDiscard}
                title={isDirtyOrLocal ? "Discard" : "Close"}
                icon={isDirtyOrLocal ? <RotateCcw size={13} strokeWidth={2} /> : <X size={13} strokeWidth={2} />}
                className="!text-text-tertiary hover:!text-text-secondary !text-body-sm"
              >
                <span className="hidden @2xl:inline">{isDirtyOrLocal ? "Discard" : "Close"}</span>
              </Button>
              {showPush && (
                <Button
                  variant="primary"
                  size="md"
                  disabled={isPushing || (showConflictWarning && !overrideConfirmed)}
                  title={showConflictWarning && !overrideConfirmed ? "Review the diff and confirm before pushing" : "Push to Jira"}
                  onClick={handlePushToJira}
                  icon={isPushing ? <Loader2 size={12} strokeWidth={2} className="animate-spin" /> : <CloudUpload size={12} strokeWidth={2.5} />}
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
