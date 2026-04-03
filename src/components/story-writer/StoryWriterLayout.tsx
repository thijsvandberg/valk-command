"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  CloudUpload,
  Save,
  Trash2,
  Loader2,
  Star,
  ExternalLink,
  PanelLeftClose,
  PanelLeftOpen,
  Scissors,
  NotebookPen,
} from "lucide-react";
import { useStoryWriter } from "@/hooks/useStoryWriter";
import { useTicketDetail, useTicketReviews } from "@/hooks/useSprintBoard";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { getJiraUrl } from "@/components/sprint-board/TicketTable";
import { StoryWriterChat } from "./StoryWriterChat";
import { StoryWriterEditor } from "./StoryWriterEditor";
import { SplitStoryPicker } from "./SplitStoryPicker";

const PANEL_STORAGE_KEY = "storyWriterChatWidth";
const PANEL_COLLAPSED_KEY = "storyWriterChatCollapsed";
const DEFAULT_CHAT_WIDTH = 420;
const MIN_CHAT_WIDTH = 280;
const MAX_CHAT_WIDTH = 640;
const COLLAPSED_STRIP_WIDTH = 40;

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
  const [pushError, setPushError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);

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

  // Fetch target ticket title when targetTicketKey is available
  const targetTicketKey = writer.session?.targetTicketKey ?? null;
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

  // Build messageId -> draftId map for chat badges (both original + target drafts)
  const messageDraftMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const draft of [...writer.aiDrafts, ...writer.targetAiDrafts]) {
      if (draft.messageId) {
        map[draft.messageId] = draft.id;
      }
    }
    return map;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveDraft = useCallback(async () => {
    setSaving(true);
    await writer.saveDraft();
    setSaving(false);
  }, [writer]);

  const handlePush = useCallback(async () => {
    setPushing(true);
    setPushError(null);
    try {
      const result = await writer.pushToJira();
      if (result.conflict) {
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

  const handleViewDraft = useCallback((draftId: string) => {
    setActiveDraftId(draftId);
    setTimeout(() => setActiveDraftId(null), 100);
  }, []);

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
      {/* Header */}
      <div className="relative flex items-center justify-between border-b border-white/[0.06] bg-[var(--color-surface-elevated)]/60 px-5 py-3.5 overflow-hidden">
        {/* Ambient glow from icon */}
        <div className="pointer-events-none absolute left-0 top-0 h-full w-64 bg-[radial-gradient(ellipse_at_left_center,rgba(46,145,73,0.10)_0%,transparent_70%)]" />

        <div className="relative flex items-center gap-4 min-w-0">
          {/* Brand mark */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-brand-500)]/20 shadow-[0_2px_12px_rgba(46,145,73,0.25),inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-[var(--color-brand-500)]/25">
              <NotebookPen size={16} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
            </div>
            <span className="font-[var(--font-display)] text-[15px] font-semibold tracking-tight text-white/90">
              Story writer
            </span>
          </div>

          <div className="h-6 w-px bg-gradient-to-b from-transparent via-white/[0.12] to-transparent shrink-0" />

          {/* Ticket breadcrumb */}
          {ticketData && (
            <div className="flex items-center gap-2 min-w-0">
              <Link
                href={`/tickets/${ticketKey}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-md border border-white/[0.07] bg-white/[0.04] px-2.5 py-1 shrink-0 hover:bg-white/[0.07] hover:border-white/[0.12] transition-colors duration-150 cursor-pointer"
              >
                <IssueTypeIcon type={ticketData.type} size={13} />
                <span className="text-[13px] font-semibold text-[var(--color-brand-400)]/85 hover:text-[var(--color-brand-400)]">
                  {ticketKey}
                </span>
              </Link>
              <span className="text-[13px] text-white/45 truncate">
                {ticketData.title}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {latestReview && (
            <div className="flex items-center gap-1 rounded-md bg-white/[0.04] px-2 py-1 text-[11px] text-white/40 border border-white/[0.04]">
              <Star size={11} strokeWidth={1.5} />
              {Math.round(latestReview.overallScore)}
            </div>
          )}

          {/* Split story button */}
          {writer.session && (
            <button
              type="button"
              onClick={handleSplitButtonClick}
              title={splitButtonLabel}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium cursor-pointer transition-colors duration-150 ${
                splitModeVisible && targetTicketKey
                  ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)]"
                  : "border-white/[0.06] bg-white/[0.02] text-white/50 hover:bg-white/[0.04] hover:text-white/70"
              }`}
            >
              <Scissors size={13} strokeWidth={1.5} />
              {splitButtonLabel}
            </button>
          )}

          <a
            href={getJiraUrl(ticketKey)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-white/50 hover:text-white/70 hover:bg-white/[0.04] cursor-pointer transition-colors duration-150"
          >
            <ExternalLink size={13} strokeWidth={1.5} />
            Jira
          </a>

          <button
            onClick={handleSaveDraft}
            disabled={saving || !writer.session?.localDraft}
            className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-white/50 cursor-pointer hover:bg-white/[0.04] hover:text-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} strokeWidth={1.5} />}
            Save draft
          </button>

          <button
            onClick={handlePush}
            disabled={pushing || !writer.session?.localDraft}
            className="flex items-center gap-1.5 rounded-md bg-[var(--color-brand-600)] px-3 py-1.5 text-xs font-medium text-white shadow-[0_2px_8px_rgba(46,145,73,0.2)] cursor-pointer hover:bg-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-95 transition-transform duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pushing ? <Loader2 size={13} className="animate-spin" /> : <CloudUpload size={13} strokeWidth={1.5} />}
            Push to Jira
          </button>

          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-white/30 hover:text-red-400/70 hover:bg-red-500/[0.06] cursor-pointer transition-colors duration-150"
          >
            <Trash2 size={13} strokeWidth={1.5} />
          </button>
        </div>
      </div>

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
            className="flex shrink-0 flex-col items-center border-r border-white/[0.06] bg-[var(--color-surface-base)] pt-2"
          >
            <button
              type="button"
              onClick={handleToggleChat}
              title="Expand chat"
              className="flex h-8 w-8 items-center justify-center rounded-md text-white/30 cursor-pointer hover:text-white/60 hover:bg-white/[0.06] transition-colors duration-150"
            >
              <PanelLeftOpen size={15} strokeWidth={1.5} />
            </button>
          </div>
        ) : (
          <>
            <div style={{ width: chatWidth }} className="flex shrink-0 flex-col border-r border-white/[0.06]">
              <div className="flex items-center justify-end border-b border-white/[0.04] px-2 py-1">
                <button
                  type="button"
                  onClick={handleToggleChat}
                  title="Collapse chat"
                  className="flex h-6 w-6 items-center justify-center rounded text-white/25 cursor-pointer hover:text-white/50 hover:bg-white/[0.06] transition-colors duration-150"
                >
                  <PanelLeftClose size={13} strokeWidth={1.5} />
                </button>
              </div>
              <StoryWriterChat
                messages={writer.messages}
                status={writer.status}
                streamProgress={writer.streamProgress}
                streamError={writer.streamError}
                codebaseResearch={writer.codebaseResearch}
                onCodebaseResearchChange={writer.setCodbaseResearch}
                model={writer.model}
                onModelChange={writer.setModel}
                onSend={writer.sendMessage}
                messageDraftMap={messageDraftMap}
                onViewDraft={handleViewDraft}
              />
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
        <div className="flex flex-1 flex-col overflow-hidden">
          {writer.session ? (
            <StoryWriterEditor
              localDraft={writer.session.localDraft ?? ""}
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
              onDraftChange={writer.updateLocalDraft}
              onDismissDraft={writer.dismissDraft}
              activeDraftId={activeDraftId}
              splitModeVisible={splitModeVisible}
              targetTicketKey={targetTicketKey}
              targetLocalDraft={writer.session.targetLocalDraft}
              targetAiDrafts={writer.targetAiDrafts}
              targetTicketTitle={targetTicketTitle}
              onTargetDraftChange={writer.updateTargetLocalDraft}
              onDismissTargetDraft={writer.dismissDraft}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-white/20" />
            </div>
          )}
        </div>
      </div>

      {/* Footer bar */}
      <div className="flex items-center justify-between border-t border-white/[0.06] bg-white/[0.015] px-4 py-1.5">
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/25">
            {writer.session ? "Session active" : "No session"}
          </span>
          {writer.aiDrafts.length > 0 && (
            <span className="text-xs text-white/25">
              {writer.aiDrafts.length} draft{writer.aiDrafts.length !== 1 ? "s" : ""}
            </span>
          )}
          {targetTicketKey && (
            <span className="text-xs text-[var(--color-brand-400)]/50">
              Split: {targetTicketKey}
            </span>
          )}
        </div>
        <span className="text-xs text-white/20">
          {writer.messages.length > 0 ? `${writer.messages.length} messages` : ""}
        </span>
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
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-md px-3 py-1.5 text-xs text-white/50 hover:text-white/70 hover:bg-white/[0.04] cursor-pointer transition-colors duration-150"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(false)}
                className="rounded-md bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/70 border border-white/[0.08] cursor-pointer hover:bg-white/[0.08] active:scale-95 transition-transform duration-150"
              >
                Discard, keep chat
              </button>
              <button
                onClick={() => handleDelete(true)}
                className="rounded-md bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 border border-red-500/20 cursor-pointer hover:bg-red-500/20 active:scale-95 transition-transform duration-150"
              >
                Delete everything
              </button>
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
