"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { PanelLeftClose, PanelRightClose } from "lucide-react";
import { RichEditor } from "@/components/rich-editor/RichEditor";
import type { HunkState } from "@/components/story-diff/StoryDiff";
import type { StoryWriterDraftRow } from "@/db/schema";
import { TitleInput } from "@/components/story-writer/TitleInput";
import { DiffPane, type RightVersion, type DiffViewMode } from "@/components/story-writer/DiffPane";
import { SplitPaneHeader } from "@/components/story-writer/SplitPaneHeader";

const SPLIT_MODE_WIDTH_KEY = "storyWriterSplitModeWidth";
const DEFAULT_SPLIT_WIDTH = 420;
const MIN_SPLIT_WIDTH = 240;
const MAX_SPLIT_WIDTH = 900;

type CollapsedPane = null | "original" | "target";

export interface SplitPaneDiffState {
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

export function SplitModeLayout({
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
  const splitModeWidthRef = useRef(splitModeWidth);
  useEffect(() => { splitModeWidthRef.current = splitModeWidth; }, [splitModeWidth]);

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

  const resolvedOrigDiffNewId = origDiffState.diffNewId
    || (([...originalRightVersions].reverse().find((v) => v.isDraft) || originalRightVersions[0])?.id || "");
  const resolvedTargetDiffNewId = targetDiffState.diffNewId
    || (([...targetRightVersions].reverse().find((v) => v.isDraft) || targetRightVersions[0])?.id || "");

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
      if (pane === "original") {
        setTargetDiffState((s) => ({ ...s, baseSnapshot: targetDraft, snapshotKey: s.snapshotKey + 1 }));
      } else {
        setOrigDiffState((s) => ({ ...s, baseSnapshot: originalDraft, snapshotKey: s.snapshotKey + 1 }));
      }
      return pane;
    });
  }, [originalDraft, targetDraft]);

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

  return (
    <div ref={splitModeContainerRef} className="flex h-full flex-col overflow-hidden">
      <div className="flex h-full">
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

        <div
          onMouseDown={handleSplitModeMouseDown}
          className="group flex w-1 cursor-col-resize items-center justify-center hover:bg-[var(--color-brand-500)]/20 transition-colors duration-150"
        >
          <div className="h-8 w-0.5 rounded-full bg-white/[0.08] group-hover:bg-[var(--color-brand-500)]/40 transition-colors duration-150" />
        </div>

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
