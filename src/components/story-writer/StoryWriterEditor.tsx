"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import {
  FileText, GitCompare, Trash2, Check,
  ChevronLeft, ChevronRight,
  History, Eye, Columns2, PanelLeftClose, PanelRightClose,
} from "lucide-react";
import { RichEditor } from "@/components/rich-editor/RichEditor";
import { StoryDiff, type HunkState, type StoryDiffHandle } from "@/components/story-diff/StoryDiff";
import { TicketHistory } from "@/components/ticket-detail/TicketHistory";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import { useTicketVersions } from "@/hooks/useSprintBoard";
import { VersionPicker, type VersionOption } from "@/components/shared/VersionPicker";
import type { StoryWriterDraftRow } from "@/db/schema";
import type { Ticket } from "@/types/ticket";

// ---------------------------------------------------------------------------
// TitleInput: inline-editable title field
// ---------------------------------------------------------------------------

interface TitleInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

function TitleInput({ value, onChange, placeholder = "Story title..." }: TitleInputProps) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-transparent px-4 pt-4 pb-1 font-[var(--font-display)] text-[1.35rem] font-semibold leading-snug tracking-tight text-white/90 placeholder:text-white/20 focus:outline-none"
    />
  );
}

type EditorTab = "editor" | "diff" | "history";
type DiffViewMode = "diff" | "plain";
type DiffLayout = "full" | "side-by-side";
type CollapsedPane = null | "original" | "target";

// RightVersion extends VersionOption with story-writer-specific fields
interface RightVersion extends VersionOption {
  content: string;
  isDraft?: boolean;
  draftDbId?: string;
}

// Raw row shape returned by /api/tickets/[key]/versions
interface StoredVersionRow {
  id: string;
  description: string;
  createdAt: string;
  updatedBy: string | null;
  updatedByAvatar: string | null;
  contentHash: string;
}

interface StoryWriterEditorProps {
  localDraft: string;
  localTitle?: string;
  baseDescription: string;
  aiDrafts: StoryWriterDraftRow[];
  ticket: Ticket;
  onDraftChange: (content: string) => void;
  onTitleChange?: (title: string) => void;
  onDismissDraft: (draftId: string) => void;
  activeDraftId?: string | null;
  // Split mode props
  splitModeVisible?: boolean;
  targetTicketKey?: string | null;
  targetLocalDraft?: string | null;
  targetLocalTitle?: string | null;
  targetAiDrafts?: StoryWriterDraftRow[];
  targetTicketTitle?: string | null;
  onTargetDraftChange?: (content: string) => void;
  onTargetTitleChange?: (title: string) => void;
  onDismissTargetDraft?: (draftId: string) => void;
}

const SPLIT_WIDTH_KEY = "storyWriterSplitWidth";
const DIFF_LAYOUT_KEY = "storyWriterDiffLayout";
const SPLIT_MODE_WIDTH_KEY = "storyWriterSplitModeWidth";
const DEFAULT_SPLIT_WIDTH = 420;
const MIN_SPLIT_WIDTH = 240;
const MAX_SPLIT_WIDTH = 900;

// ---------------------------------------------------------------------------
// DiffPane: version selector + AI navigator + StoryDiff (or plain preview)
// ---------------------------------------------------------------------------

interface DiffPaneProps {
  baseSnapshot: string;
  rightVersions: RightVersion[];
  diffNewId: string;
  diffViewMode: DiffViewMode;
  hunkStates: Record<number, HunkState>;
  selectedDraftIdx: number;
  totalDrafts: number;
  snapshotKey: number;
  onDiffNewIdChange: (id: string) => void;
  onDiffViewModeChange: (m: DiffViewMode) => void;
  onHunkStatesChange: (s: Record<number, HunkState>) => void;
  onResultChange: (text: string) => void;
  onNavigateDraft: (dir: -1 | 1) => void;
  onDismissDraft: (draftDbId: string) => void;
}

