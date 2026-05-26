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
  IterationCw,
  Zap,
  MoreHorizontal,
  ArrowUpRight,
  NotebookPen,
  SendHorizontal,
  LogOut,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { mutate as globalMutate } from "swr";
import { useStoryWriter } from "@/hooks/useStoryWriter";
import { useDraftSync } from "@/hooks/useDraftSync";
import { useNotification } from "@/hooks/useNotification";
import { useTicketDetail, useTicketReviews, useJiraSprints } from "@/hooks/useSprintBoard";
import { Tooltip } from "@/components/shared/Tooltip";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { SplitStoryPicker } from "./SplitStoryPicker";
import { getJiraUrl } from "@/lib/jira-url";
import { ApiError, apiFetch, tickets } from "@/lib/api-client";
import { ViewHeader, ViewHeaderDivider } from "@/components/shared/ViewHeader";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
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
  }, [shouldOpen, pane]);

  return null;
}

interface StoryWriterLayoutProps {
  ticketKey: string;
  draftTitle?: string;
  draftType?: string;
}

export function StoryWriterLayout({ ticketKey, draftTitle, draftType }: StoryWriterLayoutProps) {
  const router = useRouter();
  const draftSync = useDraftSync(ticketKey);
  const isDraft = ticketKey.startsWith("DRAFT-");
  // Use the real key for display once the Jira issue is created
  const effectiveKey = draftSync.realKey ?? ticketKey;
  const isStillDraft = isDraft && !draftSync.realKey;
  const writer = useStoryWriter(ticketKey);
  const { notify } = useNotification();
  const { data: ticketData, mutate: mutateTicket } = useTicketDetail(ticketKey);
  const { data: reviewData } = useTicketReviews(ticketKey);
  const { sprints: rawSprints } = useJiraSprints();
  const ticketSprintId = ticketData?.sprintId ?? null;
  const ticketSprintLabel = rawSprints?.find((s) => String(s.id) === ticketSprintId)?.name ?? ticketSprintId;
  const latestReview = reviewData?.reviews?.[0];

  const [pushing, setPushing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const [hasLocalSave, setHasLocalSave] = useState(false);
  const [hasPushed, setHasPushed] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editVersionRef = useRef(0);
  const initialDirtyChecked = useRef(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRefinePrompt, setShowRefinePrompt] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Local readiness state for optimistic updates
  const ticketReadiness = (ticketData?.readiness ?? null) as import("@/types/ticket").TicketReadiness | null;
  const [localReadiness, setLocalReadiness] = useState<import("@/types/ticket").TicketReadiness | null>(ticketReadiness);
  useEffect(() => {
    setLocalReadiness(ticketReadiness);
  }, [ticketReadiness]);

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
    tickets.get(targetTicketKey)
      .then((data) => {
        if (!cancelled && data?.title) setTargetTicketTitle(data.title);
      })
      .catch((err) => console.warn("[story-writer] fetch target ticket failed", err));
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

  const handleTypeChange = useCallback(async (newType: import("@/types/ticket").IssueType) => {
    await apiFetch(`/api/tickets/${encodeURIComponent(ticketKey)}`, {
      method: "PATCH",
      body: { type: newType },
    });
    mutateTicket();
  }, [ticketKey, mutateTicket]);

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

  const handleReadinessChange = useCallback(async (v: import("@/types/ticket").TicketReadiness | null) => {
    setLocalReadiness(v);
    await tickets.updateMetadata(ticketKey, { readiness: v });
    mutateTicket();
  }, [ticketKey, mutateTicket]);

  const handlePush = useCallback(async () => {
    setPushing(true);
    setPushError(null);
    const versionAtPush = editVersionRef.current;
    try {
      const result = await writer.pushToJira();
      if (result.success) {
        if (editVersionRef.current === versionAtPush) setIsDraftDirty(false);
        setHasLocalSave(false);
        setHasPushed(true);
        handleReadinessChange("ready_to_refine");
      } else if (result.conflict) {
        setPushError(result.contentChanged
          ? "Jira was updated externally. Review the diff on the ticket detail page."
          : "Metadata changed in Jira. Try pushing again.");
      }
    } catch (err) {
      const detail = err instanceof ApiError ? (err.body as { detail?: string })?.detail : undefined;
      setPushError(detail ?? "Push failed");
    } finally {
      setPushing(false);
    }
  }, [writer, handleReadinessChange]);

  const handleDelete = useCallback(async (deleteConversation: boolean) => {
    await writer.deleteSession(deleteConversation);
    // Invalidate the active sessions cache so the ticket detail page
    // immediately reflects the deletion without waiting for the 30s dedupe window.
    await globalMutate("/api/story-writer/active-sessions");
    setShowDeleteConfirm(false);
    setShowRefinePrompt(true);
  }, [writer]);

  const handleCloseAfterPush = useCallback(() => {
    window.history.back();
  }, []);

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

  const handlePushAndClose = useCallback(async () => {
    setPushing(true);
    setPushError(null);
    try {
      const result = await writer.pushToJira();
      if (!result.success) {
        if (result.conflict) {
          setPushError(result.contentChanged
            ? "Jira was updated externally. Review the diff on the ticket detail page."
            : "Metadata changed in Jira. Try pushing again.");
        } else {
          setPushError("Push failed");
        }
        return;
      }
      setIsDraftDirty(false);
      setHasLocalSave(false);
      await writer.deleteSession(true);
      await globalMutate("/api/story-writer/active-sessions");
      await handleReadinessChange("ready_to_refine");
      router.push(`/tickets/${encodeURIComponent(ticketKey)}`);
    } catch (err) {
      const detail = err instanceof ApiError ? (err.body as { detail?: string })?.detail : undefined;
      setPushError(detail ?? "Push failed");
    } finally {
      setPushing(false);
    }
  }, [writer, handleReadinessChange, router, ticketKey]);

  const handleJiraStatusChange = useCallback(async (status: import("@/types/ticket").JiraStatus) => {
    mutateTicket((prev) => prev ? { ...prev, jiraStatus: status } : prev, { revalidate: false });
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(ticketKey)}/status`, { method: "PUT", body: { status } });
    } catch {
      mutateTicket();
    }
  }, [ticketKey, mutateTicket]);

  const handlePullFromJira = useCallback(async () => {
    setPulling(true);
    try {
      const pulls: Promise<void>[] = [
        tickets.pullFromJira(ticketKey)
          .then((data: unknown) => {
            const d = data as Record<string, unknown> | null;
            if (!d) return;
            if (typeof d.description === "string") handleDraftChange(d.description);
            if (typeof d.title === "string" && d.title) handleTitleChange(d.title as string);
          }),
      ];
      if (targetTicketKey) {
        pulls.push(
          tickets.pullFromJira(targetTicketKey)
            .then((data: unknown) => {
              const d = data as Record<string, unknown> | null;
              if (!d) return;
              if (typeof d.description === "string") handleTargetDraftChange(d.description);
              if (typeof d.title === "string" && d.title) handleTargetTitleChange(d.title as string);
            }),
        );
      }
      await Promise.all(pulls);
    } catch {
      // silently ignore; user can retry
    } finally {
      setPulling(false);
    }
  }, [ticketKey, targetTicketKey, handleDraftChange, handleTitleChange, handleTargetDraftChange, handleTargetTitleChange]);

  const handleSplitButtonClick = useCallback(() => {
    if (!targetTicketKey) {
      setShowSplitPicker(true);
    } else if (splitModeVisible) {
      setSplitModeVisible(false);
    } else {
      setSplitModeVisible(true);
    }
  }, [targetTicketKey, splitModeVisible]);

  const handleSplitConfirm = useCallback(async (existingKey?: string, sprintId?: string, title?: string, issueType?: string) => {
    await writer.activateSplit(existingKey, sprintId, title, issueType);
    setShowSplitPicker(false);
    setSplitModeVisible(true);
  }, [writer]);

  if (writer.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
      </div>
    );
  }

  const baseDescription = ticketData?.description ?? "";
  const initialEditorOpen = ticketData === undefined
    ? true
    : !!(writer.session?.localDraft?.trim() || ticketData.description?.trim());
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
    readiness: (ticketData.readiness ?? null) as import("@/types/ticket").TicketReadiness | null,
    poStatus: (ticketData.poStatus ?? null) as import("@/types/ticket").POStatus,
    qualityScore: ticketData.qualityScore ?? null,
    editState: (ticketData.editState ?? "clean") as import("@/types/ticket").TicketEditState,
    notes: "",
    sprintId: ticketData.sprintId ?? undefined,
    businessValue: ticketData.businessValue ?? null,
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
    needsTitle: !draftTitle && !ticketData?.title && (!writer.session?.localTitle || writer.session.localTitle === "Untitled draft"),
    onDraftChange: handleDraftChange,
    onTitleChange: handleTitleChange,
    onTargetDraftChange: handleTargetDraftChange,
    onTargetTitleChange: handleTargetTitleChange,
    onSend: writer.sendMessage,
    onRetry: writer.retryMessage,
    onClearFailed: writer.clearFailedMessages,
    onCancel: writer.cancelCurrentTask,
    onCreateLink: async (targetKey: string, relation: string) => {
      await writer.createLink(targetKey, relation);
      mutateTicket();
    },
    linkedIssueKeys: new Set(
      (ticketData as (typeof ticketData & { linkedIssues?: { key: string }[] }) | undefined)
        ?.linkedIssues?.map((i) => i.key) ?? [],
    ),
    onLinkCandidate: writer.linkCandidate,
    onAcceptDraft: async (draftId: string) => {
      await writer.acceptDraft(draftId);
      editVersionRef.current += 1;
      setIsDraftDirty(true);
    },
    onDismissDraft: writer.dismissDraft,
    onTypeChange: handleTypeChange,
    onCodebaseResearchChange: writer.setCodbaseResearch,
    onModelChange: writer.setModel,
  };

  return (
    <PaneProvider ticketKey={ticketKey} initialEditorOpen={initialEditorOpen}>
      <WriterProvider value={writerContextValue}>
        <SplitModeSync />
        <div className="flex h-full flex-col">
          {/* Action bar — unchanged */}
          <ViewHeader
            className="shrink-0"
            actions={<>
              {(ticketSprintId || ticketAsTicket?.epic) && (
                <nav className="hidden lg:flex shrink-0 items-center gap-1.5">
                  {ticketSprintId && (
                    <Tooltip content={ticketSprintLabel || "Sprint"}>
                      <Link
                        href={`/sprint-board?sprint=${encodeURIComponent(ticketSprintId)}`}
                        className="flex items-center gap-1.5 rounded-md bg-overlay-default px-2 py-0.5 text-label font-medium text-text-tertiary cursor-pointer hover:bg-overlay-strong hover:text-text-secondary transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                      >
                        <IterationCw size={12} strokeWidth={1.5} />
                        <span className="max-w-[110px] truncate">{ticketSprintLabel}</span>
                      </Link>
                    </Tooltip>
                  )}
                  {ticketAsTicket?.epic && (
                    <Tooltip content={ticketAsTicket.epic}>
                      {ticketAsTicket.epicKey ? (
                        <Link
                          href={`/tickets/${ticketAsTicket.epicKey}`}
                          className="flex items-center gap-1.5 rounded-md bg-overlay-default px-2 py-0.5 text-label font-medium text-text-tertiary cursor-pointer hover:bg-overlay-strong hover:text-text-secondary transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                        >
                          <Zap size={12} strokeWidth={1.5} />
                          <span className="max-w-[120px] truncate">{ticketAsTicket.epic}</span>
                        </Link>
                      ) : (
                        <span className="flex items-center gap-1.5 rounded-md bg-overlay-default px-2 py-0.5 text-label font-medium text-text-tertiary">
                          <Zap size={12} strokeWidth={1.5} />
                          <span className="max-w-[120px] truncate">{ticketAsTicket.epic}</span>
                        </span>
                      )}
                    </Tooltip>
                  )}
                </nav>
              )}
              {(ticketSprintId || ticketAsTicket?.epic) && (
                <div className="h-5 w-px shrink-0 bg-overlay-default" />
              )}

              {latestReview && (
                <div className="flex h-7 items-center gap-1 rounded-md bg-overlay-subtle px-2 text-label text-text-tertiary border border-border-subtle">
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
                      : "border-border-default bg-overlay-subtle text-text-secondary hover:bg-hover-list-item hover:text-text-secondary"
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

              {!isStillDraft && (hasLocalSave ? (
                <Button
                  variant="primary"
                  size="md"
                  icon={pushing ? <Loader2 size={13} className="animate-spin" /> : <CloudUpload size={13} strokeWidth={1.5} />}
                  onClick={handlePush}
                  disabled={pushing || isDraftDirty}
                >
                  Push to Jira
                </Button>
              ) : hasPushed ? (
                <Button
                  variant="primary"
                  size="md"
                  icon={<LogOut size={13} strokeWidth={1.5} />}
                  onClick={handleCloseAfterPush}
                >
                  Close
                </Button>
              ) : isDraftDirty ? (
                <Button
                  variant="primary"
                  size="md"
                  icon={pushing ? <Loader2 size={13} className="animate-spin" /> : <SendHorizontal size={13} strokeWidth={1.5} />}
                  onClick={handlePushAndClose}
                  disabled={pushing}
                >
                  Push &amp; Close
                </Button>
              ) : null)}

              <div ref={moreMenuRef} className="relative">
                <Button
                  variant="ghost"
                  size="md"
                  iconOnly
                  icon={<MoreHorizontal size={14} strokeWidth={1.5} />}
                  onClick={() => setShowMoreMenu((v) => !v)}
                  title="More actions"
                  className={showMoreMenu ? "border-border-strong bg-overlay-strong text-text-secondary" : ""}
                />

                {showMoreMenu && (
                  <div className="absolute right-0 top-full z-30 mt-1.5 w-56 rounded-xl border border-border-strong bg-[var(--color-surface-floating)] py-1.5 shadow-[var(--shadow-lg)]">
                    {writer.session && (
                      <button
                        type="button"
                        onClick={() => { handleSplitButtonClick(); setShowMoreMenu(false); }}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-xs cursor-pointer transition-colors duration-150 ${
                          splitModeVisible && targetTicketKey
                            ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/[0.08]"
                            : "text-text-secondary hover:bg-hover-interactive hover:text-text-primary"
                        }`}
                      >
                        <Scissors size={13} strokeWidth={1.5} className="shrink-0" />
                        <span>{splitButtonLabel}</span>
                      </button>
                    )}

                    {!isStillDraft && (
                      <>
                        <div className="mx-2 my-1 h-px bg-overlay-default" />

                        {hasLocalSave ? (
                          <button
                            type="button"
                            onClick={() => { setShowMoreMenu(false); handlePushAndClose(); }}
                            disabled={pushing || isDraftDirty}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <SendHorizontal size={13} strokeWidth={1.5} className="shrink-0" />
                            <span>Push &amp; Close</span>
                          </button>
                        ) : hasPushed ? (
                          <button
                            type="button"
                            onClick={() => { setShowMoreMenu(false); handleCloseAfterPush(); }}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150"
                          >
                            <LogOut size={13} strokeWidth={1.5} className="shrink-0" />
                            <span>Close</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setShowMoreMenu(false); handlePush(); }}
                            disabled={pushing || isDraftDirty}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <CloudUpload size={13} strokeWidth={1.5} className="shrink-0" />
                            <span>Push to Jira</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => { handlePullFromJira().finally(() => setShowMoreMenu(false)); }}
                          disabled={pulling}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {pulling ? <Loader2 size={13} className="animate-spin shrink-0" /> : <CloudDownload size={13} strokeWidth={1.5} className="shrink-0" />}
                          <span>{targetTicketKey && splitModeVisible ? "Pull both from Jira" : "Pull from Jira"}</span>
                        </button>

                        <div className="mx-2 my-1 h-px bg-overlay-default" />

                        {targetTicketKey && splitModeVisible && (
                          <p className="px-3 pt-1 pb-0.5 text-caption font-medium uppercase tracking-wider text-text-muted">
                            Source: {ticketKey}
                          </p>
                        )}

                        <a
                          href={`{getJiraUrl(effectiveKey)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setShowMoreMenu(false)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150"
                        >
                          <ArrowUpRight size={13} strokeWidth={1.5} className="shrink-0" />
                          <span>Open in Jira</span>
                        </a>
                      </>
                    )}

                    <Link
                      href={`/tickets/${ticketKey}`}
                      onClick={() => setShowMoreMenu(false)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150"
                    >
                      <ArrowUpRight size={13} strokeWidth={1.5} className="shrink-0" />
                      <span>View in Bridge</span>
                    </Link>

                    {targetTicketKey && splitModeVisible && (
                      <>
                        <div className="mx-2 my-1 h-px bg-overlay-default" />
                        <p className="px-3 pt-1 pb-0.5 text-caption font-medium uppercase tracking-wider text-text-muted">
                          Target: {targetTicketKey}
                        </p>
                        <a
                          href={`{getJiraUrl(targetTicketKey)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setShowMoreMenu(false)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150"
                        >
                          <ArrowUpRight size={13} strokeWidth={1.5} className="shrink-0" />
                          <span>Open in Jira</span>
                        </a>
                        <Link
                          href={`/tickets/${targetTicketKey}`}
                          onClick={() => setShowMoreMenu(false)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150"
                        >
                          <ArrowUpRight size={13} strokeWidth={1.5} className="shrink-0" />
                          <span>View in Bridge</span>
                        </Link>
                        <Link
                          href={`/tickets/${targetTicketKey}/write`}
                          onClick={() => setShowMoreMenu(false)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150"
                        >
                          <NotebookPen size={13} strokeWidth={1.5} className="shrink-0" />
                          <span>Open in Story Writer</span>
                        </Link>
                      </>
                    )}

                    {(((isDraftDirty || hasLocalSave) && writer.messages.length === 0) || writer.messages.length > 0) && (
                      <div className="mx-2 my-1 h-px bg-overlay-default" />
                    )}

                    {(isDraftDirty || hasLocalSave) && writer.messages.length === 0 && (
                      <button
                        type="button"
                        onClick={() => { handleDelete(true); setShowMoreMenu(false); }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-text-tertiary cursor-pointer hover:bg-red-500/[0.06] hover:text-red-400/80 transition-colors duration-150"
                      >
                        <Trash2 size={13} strokeWidth={1.5} className="shrink-0" />
                        <span>Discard draft</span>
                      </button>
                    )}

                    {writer.messages.length > 0 && (
                      <button
                        type="button"
                        onClick={() => { setShowDeleteConfirm(true); setShowMoreMenu(false); }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-text-tertiary cursor-pointer hover:bg-red-500/[0.06] hover:text-red-400/80 transition-colors duration-150"
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
            {(() => {
              const rawTitle = writer.session?.localTitle ?? ticketData?.title ?? draftTitle;
              const displayTitle = (rawTitle && rawTitle !== "Untitled draft") ? rawTitle : (draftTitle || ticketKey);
              const displayType = ticketData?.type ?? draftType;

              if (isStillDraft && draftSync.syncStatus === "pending") {
                return (
                  <>
                    <span className="flex items-center gap-1.5 rounded-md bg-overlay-default px-2.5 py-1 text-label font-medium text-text-tertiary">
                      <span className="h-2 w-2 rounded-full bg-amber-400/60 animate-pulse" />
                      Syncing to Jira...
                    </span>
                    <ViewHeaderDivider />
                    <span className="min-w-0 flex-1 truncate font-[var(--font-display)] text-heading-sm font-semibold tracking-tight text-text-primary">
                      {displayTitle}
                    </span>
                  </>
                );
              }

              if (!ticketData && isStillDraft) {
                return (
                  <>
                    {displayType && <IssueTypeIcon type={displayType} size={14} />}
                    <ViewHeaderDivider />
                    <span className="min-w-0 flex-1 truncate font-[var(--font-display)] text-heading-sm font-semibold tracking-tight text-text-primary">
                      {displayTitle}
                    </span>
                  </>
                );
              }

              const status = (ticketData?.jiraStatus ?? "TO DO") as import("@/types/ticket").JiraStatus;
              return (
                <>
                  <TicketStatusPill
                    ticketKey={effectiveKey}
                    jiraStatus={status}
                    readiness={localReadiness}
                    onJiraStatusChange={handleJiraStatusChange}
                    onReadinessChange={handleReadinessChange}
                    issueType={ticketData?.type ?? draftType}
                    onIssueTypeChange={handleTypeChange}
                    title={displayTitle}
                    size="lg"
                  />
                  <ViewHeaderDivider />
                  <span className="min-w-0 flex-1 truncate font-[var(--font-display)] text-heading-sm font-semibold tracking-tight text-text-primary">
                    {displayTitle}
                  </span>
                </>
              );
            })()}
          </ViewHeader>

          {/* Push error */}
          {pushError && (
            <div className="border-b border-red-500/20 bg-red-500/[0.04] px-4 py-2 text-xs text-red-400">
              {pushError}
            </div>
          )}

          {/* Draft sync error */}
          {draftSync.syncStatus === "error" && (
            <div className="flex items-center gap-3 border-b border-amber-500/20 bg-amber-500/[0.04] px-4 py-2 text-xs text-amber-400">
              <span className="flex-1">Failed to create in Jira: {draftSync.error}. Your draft is saved locally.</span>
              <button
                type="button"
                onClick={draftSync.retry}
                className="shrink-0 rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400 cursor-pointer hover:bg-amber-500/20 transition-colors duration-150"
              >
                Retry
              </button>
            </div>
          )}

          {/* Application list bar */}
          <ApplicationListBar />

          {/* App toolbar */}
          <AppToolbar />

          {/* Pane area */}
          <PaneArea />

          {/* Delete confirmation */}
          <ConfirmDialog
            open={showDeleteConfirm}
            onClose={() => setShowDeleteConfirm(false)}
            title="Delete session?"
            description="This will discard the current drafts and AI suggestions. You can optionally keep the conversation history."
            confirmLabel="Delete everything"
            confirmClassName="bg-red-500/10 border border-red-500/20 hover:bg-red-500/20"
            onConfirm={() => handleDelete(true)}
            extraActions={
              <Button variant="ghost" size="md" onClick={() => handleDelete(false)}>
                Discard, keep chat
              </Button>
            }
          />

          {/* Post-delete refine prompt */}
          <ConfirmDialog
            open={showRefinePrompt}
            onClose={() => window.history.back()}
            title="Mark as Ready to Refine?"
            description="The session has been cleared. Would you like to mark this ticket as ready for refinement?"
            cancelLabel="Skip"
            confirmLabel="Yes, mark as Ready to Refine"
            confirmVariant="primary"
            onConfirm={async () => {
              await handleReadinessChange("ready_to_refine");
              window.history.back();
            }}
          />

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
