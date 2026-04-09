"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  CloudUpload,
  CloudDownload,
  Save,
  Check,
  Trash2,
  Loader2,
  Star,
  ExternalLink,
  PanelLeftClose,
  PanelLeftOpen,
  Scissors,
  NotebookPen,
  IterationCw,
  Zap,
  ScrollText,
  Network,
  MoreHorizontal,
} from "lucide-react";
import { useStoryWriter } from "@/hooks/useStoryWriter";
import { useTicketDetail, useTicketReviews } from "@/hooks/useSprintBoard";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { getJiraUrl } from "@/components/sprint-board/TicketTable";
import { Tooltip } from "@/components/shared/Tooltip";
import { StoryWriterChat } from "./StoryWriterChat";
import { StoryWriterEditor } from "./StoryWriterEditor";
import { SplitStoryPicker } from "./SplitStoryPicker";
import { ExecutionLogViewer } from "./ExecutionLogViewer";
import { RelatedStoriesPanel } from "./RelatedStoriesPanel";
import { ViewHeader, ViewHeaderTitle, ViewHeaderDivider } from "@/components/shared/ViewHeader";
import { Button } from "@/components/ui/Button";

const PANEL_STORAGE_KEY = "storyWriterChatWidth";
const PANEL_COLLAPSED_KEY = "storyWriterChatCollapsed";
const DEFAULT_CHAT_WIDTH = 420;
const MIN_CHAT_WIDTH = 280;
const MAX_CHAT_WIDTH = 640;
const COLLAPSED_STRIP_WIDTH = 40;
const RELATED_PANEL_WIDTH = 300;

interface StoryWriterLayoutProps {
  ticketKey: string;
}

