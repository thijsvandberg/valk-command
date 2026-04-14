"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  CloudUpload,
  CloudDownload,
  Save,
  Check,
  Trash2,
  Loader2,
  Star,
  Scissors,
  NotebookPen,
  MoreHorizontal,
} from "lucide-react";
import { useStoryWriter } from "@/hooks/useStoryWriter";
import { useNotification } from "@/hooks/useNotification";
import { useTicketDetail, useTicketReviews } from "@/hooks/useSprintBoard";
import { Tooltip } from "@/components/shared/Tooltip";
import { SplitStoryPicker } from "./SplitStoryPicker";
import { ViewHeader, ViewHeaderDivider } from "@/components/shared/ViewHeader";
import { TicketKeyPill } from "@/components/shared/TicketKeyPill";
import { Button } from "@/components/ui/Button";
import { PaneProvider, usePaneContext } from "./panes/PaneContext";
import { WriterProvider, useWriterContext, type WriterContextValue } from "./panes/WriterContext";
import { ApplicationListBar } from "./panes/ApplicationListBar";
import { AppToolbar } from "./panes/AppToolbar";
import { PaneArea } from "./panes/PaneArea";

// Syncs splitModeVisible + targetTicketKey → opens/closes the split-target pane app
function SplitModeSync() {
  const writer = useWriterContext();
  const pane = usePaneContext();
  const shouldOpen = writer.splitModeVisible && !!writer.targetTicketKey;

  useEffect(() => {
    if (shouldOpen) {
      pane.openApp("split-target");
    } else {
      pane.closeApp("split-target");
    }
    // pane functions are stable between renders that don't change pane state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldOpen]);

  return null;
}

interface StoryWriterLayoutProps {
  ticketKey: string;
}

export function StoryWriterLayout({ ticketKey }: StoryWriterLayoutProps) {
  const writer = useStoryWriter(ticketKey);
  const { notify } = useNotification();
  const { data: ticketData } = useTicketDetail(ticketKey);
  const { data: reviewData } = useTicketReviews(ticketKey);
  const latestReview = reviewData?.reviews?.[0];

  const [pushing, setPushing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const [hasLocalSave, setHasLocalSave] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editVersionRef = useRef(0);
  const initialDirtyChecked = useRef(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Split mode state
  const [splitModeVisible, setSplitModeVisible] = useState(false);
  const [showSplitPicker, setShowSplitPicker] = useState(false);
  const [targetTicketTitle, setTargetTicketTitle] = useState<string | null>(null);

  useEffect(() => () => { if (savedTimerRef.current) clearTimeout(savedTimerRef.current); }, []);

  useEffect(() => {
    if (!showMoreMenu) return;
    function handleClick(e: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMoreMenu]);

  const targetTicketKey = writer.session?.targetTicketKey ?? null;

  const prevTargetKey = useRef<string | null>(null);
  useEffect(() => {
    if (targetTicketKey && prevTargetKey.current !== targetTicketKey) {
      setSplitModeVisible(true);
    }
    prevTargetKey.current = targetTicketKey;
  }, [targetTicketKey]);

  useEffect(() => {
    if (!targetTicketKey) {
      setTargetTicketTitle(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/tickets/${encodeURIComponent(targetTicketKey)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!cancelled && data?.title) setTargetTicketTitle(data.title);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [targetTicketKey]);

  const prevWriterStatus = useRef(writer.status);
  useEffect(() => {
    if (prevWriterStatus.current === "streaming" && writer.status === "ready") {
      notify("Story Writer response ready", {
        body: ticketKey,
        tag: "story-writer-response",
        onClick: () => { window.focus(); },
      });
    }
    prevWriterStatus.current = writer.status;
  }, [writer.status, notify, ticketKey]);

  useEffect(() => {
    if (!initialDirtyChecked.current && writer.session && ticketData) {
      initialDirtyChecked.current = true;
      const descDirty = (writer.session.localDraft ?? "") !== (ticketData.description ?? "");
      const titleDirty = !!(writer.session.localTitle && writer.session.localTitle !== ticketData.title);
      setIsDraftDirty(descDirty || titleDirty);
    }
  }, [writer.session, ticketData]);

  const handleSaveDraft = useCallback(async () => {
    setSaving(true);
    const versionAtSave = editVersionRef.current;
    await writer.saveDraft();
    setSaving(false);
    setHasLocalSave(true);
    setShowSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => {
      setShowSaved(false);
      if (editVersionRef.current === versionAtSave) setIsDraftDirty(false);
    }, 2000);
  }, [writer]);

  const handlePush = useCallback(async () => {
    setPushing(true);
    setPushError(null);
    const versionAtPush = editVersionRef.current;
    try {
      const result = await writer.pushToJira();
      if (result.success) {
        if (editVersionRef.current === versionAtPush) setIsDraftDirty(false);
        setHasLocalSave(false);
      } else if (result.conflict) {
        setPushError(result.contentChanged
          ? "Jira was updated externally. Review the diff on the ticket detail page."
          : "Metadata changed in Jira. Try pushing again.");
      }
    } catch {
      setPushError("Push failed");
    } finally {
      setPushing(false);
    }
  }, [writer]);

  const handleDelete = useCallback(async (deleteConversation: boolean) => {
    await writer.deleteSession(deleteConversation);
    setShowDeleteConfirm(false);
    window.history.back();
  }, [writer]);

  const handleDraftChange = useCallback((content: string) => {
    editVersionRef.current += 1;
    setIsDraftDirty(true);
    if (showSaved) {
      setShowSaved(false);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    }
    writer.updateLocalDraft(content);
  }, [writer, showSaved]);

  const handleTitleChange = useCallback((title: string) => {
    editVersionRef.current += 1;
    setIsDraftDirty(true);
    if (showSaved) {
      setShowSaved(false);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    }
    writer.updateLocalTitle(title);
  }, [writer, showSaved]);

  const handleTargetDraftChange = useCallback((content: string) => {
    editVersionRef.current += 1;
    setIsDraftDirty(true);
    if (showSaved) {
      setShowSaved(false);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    }
    writer.updateTargetLocalDraft(content);
  }, [writer, showSaved]);

  const handleTargetTitleChange = useCallback((title: string) => {
    editVersionRef.current += 1;
    setIsDraftDirty(true);
    if (showSaved) {
      setShowSaved(false);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    }
    writer.updateTargetLocalTitle(title);
  }, [writer, showSaved]);

  const handlePullFromJira = useCallback(async () => {
    setPulling(true);
    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(ticketKey)}/pull-from-jira`, { method: "POST" });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      if (typeof data.description === "string") handleDraftChange(data.description);
    } catch {
      // silently ignore; user can retry
    } finally {
      setPulling(false);
    }
  }, [ticketKey, handleDraftChange]);

  const handleSplitButtonClick = useCallback(() => {
    if (!targetTicketKey) {
      setShowSplitPicker(true);
    } else if (splitModeVisible) {
      setSplitModeVisible(false);
    } else {
      setSplitModeVisible(true);
    }
  }, [targetTicketKey, splitModeVisible]);

  const handleSplitConfirm = useCallback(async (existingKey?: string, sprintId?: string) => {
    await writer.activateSplit(existingKey, sprintId);
    setShowSplitPicker(false);
    setSplitModeVisible(true);
  }, [writer]);

  if (writer.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-white/30" />
      </div>
    );
  }

  const baseDescription = ticketData?.description ?? "";
  const splitButtonLabel = !targetTicketKey
    ? "Split story"
    : splitModeVisible
    ? "Close split"
    : "Open split";

  // Build a Ticket-shaped object from the raw ticketData response
  const ticketAsTicket = ticketData ? ({
    key: ticketKey,
    title: ticketData.title ?? "",
    type: (ticketData.type as import("@/types/ticket").IssueType) ?? "story",
    description: ticketData.description ?? "",
    epic: ticketData.epic ?? null,
    epicKey: ticketData.epicKey ?? null,
    jiraStatus: (ticketData.jiraStatus as import("@/types/ticket").JiraStatus) ?? "TO DO",
    storyPoints: ticketData.storyPoints ?? null,
    assignee: ticketData.assignee ?? null,
    flagged: ticketData.flagged ?? false,
    poStatus: (ticketData.poStatus ?? null) as import("@/types/ticket").POStatus,
    qualityScore: ticketData.qualityScore ?? null,
    editState: (ticketData.editState ?? "clean") as import("@/types/ticket").TicketEditState,
    notes: "",
    sprintId: ticketData.sprintId ?? undefined,
  } as import("@/types/ticket").Ticket) : null;

  const writerContextValue: WriterContextValue = {
    ticketKey,
    ticketData: ticketAsTicket,
    session: writer.session,
    messages: writer.messages,
    aiDrafts: writer.aiDrafts,
    targetAiDrafts: writer.targetAiDrafts,
    relatedCandidates: writer.relatedCandidates,
    status: writer.status,
    streamProgress: writer.streamProgress,
    streamError: writer.streamError,
    usage: writer.usage,
    lastResponseDurationMs: writer.lastResponseDurationMs,
    codebaseResearch: writer.codebaseResearch,
    model: writer.model,
    baseDescription,
    targetTicketKey,
    targetTicketTitle,
    splitModeVisible,
    onDraftChange: handleDraftChange,
    onTitleChange: handleTitleChange,
    onTargetDraftChange: handleTargetDraftChange,
    onTargetTitleChange: handleTargetTitleChange,
    onSend: writer.sendMessage,
    onLinkCandidate: writer.linkCandidate,
    onAcceptDraft: async (draftId: string) => {
      await writer.acceptDraft(draftId);
      editVersionRef.current += 1;
      setIsDraftDirty(true);
    },
    onDismissDraft: writer.dismissDraft,
    onCodebaseResearchChange: writer.setCodbaseResearch,
    onModelChange: writer.setModel,
  };

  return (
    <PaneProvider ticketKey={ticketKey}>
      <WriterProvider value={writerContextValue}>
        <SplitModeSync />
        <div className="flex h-full flex-col bg-[var(--color-surface-base)]">
          {/* Action bar — unchanged */}
          <ViewHeader
            icon={<NotebookPen size={15} strokeWidth={1.5} className="text-white/30" />}
            className="shrink-0"
            actions={<>
              {latestReview && (
                <div className="flex h-7 items-center gap-1 rounded-md bg-white/[0.04] px-2 text-[11px] text-white/40 border border-white/[0.04]">
                  <Star size={11} strokeWidth={1.5} />
                  {Math.round(latestReview.overallScore)}
                </div>
              )}

              {isDraftDirty && (
                <button
                  onClick={handleSaveDraft}
                  disabled={saving || showSaved}
                  className={`flex h-7 items-center gap-1.5 rounded-md border px-3 text-xs font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] transition-colors duration-150 disabled:cursor-not-allowed ${
                    showSaved
                      ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)]"
                      : "border-white/[0.06] bg-white/[0.02] text-white/50 hover:bg-white/[0.04] hover:text-white/70"
                  }`}
                >
                  {saving
                    ? <Loader2 size={13} className="animate-spin" />
                    : showSaved
                    ? <Check size={13} strokeWidth={2} />
                    : <Save size={13} strokeWidth={1.5} />
                  }
                  {showSaved ? "Saved" : "Save draft"}
                </button>
              )}

              {!isDraftDirty && !hasLocalSave && writer.messages.length > 0 ? (
                <Button
                  variant="ghost"
                  size="md"
                  icon={<Trash2 size={13} strokeWidth={1.5} />}
                  onClick={() => setShowDeleteConfirm(true)}
                  className="border-red-500/20 text-red-400/80 hover:bg-red-500/[0.08] hover:text-red-400"
                >
                  Delete session
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="md"
                  icon={pushing ? <Loader2 size={13} className="animate-spin" /> : <CloudUpload size={13} strokeWidth={1.5} />}
                  onClick={handlePush}
                  disabled={pushing || (!isDraftDirty && !hasLocalSave)}
                >
                  Push to Jira
                </Button>
              )}

              <div ref={moreMenuRef} className="relative">
                <Button
                  variant="ghost"
                  size="md"
                  iconOnly
                  icon={<MoreHorizontal size={14} strokeWidth={1.5} />}
                  onClick={() => setShowMoreMenu((v) => !v)}
                  title="More actions"
                  className={showMoreMenu ? "border-white/[0.12] bg-white/[0.08] text-white/70" : ""}
                />

                {showMoreMenu && (
                  <div className="absolute right-0 top-full z-30 mt-1.5 w-56 rounded-xl border border-white/[0.10] bg-[var(--color-surface-floating)] py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                    {writer.session && (
                      <button
                        type="button"
                        onClick={() => { handleSplitButtonClick(); setShowMoreMenu(false); }}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-xs cursor-pointer transition-colors duration-150 ${
                          splitModeVisible && targetTicketKey
                            ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/[0.08]"
                            : "text-white/65 hover:bg-white/[0.06] hover:text-white/85"
                        }`}
                      >
                        <Scissors size={13} strokeWidth={1.5} className="shrink-0" />
                        <span>{splitButtonLabel}</span>
                      </button>
                    )}

                    <div className="mx-2 my-1 h-px bg-white/[0.06]" />

                    <button
                      type="button"
                      onClick={() => { handlePullFromJira(); setShowMoreMenu(false); }}
                      disabled={pulling}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-white/65 cursor-pointer hover:bg-white/[0.06] hover:text-white/85 transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {pulling ? <Loader2 size={13} className="animate-spin shrink-0" /> : <CloudDownload size={13} strokeWidth={1.5} className="shrink-0" />}
                      <span>Pull from Jira</span>
                    </button>

                    {(((isDraftDirty || hasLocalSave) && writer.messages.length === 0) || writer.messages.length > 0) && (
                      <div className="mx-2 my-1 h-px bg-white/[0.06]" />
                    )}

                    {(isDraftDirty || hasLocalSave) && writer.messages.length === 0 && (
                      <button
                        type="button"
                        onClick={() => { handleDelete(true); setShowMoreMenu(false); }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-white/45 cursor-pointer hover:bg-red-500/[0.06] hover:text-red-400/80 transition-colors duration-150"
                      >
                        <Trash2 size={13} strokeWidth={1.5} className="shrink-0" />
                        <span>Discard draft</span>
                      </button>
                    )}

                    {writer.messages.length > 0 && (
                      <button
                        type="button"
                        onClick={() => { setShowDeleteConfirm(true); setShowMoreMenu(false); }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-white/45 cursor-pointer hover:bg-red-500/[0.06] hover:text-red-400/80 transition-colors duration-150"
                      >
                        <Trash2 size={13} strokeWidth={1.5} className="shrink-0" />
                        <span>Delete session</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>}
          >
            {ticketData && (
              <>
                <TicketKeyPill ticketKey={ticketKey} />
                <ViewHeaderDivider />
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-white/90">
                  {writer.session?.localTitle ?? ticketData.title}
                </span>
              </>
            )}
          </ViewHeader>

          {/* Push error */}
          {pushError && (
            <div className="border-b border-red-500/20 bg-red-500/[0.04] px-4 py-2 text-xs text-red-400">
              {pushError}
            </div>
          )}

          {/* Application list bar */}
          <ApplicationListBar />

          {/* App toolbar */}
          <AppToolbar />

          {/* Pane area */}
          <PaneArea />

          {/* Delete confirmation */}
          {showDeleteConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
              <div className="w-full max-w-sm rounded-xl bg-[var(--color-surface-elevated)] p-6 shadow-2xl border border-white/[0.08]">
                <h3 className="font-[var(--font-display)] text-sm font-semibold text-white/90">
                  Delete session?
                </h3>
                <p className="mt-2 text-xs leading-[1.7] text-white/50">
                  This will discard the current drafts and AI suggestions. You can optionally keep the conversation history.
                </p>
                <div className="mt-5 flex items-center justify-end gap-2">
                  <Button variant="ghost" size="md" onClick={() => setShowDeleteConfirm(false)} className="border-0">
                    Cancel
                  </Button>
                  <Button variant="ghost" size="md" onClick={() => handleDelete(false)}>
                    Discard, keep chat
                  </Button>
                  <Button
                    variant="destructive"
                    size="md"
                    onClick={() => handleDelete(true)}
                    className="bg-red-500/10 border border-red-500/20 hover:bg-red-500/20"
                  >
                    Delete everything
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Split story picker modal */}
          <SplitStoryPicker
            open={showSplitPicker}
            originalTitle={ticketData?.title ?? ticketKey}
            originalSprintId={ticketData?.sprintId ?? null}
            onConfirm={handleSplitConfirm}
            onClose={() => setShowSplitPicker(false)}
          />
        </div>
      </WriterProvider>
    </PaneProvider>
  );
}