function DiffPane({
  baseSnapshot,
  rightVersions,
  diffNewId,
  diffViewMode,
  hunkStates,
  selectedDraftIdx,
  totalDrafts,
  snapshotKey,
  onDiffNewIdChange,
  onDiffViewModeChange,
  onHunkStatesChange,
  onResultChange,
  onNavigateDraft,
  onDismissDraft,
}: DiffPaneProps) {
  const selected = rightVersions.find((v) => v.id === diffNewId);
  const isAiDraft = selected?.isDraft ?? false;
  const diffRef = useRef<StoryDiffHandle>(null);
  const [diffStats, setDiffStats] = useState<{ changeHunkCount: number; decidedCount: number } | null>(null);

  const pendingHunkCount = diffStats ? diffStats.changeHunkCount - diffStats.decidedCount : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 items-center gap-2 border-b border-white/[0.06] px-3">
        <VersionPicker
          options={rightVersions}
          selectedId={diffNewId}
          onSelect={onDiffNewIdChange}
        />

        <div className="ml-auto flex items-center gap-2">
          {diffViewMode === "plain" ? (
            <button
              type="button"
              onClick={() => onDiffViewModeChange("diff")}
              title="Show diff"
              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium cursor-pointer text-white/35 hover:text-white/55 hover:bg-white/[0.04] transition-colors duration-150"
            >
              <GitCompare size={11} strokeWidth={1.5} />
              Diff
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onDiffViewModeChange("plain")}
              title="Preview the selected version"
              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium cursor-pointer text-white/35 hover:text-white/55 hover:bg-white/[0.04] transition-colors duration-150"
            >
              <Eye size={11} strokeWidth={1.5} />
              Preview
            </button>
          )}
        </div>
      </div>

      {isAiDraft && totalDrafts > 0 && (
        <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.015] px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={selectedDraftIdx === 0}
              onClick={() => onNavigateDraft(-1)}
              className="flex h-6 w-6 items-center justify-center rounded text-white/40 cursor-pointer hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150"
            >
              <ChevronLeft size={14} strokeWidth={1.5} />
            </button>
            <span className="text-xs text-white/45">
              AI Draft {selectedDraftIdx + 1} of {totalDrafts}
            </span>
            <button
              type="button"
              disabled={selectedDraftIdx === totalDrafts - 1}
              onClick={() => onNavigateDraft(1)}
              className="flex h-6 w-6 items-center justify-center rounded text-white/40 cursor-pointer hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150"
            >
              <ChevronRight size={14} strokeWidth={1.5} />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {pendingHunkCount > 0 && (
              <button
                type="button"
                onClick={() => diffRef.current?.acceptAll()}
                className="flex items-center gap-1 rounded-md bg-[var(--color-brand-600)]/15 px-2.5 py-1 text-[11px] font-medium text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/20 cursor-pointer hover:bg-[var(--color-brand-600)]/25 active:scale-95 transition-transform duration-150"
              >
                <Check size={11} strokeWidth={2} />
                Accept {pendingHunkCount} remaining
              </button>
            )}
            <button
              type="button"
              onClick={() => selected?.draftDbId && onDismissDraft(selected.draftDbId)}
              title="Remove this AI draft"
              className="flex items-center gap-1 rounded-md bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/40 border border-white/[0.06] cursor-pointer hover:text-red-400/70 hover:bg-red-500/[0.06] active:scale-95 transition-transform duration-150"
            >
              <Trash2 size={11} strokeWidth={2} />
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-xs text-white/25">
            {rightVersions.length === 0 ? "No versions to compare" : "Select a version"}
          </div>
        ) : (
          <>
            {diffViewMode === "plain" && (
              <div className="description-content px-1 py-2">
                {renderMarkdown(selected.content)}
              </div>
            )}
            <div className={diffViewMode === "plain" ? "hidden" : ""}>
              <StoryDiff
                ref={diffRef}
                key={`${diffNewId}-${snapshotKey}`}
                oldText={baseSnapshot}
                newText={selected.content}
                oldLabel="Current"
                newLabel={selected.label}
                interactive
                pendingIsOld
                onResultChange={onResultChange}
                hunkStates={hunkStates}
                onHunkStatesChange={onHunkStatesChange}
                onStatsComputed={setDiffStats}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SplitModeLayout: two editors side by side with collapsible panes
// ---------------------------------------------------------------------------

interface SplitPaneDiffState {
  diffNewId: string;
  diffViewMode: DiffViewMode;
  hunkStates: Record<number, HunkState>;
  selectedDraftIdx: number;
  baseSnapshot: string;
  snapshotKey: number;
}

interface SplitModeLayoutProps {
  originalKey: string;
  originalTitle: string;
  originalDraft: string;
  originalAiDrafts: StoryWriterDraftRow[];
  originalBaseDescription: string;
  targetKey: string;
  targetTitle: string;
  targetDraft: string;
  targetAiDrafts: StoryWriterDraftRow[];
  onOriginalDraftChange: (content: string) => void;
  onOriginalTitleChange?: (title: string) => void;
  onTargetDraftChange: (content: string) => void;
  onTargetTitleChange?: (title: string) => void;
  onDismissOriginalDraft: (draftId: string) => void;
  onDismissTargetDraft: (draftId: string) => void;
}

function SplitModeLayout({
  originalKey,
  originalTitle,
  originalDraft,
  originalAiDrafts,
  originalBaseDescription,
  targetKey,
  targetTitle,
  targetDraft,
  targetAiDrafts,
  onOriginalDraftChange,
  onOriginalTitleChange,
  onTargetDraftChange,
  onTargetTitleChange,
  onDismissOriginalDraft,
  onDismissTargetDraft,
}: SplitModeLayoutProps) {
  const [collapsedPane, setCollapsedPane] = useState<CollapsedPane>(null);
  const [origPaneView, setOrigPaneView] = useState<"editor" | "diff">("editor");
  const [targetPaneView, setTargetPaneView] = useState<"editor" | "diff">("editor");

  const [splitModeWidth, setSplitModeWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_SPLIT_WIDTH;
    const s = localStorage.getItem(SPLIT_MODE_WIDTH_KEY);
    return s ? Math.max(MIN_SPLIT_WIDTH, Math.min(MAX_SPLIT_WIDTH, parseInt(s, 10))) : DEFAULT_SPLIT_WIDTH;
  });
  const splitModeDragging = useRef(false);
  const splitModeContainerRef = useRef<HTMLDivElement>(null);
  // Ref mirrors splitModeWidth so the mouseup handler can read the latest value
  // without the drag-resize effect needing splitModeWidth as a dependency.
  const splitModeWidthRef = useRef(splitModeWidth);
  useEffect(() => { splitModeWidthRef.current = splitModeWidth; }, [splitModeWidth]);

  // Per-pane diff state
  const [origDiffState, setOrigDiffState] = useState<SplitPaneDiffState>({
    diffNewId: "",
    diffViewMode: "plain",
    hunkStates: {},
    selectedDraftIdx: 0,
    baseSnapshot: originalDraft,
    snapshotKey: 0,
  });
  const [targetDiffState, setTargetDiffState] = useState<SplitPaneDiffState>({
    diffNewId: "",
    diffViewMode: "plain",
    hunkStates: {},
    selectedDraftIdx: 0,
    baseSnapshot: targetDraft,
    snapshotKey: 0,
  });

  const originalRightVersions = useMemo<RightVersion[]>(() => {
    const versions: RightVersion[] = [];
    if (originalBaseDescription) {
      versions.push({ id: "jira", label: "Jira version", content: originalBaseDescription });
    }
    for (const d of originalAiDrafts) {
      versions.push({ id: `ai-${d.id}`, label: `AI Draft ${d.draftIndex + 1}`, content: d.content, isDraft: true, draftDbId: d.id });
    }
    return versions;
  }, [originalBaseDescription, originalAiDrafts]);

  const targetRightVersions = useMemo<RightVersion[]>(() => {
    const versions: RightVersion[] = [];
    for (const d of targetAiDrafts) {
      versions.push({ id: `ai-${d.id}`, label: `AI Draft ${d.draftIndex + 1}`, content: d.content, isDraft: true, draftDbId: d.id });
    }
    return versions;
  }, [targetAiDrafts]);

  // Derive active diffNewId: use stored value or fall back to latest AI draft / first version
  const resolvedOrigDiffNewId = origDiffState.diffNewId
    || (([...originalRightVersions].reverse().find((v) => v.isDraft) || originalRightVersions[0])?.id || "");
  const resolvedTargetDiffNewId = targetDiffState.diffNewId
    || (([...targetRightVersions].reverse().find((v) => v.isDraft) || targetRightVersions[0])?.id || "");

  // Drag resize for split mode panes
  const handleSplitModeMouseDown = useCallback(() => {
    splitModeDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!splitModeDragging.current || !splitModeContainerRef.current) return;
      const rect = splitModeContainerRef.current.getBoundingClientRect();
      const newWidth = Math.max(MIN_SPLIT_WIDTH, Math.min(MAX_SPLIT_WIDTH, e.clientX - rect.left));
      setSplitModeWidth(newWidth);
    }
    function onUp() {
      if (!splitModeDragging.current) return;
      splitModeDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem(SPLIT_MODE_WIDTH_KEY, String(splitModeWidthRef.current));
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const handleOrigDiffNewIdChange = useCallback((id: string) => {
    const idx = originalAiDrafts.findIndex((d) => `ai-${d.id}` === id);
    setOrigDiffState((s) => ({
      ...s,
      diffNewId: id,
      hunkStates: {},
      baseSnapshot: originalDraft,
      snapshotKey: s.snapshotKey + 1,
      selectedDraftIdx: idx >= 0 ? idx : s.selectedDraftIdx,
    }));
  }, [originalDraft, originalAiDrafts]);

  const handleTargetDiffNewIdChange = useCallback((id: string) => {
    const idx = targetAiDrafts.findIndex((d) => `ai-${d.id}` === id);
    setTargetDiffState((s) => ({
      ...s,
      diffNewId: id,
      hunkStates: {},
      baseSnapshot: targetDraft,
      snapshotKey: s.snapshotKey + 1,
      selectedDraftIdx: idx >= 0 ? idx : s.selectedDraftIdx,
    }));
  }, [targetDraft, targetAiDrafts]);

  const handleCollapsePane = useCallback((pane: "original" | "target") => {
    setCollapsedPane((prev) => {
      if (prev === pane) return null;
      // Snapshot the visible pane's draft when collapsing
      if (pane === "original") {
        setTargetDiffState((s) => ({ ...s, baseSnapshot: targetDraft, snapshotKey: s.snapshotKey + 1 }));
      } else {
        setOrigDiffState((s) => ({ ...s, baseSnapshot: originalDraft, snapshotKey: s.snapshotKey + 1 }));
      }
      return pane;
    });
  }, [originalDraft, targetDraft]);

  // When both panes visible: two editors side by side
  // When original collapsed: target fills width with editor + diff
  // When target collapsed: original fills width with editor + diff

  if (collapsedPane === "original") {
    return (
      <div className="flex h-full flex-col">
        <SplitPaneHeader
          ticketKey={targetKey}
          title={targetTitle}
          slot="target"
          collapseIcon={<PanelRightClose size={13} strokeWidth={1.5} />}
          onCollapse={() => handleCollapsePane("original")}
          collapseTitle="Show both panes"
          showOriginalButton
          onShowOriginal={() => setCollapsedPane(null)}
        />
        <div className="flex flex-1 overflow-hidden">
          <div style={{ width: splitModeWidth }} className="shrink-0 overflow-hidden border-r border-white/[0.06]">
            <RichEditor
              value={targetDraft}
              onChange={onTargetDraftChange}
              placeholder="Story description..."
              borderless
              slotBeforeContent={onTargetTitleChange
                ? <TitleInput value={targetTitle} onChange={onTargetTitleChange} />
                : undefined}
            />
          </div>
          <div
            onMouseDown={handleSplitModeMouseDown}
            className="group flex w-1 cursor-col-resize items-center justify-center hover:bg-[var(--color-brand-500)]/20 transition-colors duration-150"
          >
            <div className="h-8 w-0.5 rounded-full bg-white/[0.08] group-hover:bg-[var(--color-brand-500)]/40 transition-colors duration-150" />
          </div>
          <div className="flex flex-1 flex-col overflow-hidden">
            {targetRightVersions.length > 0 ? (
              <DiffPane
                baseSnapshot={targetDiffState.baseSnapshot}
                rightVersions={targetRightVersions}
                diffNewId={resolvedTargetDiffNewId}
                diffViewMode={targetDiffState.diffViewMode}
                hunkStates={targetDiffState.hunkStates}
                selectedDraftIdx={targetDiffState.selectedDraftIdx}
                totalDrafts={targetAiDrafts.length}
                snapshotKey={targetDiffState.snapshotKey}
                onDiffNewIdChange={handleTargetDiffNewIdChange}
                onDiffViewModeChange={(m) => setTargetDiffState((s) => ({ ...s, diffViewMode: m }))}
                onHunkStatesChange={(h) => setTargetDiffState((s) => ({ ...s, hunkStates: h }))}
                onResultChange={onTargetDraftChange}
                onNavigateDraft={(dir) => {
                  const newIdx = Math.max(0, Math.min(targetAiDrafts.length - 1, targetDiffState.selectedDraftIdx + dir));
                  const draft = targetAiDrafts[newIdx];
                  if (draft) handleTargetDiffNewIdChange(`ai-${draft.id}`);
                }}
                onDismissDraft={onDismissTargetDraft}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-white/25">
                No AI drafts yet for this story
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (collapsedPane === "target") {
    return (
      <div className="flex h-full flex-col">
        <SplitPaneHeader
          ticketKey={originalKey}
          title={originalTitle}
          slot="original"
          collapseIcon={<PanelLeftClose size={13} strokeWidth={1.5} />}
          onCollapse={() => handleCollapsePane("target")}
          collapseTitle="Show both panes"
          showTargetButton
          onShowTarget={() => setCollapsedPane(null)}
        />
        <div className="flex flex-1 overflow-hidden">
          <div style={{ width: splitModeWidth }} className="shrink-0 overflow-hidden border-r border-white/[0.06]">
            <RichEditor
              value={originalDraft}
              onChange={onOriginalDraftChange}
              placeholder="Story description..."
              borderless
              slotBeforeContent={onOriginalTitleChange
                ? <TitleInput value={originalTitle} onChange={onOriginalTitleChange} />
                : undefined}
            />
          </div>
          <div
            onMouseDown={handleSplitModeMouseDown}
            className="group flex w-1 cursor-col-resize items-center justify-center hover:bg-[var(--color-brand-500)]/20 transition-colors duration-150"
          >
            <div className="h-8 w-0.5 rounded-full bg-white/[0.08] group-hover:bg-[var(--color-brand-500)]/40 transition-colors duration-150" />
          </div>
          <div className="flex flex-1 flex-col overflow-hidden">
            <DiffPane
              baseSnapshot={origDiffState.baseSnapshot}
              rightVersions={originalRightVersions}
              diffNewId={resolvedOrigDiffNewId}
              diffViewMode={origDiffState.diffViewMode}
              hunkStates={origDiffState.hunkStates}
              selectedDraftIdx={origDiffState.selectedDraftIdx}
              totalDrafts={originalAiDrafts.length}
              snapshotKey={origDiffState.snapshotKey}
              onDiffNewIdChange={handleOrigDiffNewIdChange}
              onDiffViewModeChange={(m) => setOrigDiffState((s) => ({ ...s, diffViewMode: m }))}
              onHunkStatesChange={(h) => setOrigDiffState((s) => ({ ...s, hunkStates: h }))}
              onResultChange={onOriginalDraftChange}
              onNavigateDraft={(dir) => {
                const newIdx = Math.max(0, Math.min(originalAiDrafts.length - 1, origDiffState.selectedDraftIdx + dir));
                const draft = originalAiDrafts[newIdx];
                if (draft) handleOrigDiffNewIdChange(`ai-${draft.id}`);
              }}
              onDismissDraft={onDismissOriginalDraft}
            />
          </div>
        </div>
      </div>
    );
  }

  // Default: both panes visible
  return (
    <div ref={splitModeContainerRef} className="flex h-full flex-col overflow-hidden">
      <div className="flex h-full">
        {/* Original pane */}
        <div
          style={{ width: collapsedPane === null ? splitModeWidth : 0 }}
          className="flex shrink-0 flex-col overflow-hidden border-r border-white/[0.06]"
        >
          <SplitPaneHeader
            ticketKey={originalKey}
            title={originalTitle}
            slot="original"
            collapseIcon={<PanelLeftClose size={13} strokeWidth={1.5} />}
            onCollapse={() => handleCollapsePane("original")}
            collapseTitle="Collapse original, show target with diff"
            paneView={origPaneView}
            onPaneViewChange={setOrigPaneView}
            hasDrafts={originalAiDrafts.length > 0}
          />
          <div className="flex-1 overflow-hidden">
            {origPaneView === "editor" ? (
              <RichEditor
                value={originalDraft}
                onChange={onOriginalDraftChange}
                placeholder="Story description..."
                borderless
                slotBeforeContent={onOriginalTitleChange
                  ? <TitleInput value={originalTitle} onChange={onOriginalTitleChange} />
                  : undefined}
              />
            ) : (
              <DiffPane
                baseSnapshot={origDiffState.baseSnapshot}
                rightVersions={originalRightVersions}
                diffNewId={resolvedOrigDiffNewId}
                diffViewMode={origDiffState.diffViewMode}
                hunkStates={origDiffState.hunkStates}
                selectedDraftIdx={origDiffState.selectedDraftIdx}
                totalDrafts={originalAiDrafts.length}
                snapshotKey={origDiffState.snapshotKey}
                onDiffNewIdChange={handleOrigDiffNewIdChange}
                onDiffViewModeChange={(m) => setOrigDiffState((s) => ({ ...s, diffViewMode: m }))}
                onHunkStatesChange={(h) => setOrigDiffState((s) => ({ ...s, hunkStates: h }))}
                onResultChange={onOriginalDraftChange}
                onNavigateDraft={(dir) => {
                  const newIdx = Math.max(0, Math.min(originalAiDrafts.length - 1, origDiffState.selectedDraftIdx + dir));
                  const draft = originalAiDrafts[newIdx];
                  if (draft) handleOrigDiffNewIdChange(`ai-${draft.id}`);
                }}
                onDismissDraft={onDismissOriginalDraft}
              />
            )}
          </div>
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={handleSplitModeMouseDown}
          className="group flex w-1 cursor-col-resize items-center justify-center hover:bg-[var(--color-brand-500)]/20 transition-colors duration-150"
        >
          <div className="h-8 w-0.5 rounded-full bg-white/[0.08] group-hover:bg-[var(--color-brand-500)]/40 transition-colors duration-150" />
        </div>

        {/* Target pane */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <SplitPaneHeader
            ticketKey={targetKey}
            title={targetTitle}
            slot="target"
            collapseIcon={<PanelRightClose size={13} strokeWidth={1.5} />}
            onCollapse={() => handleCollapsePane("target")}
            collapseTitle="Collapse target, show original with diff"
            paneView={targetPaneView}
            onPaneViewChange={setTargetPaneView}
            hasDrafts={targetAiDrafts.length > 0}
          />
          <div className="flex-1 overflow-hidden">
            {targetPaneView === "editor" ? (
              <RichEditor
                value={targetDraft}
                onChange={onTargetDraftChange}
                placeholder="Story description..."
                borderless
                slotBeforeContent={onTargetTitleChange
                  ? <TitleInput value={targetTitle} onChange={onTargetTitleChange} />
                  : undefined}
              />
            ) : (
              targetRightVersions.length > 0 ? (
                <DiffPane
                  baseSnapshot={targetDiffState.baseSnapshot}
                  rightVersions={targetRightVersions}
                  diffNewId={resolvedTargetDiffNewId}
                  diffViewMode={targetDiffState.diffViewMode}
                  hunkStates={targetDiffState.hunkStates}
                  selectedDraftIdx={targetDiffState.selectedDraftIdx}
                  totalDrafts={targetAiDrafts.length}
                  snapshotKey={targetDiffState.snapshotKey}
                  onDiffNewIdChange={handleTargetDiffNewIdChange}
                  onDiffViewModeChange={(m) => setTargetDiffState((s) => ({ ...s, diffViewMode: m }))}
                  onHunkStatesChange={(h) => setTargetDiffState((s) => ({ ...s, hunkStates: h }))}
                  onResultChange={onTargetDraftChange}
                  onNavigateDraft={(dir) => {
                    const newIdx = Math.max(0, Math.min(targetAiDrafts.length - 1, targetDiffState.selectedDraftIdx + dir));
                    const draft = targetAiDrafts[newIdx];
                    if (draft) handleTargetDiffNewIdChange(`ai-${draft.id}`);
                  }}
                  onDismissDraft={onDismissTargetDraft}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-white/25">
                  No AI drafts yet for this story
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface SplitPaneHeaderProps {
  ticketKey: string;
  title: string;
  slot: "original" | "target";
  collapseIcon: React.ReactNode;
  onCollapse: () => void;
  collapseTitle: string;
  showOriginalButton?: boolean;
  onShowOriginal?: () => void;
  showTargetButton?: boolean;
  onShowTarget?: () => void;
  paneView?: "editor" | "diff";
  onPaneViewChange?: (v: "editor" | "diff") => void;
  hasDrafts?: boolean;
}

function SplitPaneHeader({
  ticketKey,
  title,
  slot,
  collapseIcon,
  onCollapse,
  collapseTitle,
  showOriginalButton,
  onShowOriginal,
  showTargetButton,
  onShowTarget,
  paneView,
  onPaneViewChange,
  hasDrafts,
}: SplitPaneHeaderProps) {
  return (
    <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[var(--color-surface-elevated)]/60 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/tickets/${ticketKey}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs font-semibold text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] transition-colors duration-150"
          >
            {ticketKey}
          </Link>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              slot === "original"
                ? "bg-white/[0.06] text-white/40"
                : "bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)]/70"
            }`}
          >
            {slot === "original" ? "Original" : "Split target"}
          </span>
        </div>
        <p className="truncate text-xs text-white/50 leading-tight mt-0.5">{title}</p>
      </div>

      <div className="flex items-center gap-1">
        {/* Per-pane Editor / Diff tabs */}
        {onPaneViewChange && (
          <div className="flex items-center gap-0.5 rounded-md bg-white/[0.04] p-0.5">
            <button
              type="button"
              onClick={() => onPaneViewChange("editor")}
              title="Editor"
              className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium cursor-pointer transition-colors duration-150 ${
                paneView === "editor"
                  ? "bg-[var(--color-surface-floating)] text-white/70 shadow-sm"
                  : "text-white/35 hover:text-white/55"
              }`}
            >
              <FileText size={11} strokeWidth={1.5} />
              Editor
            </button>
            <button
              type="button"
              onClick={() => onPaneViewChange("diff")}
              title="Diff"
              className={`relative flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium cursor-pointer transition-colors duration-150 ${
                paneView === "diff"
                  ? "bg-[var(--color-surface-floating)] text-white/70 shadow-sm"
                  : "text-white/35 hover:text-white/55"
              }`}
            >
              <GitCompare size={11} strokeWidth={1.5} />
              Diff
              {hasDrafts && paneView !== "diff" && (
                <span className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-[var(--color-brand-400)]" />
              )}
            </button>
          </div>
        )}

        {showOriginalButton && onShowOriginal && (
          <button
            type="button"
            onClick={onShowOriginal}
            title="Show original story"
            className="rounded px-2 py-1 text-[11px] text-white/40 hover:text-white/60 hover:bg-white/[0.04] cursor-pointer transition-colors duration-150"
          >
            Show original
          </button>
        )}
        {showTargetButton && onShowTarget && (
          <button
            type="button"
            onClick={onShowTarget}
            title="Show split target story"
            className="rounded px-2 py-1 text-[11px] text-white/40 hover:text-white/60 hover:bg-white/[0.04] cursor-pointer transition-colors duration-150"
          >
            Show target
          </button>
        )}
        <button
          type="button"
          onClick={onCollapse}
          title={collapseTitle}
          className="flex items-center justify-center rounded p-1 text-white/30 hover:text-white/55 hover:bg-white/[0.05] cursor-pointer transition-colors duration-150"
        >
          {collapseIcon}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function StoryWriterEditor({
  localDraft,
  localTitle,
  baseDescription,
  aiDrafts,
  ticket,
  onDraftChange,
  onTitleChange,
  onDismissDraft,
  activeDraftId,
  splitModeVisible,
  targetTicketKey,
  targetLocalDraft,
  targetLocalTitle,
  targetAiDrafts = [],
  targetTicketTitle,
  onTargetDraftChange,
  onTargetTitleChange,
  onDismissTargetDraft,
}: StoryWriterEditorProps) {
  const { data: versionsData } = useTicketVersions(ticket.key);

  const [activeTab, setActiveTab] = useState<EditorTab>("editor");
  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>("plain");
  const [diffNewId, setDiffNewId] = useState("");
  const [diffHunkStates, setDiffHunkStates] = useState<Record<number, HunkState>>({});
  const [selectedDraftIdx, setSelectedDraftIdx] = useState(0);
  const [diffLayout, setDiffLayout] = useState<DiffLayout>(() => {
    if (typeof window === "undefined") return "full";
    return (localStorage.getItem(DIFF_LAYOUT_KEY) as DiffLayout) ?? "full";
  });

  const [diffBaseSnapshot, setDiffBaseSnapshot] = useState(localDraft);
  const [snapshotKey, setSnapshotKey] = useState(0);

  const [splitWidth, setSplitWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_SPLIT_WIDTH;
    const s = localStorage.getItem(SPLIT_WIDTH_KEY);
    return s
      ? Math.max(MIN_SPLIT_WIDTH, Math.min(MAX_SPLIT_WIDTH, parseInt(s, 10)))
      : DEFAULT_SPLIT_WIDTH;
  });
  const splitDragging = useRef(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const splitWidthRef = useRef(splitWidth);
  useEffect(() => { splitWidthRef.current = splitWidth; }, [splitWidth]);

  const rightVersions = useMemo<RightVersion[]>(() => {
    const versions: RightVersion[] = [];

    // Build stored version list sorted ascending (oldest = v1)
    const rawRows = Array.isArray(versionsData) ? (versionsData as StoredVersionRow[]) : [];
    const sortedRows = [...rawRows].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    if (sortedRows.length > 0) {
      const total = sortedRows.length;
      // Newest-first in dropdown
      for (let i = total - 1; i >= 0; i--) {
        const row = sortedRows[i];
        const vNum = i + 1;
        const isCurrent = i === total - 1;
        versions.push({
          id: `stored-${row.id}`,
          label: isCurrent ? `v${vNum} (current)` : `v${vNum}`,
          content: row.description,
          group: "Jira versions",
          versionNum: vNum,
          title: `Version ${vNum}`,
          author: row.updatedBy,
          avatarUrl: row.updatedByAvatar,
          isoDate: row.createdAt,
          tag: isCurrent ? "current" : "jira",
        });
      }
    } else if (baseDescription) {
      versions.push({
        id: "jira",
        label: "Jira version",
        content: baseDescription,
        title: "Jira version",
        tag: "current",
      });
    }

    for (const draft of aiDrafts) {
      versions.push({
        id: `ai-${draft.id}`,
        label: `AI Draft ${draft.draftIndex + 1}`,
        content: draft.content,
        isDraft: true,
        draftDbId: draft.id,
        group: aiDrafts.length > 0 ? "AI Drafts" : undefined,
        title: `AI Draft ${draft.draftIndex + 1}`,
        author: null,
        avatarUrl: null,
        isoDate: draft.createdAt,
        tag: "ai-draft",
      });
    }
    return versions;
  }, [baseDescription, aiDrafts, versionsData]);

  if (!diffNewId && rightVersions.length > 0) {
    const latestAi = [...rightVersions].reverse().find((v) => v.isDraft);
    setDiffNewId(latestAi?.id ?? rightVersions[0].id);
  }

  if (activeDraftId) {
    const versionId = `ai-${activeDraftId}`;
    if (diffNewId !== versionId || activeTab !== "diff") {
      setDiffNewId(versionId);
      if (activeTab !== "diff") setActiveTab("diff");
      setDiffViewMode("diff");
      setDiffHunkStates({});
      setDiffBaseSnapshot(localDraft);
      setSnapshotKey((k) => k + 1);
      const idx = aiDrafts.findIndex((d) => d.id === activeDraftId);
      if (idx >= 0) setSelectedDraftIdx(idx);
    }
  }

  const handleTabChange = useCallback(
    (tab: EditorTab) => {
      if (tab === "diff" && activeTab !== "diff") {
        setDiffBaseSnapshot(localDraft);
        setSnapshotKey((k) => k + 1);
        setDiffHunkStates({});
      }
      setActiveTab(tab);
    },
    [activeTab, localDraft],
  );

  const handleDiffLayoutToggle = useCallback(() => {
    setDiffLayout((prev) => {
      const next = prev === "full" ? "side-by-side" : "full";
      // Snapshot when entering side-by-side
      if (next === "side-by-side") {
        setDiffBaseSnapshot(localDraft);
        setSnapshotKey((k) => k + 1);
        setDiffHunkStates({});
      }
      localStorage.setItem(DIFF_LAYOUT_KEY, next);
      return next;
    });
  }, [localDraft]);

  const handleDiffNewIdChange = useCallback(
    (id: string) => {
      setDiffNewId(id);
      setDiffHunkStates({});
      setDiffBaseSnapshot(localDraft);
      setSnapshotKey((k) => k + 1);
      const idx = aiDrafts.findIndex((d) => `ai-${d.id}` === id);
      if (idx >= 0) setSelectedDraftIdx(idx);
    },
    [localDraft, aiDrafts],
  );

  const handleNavigateDraft = useCallback(
    (dir: -1 | 1) => {
      const newIdx = Math.max(0, Math.min(aiDrafts.length - 1, selectedDraftIdx + dir));
      setSelectedDraftIdx(newIdx);
      const draft = aiDrafts[newIdx];
      if (draft) handleDiffNewIdChange(`ai-${draft.id}`);
    },
    [selectedDraftIdx, aiDrafts, handleDiffNewIdChange],
  );

  const handleDismissDraft = useCallback(
    (draftDbId: string) => {
      onDismissDraft(draftDbId);
      if (aiDrafts.length <= 1) {
        // Fall back to the first non-draft version in the list (first stored version or "jira")
        const fallback = rightVersions.find((v) => !v.isDraft);
        setDiffNewId(fallback?.id ?? "");
      } else {
        const newIdx = Math.max(0, selectedDraftIdx - 1);
        setSelectedDraftIdx(newIdx);
        const next = aiDrafts[newIdx === selectedDraftIdx ? selectedDraftIdx + 1 : newIdx];
        if (next) setDiffNewId(`ai-${next.id}`);
      }
    },
    [onDismissDraft, aiDrafts, selectedDraftIdx, rightVersions],
  );

  const handleSplitMouseDown = useCallback(() => {
    splitDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!splitDragging.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const newWidth = Math.max(MIN_SPLIT_WIDTH, Math.min(MAX_SPLIT_WIDTH, e.clientX - rect.left));
      setSplitWidth(newWidth);
    }
    function onUp() {
      if (!splitDragging.current) return;
      splitDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem(SPLIT_WIDTH_KEY, String(splitWidthRef.current));
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const hasDrafts = aiDrafts.length > 0;

  const diffPaneProps: DiffPaneProps = {
    baseSnapshot: diffBaseSnapshot,
    rightVersions,
    diffNewId,
    diffViewMode,
    hunkStates: diffHunkStates,
    selectedDraftIdx,
    totalDrafts: aiDrafts.length,
    snapshotKey,
    onDiffNewIdChange: handleDiffNewIdChange,
    onDiffViewModeChange: setDiffViewMode,
    onHunkStatesChange: setDiffHunkStates,
    onResultChange: onDraftChange,
    onNavigateDraft: handleNavigateDraft,
    onDismissDraft: handleDismissDraft,
  };

  // Split mode: render dual-editor layout instead of tabs
  if (splitModeVisible && targetTicketKey) {
    return (
      <div className="flex h-full flex-col">
        <SplitModeLayout
          originalKey={ticket.key}
          originalTitle={localTitle ?? ticket.title}
          originalDraft={localDraft}
          originalAiDrafts={aiDrafts}
          originalBaseDescription={baseDescription}
          targetKey={targetTicketKey}
          targetTitle={targetLocalTitle ?? targetTicketTitle ?? targetTicketKey}
          targetDraft={targetLocalDraft ?? ""}
          targetAiDrafts={targetAiDrafts}
          onOriginalDraftChange={onDraftChange}
          onOriginalTitleChange={onTitleChange}
          onTargetDraftChange={onTargetDraftChange ?? (() => {})}
          onTargetTitleChange={onTargetTitleChange}
          onDismissOriginalDraft={onDismissDraft}
          onDismissTargetDraft={onDismissTargetDraft ?? (() => {})}
        />
      </div>
    );
  }

  const titleSlot = onTitleChange
    ? <TitleInput value={localTitle ?? ticket.title} onChange={onTitleChange} />
    : null;

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex h-[50px] items-stretch gap-1 border-b border-white/[0.06] px-5">
        <div className="flex items-stretch gap-1">
          <TabButton
            active={activeTab === "editor"}
            onClick={() => handleTabChange("editor")}
            icon={<FileText size={13} strokeWidth={1.5} />}
            label="Editor"
          />
          <TabButton
            active={activeTab === "diff"}
            onClick={() => handleTabChange("diff")}
            icon={<GitCompare size={13} strokeWidth={1.5} />}
            label="Diff"
            badge={hasDrafts && activeTab !== "diff"}
          />
          <TabButton
            active={activeTab === "history"}
            onClick={() => handleTabChange("history")}
            icon={<History size={13} strokeWidth={1.5} />}
            label="History"
          />
        </div>

        {/* Side-by-side toggle (only in Diff tab) */}
        {activeTab === "diff" && (
          <button
            type="button"
            onClick={handleDiffLayoutToggle}
            title={diffLayout === "full" ? "Switch to side-by-side view" : "Switch to full-width view"}
            className={`ml-auto flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium cursor-pointer transition-colors duration-150 ${
              diffLayout === "side-by-side"
                ? "border-white/[0.10] bg-white/[0.06] text-white/75"
                : "border-white/[0.05] bg-white/[0.02] text-white/40 hover:bg-white/[0.04] hover:text-white/60"
            }`}
          >
            <Columns2 size={13} strokeWidth={1.5} />
            Side by side
          </button>
        )}
      </div>

      {/* Editor tab */}
      {activeTab === "editor" && (
        <div className="flex-1 overflow-hidden">
          <RichEditor
            value={localDraft}
            onChange={onDraftChange}
            placeholder="Story description..."
            borderless
            slotBeforeContent={titleSlot}
          />
        </div>
      )}

      {/* Diff tab: full-width or side-by-side based on toggle */}
      {activeTab === "diff" && diffLayout === "full" && (
        <div className="flex-1 overflow-hidden">
          <DiffPane {...diffPaneProps} />
        </div>
      )}

      {activeTab === "diff" && diffLayout === "side-by-side" && (
        <div ref={splitContainerRef} className="flex flex-1 overflow-hidden">
          <div
            style={{ width: splitWidth }}
            className="flex shrink-0 flex-col overflow-hidden border-r border-white/[0.06]"
          >
            <RichEditor
              value={localDraft}
              onChange={onDraftChange}
              placeholder="Story description..."
              borderless
              slotBeforeContent={titleSlot}
            />
          </div>
          <div
            onMouseDown={handleSplitMouseDown}
            className="group flex w-1 cursor-col-resize items-center justify-center hover:bg-[var(--color-brand-500)]/20 transition-colors duration-150"
          >
            <div className="h-8 w-0.5 rounded-full bg-white/[0.08] group-hover:bg-[var(--color-brand-500)]/40 transition-colors duration-150" />
          </div>
          <div className="flex flex-1 flex-col overflow-hidden">
            <DiffPane {...diffPaneProps} />
          </div>
        </div>
      )}

      {/* History tab */}
      {activeTab === "history" && (
        <div className="flex-1 overflow-y-auto">
          <TicketHistory ticket={ticket} />
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-3.5 py-3 text-sm font-medium cursor-pointer transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
        active
          ? "text-white/90 after:absolute after:bottom-0 after:inset-x-0 after:h-0.5 after:bg-[var(--color-brand-400)] after:rounded-full"
          : "text-white/35 hover:text-white/60 active:text-white/50"
      }`}
    >
      {icon}
      {label}
      {badge && (
        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)]" />
      )}
    </button>
  );
}