export function StoryWriterLayout({ ticketKey }: StoryWriterLayoutProps) {
  const writer = useStoryWriter(ticketKey);
  const { data: ticketData } = useTicketDetail(ticketKey);
  const { data: reviewData } = useTicketReviews(ticketKey);
  const latestReview = reviewData?.reviews?.[0];

  const [chatWidth, setChatWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_CHAT_WIDTH;
    const stored = localStorage.getItem(PANEL_STORAGE_KEY);
    return stored ? Math.max(MIN_CHAT_WIDTH, Math.min(MAX_CHAT_WIDTH, parseInt(stored, 10))) : DEFAULT_CHAT_WIDTH;
  });

  const [chatCollapsed, setChatCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(PANEL_COLLAPSED_KEY) === "true";
  });

  const [pushing, setPushing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  // Tracks whether a local save exists that hasn't been pushed to Jira yet.
  // Stays true after "Save draft" until a successful push clears it.
  const [hasLocalSave, setHasLocalSave] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Incremented on every user edit; lets async operations detect concurrent edits.
  const editVersionRef = useRef(0);
  const initialDirtyChecked = useRef(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [relatedPanelOpen, setRelatedPanelOpen] = useState(false);
  const [relatedPanelSelectedKey, setRelatedPanelSelectedKey] = useState<string | null>(null);

  // Split mode state
  const [splitModeVisible, setSplitModeVisible] = useState(false);
  const [showSplitPicker, setShowSplitPicker] = useState(false);
  const [targetTicketTitle, setTargetTicketTitle] = useState<string | null>(null);

  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Ref mirrors chatWidth so the mouseup handler can read the latest value
  // without the drag-resize effect needing chatWidth as a dependency.
  const chatWidthRef = useRef(chatWidth);
  useEffect(() => { chatWidthRef.current = chatWidth; }, [chatWidth]);
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

  // Fetch target ticket title when targetTicketKey is available
  const targetTicketKey = writer.session?.targetTicketKey ?? null;

  // Auto-open split pane when a target ticket is present (covers page reload and fresh create)
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

  // Check initial dirty state once session and ticket data are both loaded.
  // If localDraft or localTitle differs from Jira, the user made edits in a prior session.
  useEffect(() => {
    if (!initialDirtyChecked.current && writer.session && ticketData) {
      initialDirtyChecked.current = true;
      const descDirty = (writer.session.localDraft ?? "") !== (ticketData.description ?? "");
      const titleDirty = !!(writer.session.localTitle && writer.session.localTitle !== ticketData.title);
      setIsDraftDirty(descDirty || titleDirty);
    }
  }, [writer.session, ticketData]);

  // Build messageId -> draftId map and draftId -> content map for chat
  const { messageDraftMap, draftContentMap } = useMemo(() => {
    const msgMap: Record<string, string> = {};
    const contentMap: Record<string, string> = {};
    for (const draft of [...writer.aiDrafts, ...writer.targetAiDrafts]) {
      if (draft.messageId) {
        msgMap[draft.messageId] = draft.id;
      }
      contentMap[draft.id] = draft.content;
    }
    return { messageDraftMap: msgMap, draftContentMap: contentMap };
  }, [writer.aiDrafts, writer.targetAiDrafts]);

  // Drag resize for chat panel
  const handleMouseDown = useCallback(() => {
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = Math.max(MIN_CHAT_WIDTH, Math.min(MAX_CHAT_WIDTH, e.clientX - rect.left));
      setChatWidth(newWidth);
    }

    function handleMouseUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem(PANEL_STORAGE_KEY, String(chatWidthRef.current));
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

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
      // Only clear dirty if the user didn't make new edits while saving
      if (editVersionRef.current === versionAtSave) {
        setIsDraftDirty(false);
      }
    }, 2000);
  }, [writer]);

  const handlePush = useCallback(async () => {
    setPushing(true);
    setPushError(null);
    const versionAtPush = editVersionRef.current;
    try {
      const result = await writer.pushToJira();
      if (result.success) {
        // Only clear dirty if the user didn't make new edits while pushing
        if (editVersionRef.current === versionAtPush) {
          setIsDraftDirty(false);
        }
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

  const handleToggleChat = useCallback(() => {
    setChatCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(PANEL_COLLAPSED_KEY, String(next));
      return next;
    });
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

  const handlePullFromJira = useCallback(async () => {
    setPulling(true);
    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(ticketKey)}/pull-from-jira`, { method: "POST" });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      if (typeof data.description === "string") {
        handleDraftChange(data.description);
      }
    } catch {
      // silently ignore; user can retry
    } finally {
      setPulling(false);
    }
  }, [ticketKey, handleDraftChange]);

  const handleViewDraft = useCallback((draftId: string) => {
    setActiveDraftId(draftId);
    setTimeout(() => setActiveDraftId(null), 100);
  }, []);

  const handleFindRelated = useCallback(async () => {
    setRelatedPanelOpen(true);
    await writer.sendMessage("Find related stories", "find-related");
  }, [writer]);

  const handleStoryKeyClick = useCallback((key: string) => {
    setRelatedPanelOpen(true);
    setRelatedPanelSelectedKey(key);
  }, []);

  // Auto-open related panel when candidates arrive for the first time
  const prevCandidatesLength = useRef(writer.relatedCandidates.length);
  useEffect(() => {
    if (writer.relatedCandidates.length > 0 && prevCandidatesLength.current === 0) {
      setRelatedPanelOpen(true);
    }
    prevCandidatesLength.current = writer.relatedCandidates.length;
  }, [writer.relatedCandidates.length]);

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
    // throws on failure — SplitStoryPicker catches and shows the error
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

  return (
    <div className="flex h-full flex-col bg-[var(--color-surface-base)]">
      <ViewHeader
        icon={<NotebookPen size={16} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />}
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

          <Button
            variant="primary"
            size="md"
            icon={pushing ? <Loader2 size={13} className="animate-spin" /> : <CloudUpload size={13} strokeWidth={1.5} />}
            onClick={handlePush}
            disabled={pushing || (!isDraftDirty && !hasLocalSave)}
          >
            Push to Jira
          </Button>

          {/* More actions menu */}
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
                    onClick={() => { setRelatedPanelOpen((v) => !v); setShowMoreMenu(false); }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-xs cursor-pointer transition-colors duration-150 ${
                      relatedPanelOpen
                        ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/[0.08]"
                        : "text-white/65 hover:bg-white/[0.06] hover:text-white/85"
                    }`}
                  >
                    <Network size={13} strokeWidth={1.5} className="shrink-0" />
                    <span>Related stories</span>
                    {writer.relatedCandidates.length > 0 && (
                      <span className="ml-auto tabular-nums text-[10px] opacity-60">
                        {writer.relatedCandidates.length}
                      </span>
                    )}
                  </button>
                )}

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

                <a
                  href={getJiraUrl(ticketKey)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShowMoreMenu(false)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-white/65 cursor-pointer hover:bg-white/[0.06] hover:text-white/85 transition-colors duration-150"
                >
                  <ExternalLink size={13} strokeWidth={1.5} className="shrink-0" />
                  <span>Open in Jira</span>
                </a>

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
        <ViewHeaderTitle>Story writer</ViewHeaderTitle>
        <ViewHeaderDivider />
        {ticketData && (
          <div className="flex items-center gap-2 min-w-0 leading-none" style={{ fontSize: "15px" }}>
            <IssueTypeIcon type={ticketData.type} size={14} />
            <span className="font-mono font-semibold text-white/90 shrink-0">
              {ticketKey}
            </span>
            <span className="text-white/30 shrink-0">–</span>
            <span className="min-w-0 truncate font-semibold text-white/90">
              {writer.session?.localTitle ?? ticketData.title}
            </span>
          </div>
        )}
      </ViewHeader>

      {/* Push error */}
      {pushError && (
        <div className="border-b border-red-500/20 bg-red-500/[0.04] px-4 py-2 text-xs text-red-400">
          {pushError}
        </div>
      )}

      {/* Main content: chat + editor */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* Chat panel or collapsed strip */}
        {chatCollapsed ? (
          <div
            style={{ width: COLLAPSED_STRIP_WIDTH }}
            className="flex shrink-0 flex-col border-r border-white/[0.06] bg-[var(--color-surface-base)]"
          >
            <div className="border-b border-white/[0.06]">
              <Button
                variant="ghost"
                iconOnly
                icon={<PanelLeftOpen size={14} strokeWidth={1.5} />}
                onClick={handleToggleChat}
                title="Expand chat"
                className="border-0 bg-transparent h-[2.5rem] w-full rounded-none text-white/30 hover:text-white/60"
              />
            </div>
          </div>
        ) : (
          <>
            <div style={{ width: chatWidth }} className="flex shrink-0 flex-col overflow-hidden border-r border-white/[0.06]">
              <div className="flex h-[50px] shrink-0 items-center justify-between border-b border-white/[0.06] px-4">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowLogs(false)}
                    className={`rounded px-2 py-1 text-[10px] font-medium transition-colors duration-150 cursor-pointer ${!showLogs ? "text-white/70 bg-white/[0.06]" : "text-white/30 hover:text-white/50 hover:bg-white/[0.04]"}`}
                  >
                    Chat
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLogs(true)}
                    className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-colors duration-150 cursor-pointer ${showLogs ? "text-white/70 bg-white/[0.06]" : "text-white/30 hover:text-white/50 hover:bg-white/[0.04]"}`}
                  >
                    <ScrollText size={10} strokeWidth={1.5} />
                    Logs
                  </button>
                  {(writer.aiDrafts.length > 0 || writer.messages.length > 0) && (
                    <span className="ml-2 text-[10px] text-white/25 tabular-nums">
                      {[
                        writer.aiDrafts.length > 0 && `${writer.aiDrafts.length} draft${writer.aiDrafts.length !== 1 ? "s" : ""}`,
                        writer.messages.length > 0 && `${writer.messages.length} msg`,
                      ].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  icon={<PanelLeftClose size={14} strokeWidth={1.5} />}
                  onClick={handleToggleChat}
                  title="Collapse chat"
                  className="border-0 bg-transparent text-white/30 hover:text-white/55"
                />
              </div>
              {showLogs ? (
                <ExecutionLogViewer ticketKey={ticketKey} isStreaming={writer.status === "streaming" || writer.status === "sending"} />
              ) : (
                <StoryWriterChat
                  messages={writer.messages}
                  status={writer.status}
                  streamProgress={writer.streamProgress}
                  streamError={writer.streamError}
                  usage={writer.usage}
                  lastResponseDurationMs={writer.lastResponseDurationMs}
                  localDraft={writer.session?.localDraft ?? null}
                  codebaseResearch={writer.codebaseResearch}
                  onCodebaseResearchChange={writer.setCodbaseResearch}
                  model={writer.model}
                  onModelChange={writer.setModel}
                  onSend={writer.sendMessage}
                  onFindRelated={handleFindRelated}
                  onOpenRelatedPanel={() => setRelatedPanelOpen(true)}
                  onStoryKeyClick={handleStoryKeyClick}
                  relatedCandidates={writer.relatedCandidates}
                  onLinkCandidate={writer.linkCandidate}
                  messageDraftMap={messageDraftMap}
                  draftContentMap={draftContentMap}
                  onViewDraft={handleViewDraft}
                  onOpenLogs={(taskId) => {
                    setShowLogs(true);
                  }}
                  issueType={ticketData?.type ?? "story"}
                />
              )}
            </div>

            {/* Resize handle */}
            <div
              onMouseDown={handleMouseDown}
              className="group flex w-1 cursor-col-resize items-center justify-center hover:bg-[var(--color-brand-500)]/20 transition-colors duration-150"
            >
              <div className="h-8 w-0.5 rounded-full bg-white/[0.08] group-hover:bg-[var(--color-brand-500)]/40 transition-colors duration-150" />
            </div>
          </>
        )}

        {/* Editor panel */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {writer.session ? (
            <StoryWriterEditor
              localDraft={writer.session.localDraft ?? ""}
              localTitle={writer.session.localTitle ?? ticketData?.title ?? ""}
              baseDescription={baseDescription}
              aiDrafts={writer.aiDrafts}
              ticket={{
                key: ticketKey,
                title: ticketData?.title ?? "",
                type: (ticketData?.type as import("@/types/ticket").IssueType) ?? "story",
                epic: ticketData?.epic ?? null,
                epicKey: ticketData?.epicKey ?? null,
                jiraStatus: (ticketData?.jiraStatus as import("@/types/ticket").JiraStatus) ?? "TO DO",
                storyPoints: ticketData?.storyPoints ?? null,
                assignee: ticketData?.assignee ?? null,
                flagged: ticketData?.flagged ?? false,
                poStatus: ticketData?.poStatus ?? null,
                qualityScore: ticketData?.qualityScore ?? null,
                editState: ticketData?.editState ?? "clean",
                notes: "",
              }}
              onDraftChange={handleDraftChange}
              onTitleChange={handleTitleChange}
              onDismissDraft={writer.dismissDraft}
              activeDraftId={activeDraftId}
              splitModeVisible={splitModeVisible}
              targetTicketKey={targetTicketKey}
              targetLocalDraft={writer.session.targetLocalDraft}
              targetLocalTitle={writer.session.targetLocalTitle ?? undefined}
              targetAiDrafts={writer.targetAiDrafts}
              targetTicketTitle={targetTicketTitle}
              onTargetDraftChange={handleTargetDraftChange}
              onTargetTitleChange={handleTargetTitleChange}
              onDismissTargetDraft={writer.dismissDraft}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-white/20" />
            </div>
          )}
        </div>

        {/* Related stories panel */}
        {relatedPanelOpen && (
          <>
            <div className="w-px shrink-0 bg-white/[0.06]" />
            <div
              style={{ width: RELATED_PANEL_WIDTH }}
              className="flex shrink-0 flex-col overflow-hidden border-l-0 bg-[var(--color-surface-base)]"
            >
              <RelatedStoriesPanel
                candidates={writer.relatedCandidates}
                onLink={writer.linkCandidate}
                onClose={() => {
                  setRelatedPanelOpen(false);
                  setRelatedPanelSelectedKey(null);
                }}
                selectedKey={relatedPanelSelectedKey}
                onSelectedKeyChange={setRelatedPanelSelectedKey}
              />
            </div>
          </>
        )}
      </div>

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
              <Button
                variant="ghost"
                size="md"
                onClick={() => setShowDeleteConfirm(false)}
                className="border-0"
              >
                Cancel
              </Button>
              <Button
                variant="ghost"
                size="md"
                onClick={() => handleDelete(false)}
              >
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
  );
}
