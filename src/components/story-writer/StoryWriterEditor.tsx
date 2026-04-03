"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  FileText, GitCompare, Trash2,
  ChevronLeft, ChevronRight, History, Eye, Columns2,
} from "lucide-react";
import { RichEditor } from "@/components/rich-editor/RichEditor";
import { StoryDiff, type HunkState } from "@/components/story-diff/StoryDiff";
import { TicketHistory } from "@/components/ticket-detail/TicketHistory";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import type { StoryWriterDraftRow } from "@/db/schema";
import type { Ticket } from "@/types/ticket";

type EditorTab = "editor" | "diff" | "split" | "history";
type DiffViewMode = "diff" | "plain";

interface RightVersion {
  id: string;
  label: string;
  content: string;
  isDraft?: boolean;
  draftDbId?: string;
}

interface StoryWriterEditorProps {
  localDraft: string;
  baseDescription: string;
  aiDrafts: StoryWriterDraftRow[];
  ticket: Ticket;
  onDraftChange: (content: string) => void;
  onDismissDraft: (draftId: string) => void;
  activeDraftId?: string | null;
}

const SPLIT_WIDTH_KEY = "storyWriterSplitWidth";
const DEFAULT_SPLIT_WIDTH = 420;
const MIN_SPLIT_WIDTH = 240;
const MAX_SPLIT_WIDTH = 900;

// ---------------------------------------------------------------------------
// DiffPane: version selector + AI navigator + StoryDiff (or plain preview)
// Shared between the standalone Diff tab and the right side of the Split tab.
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

  return (
    <div className="flex h-full flex-col">
      {/* Top bar: comparison label + version picker + view toggle */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
        <span className="shrink-0 text-xs text-white/30">Your draft</span>
        <span className="text-white/20">↔</span>

        <select
          value={diffNewId}
          onChange={(e) => onDiffNewIdChange(e.target.value)}
          className="min-w-0 rounded-md bg-[var(--color-surface-floating)] px-2 py-1 text-xs text-white/70 border border-white/[0.08] focus:border-[var(--color-brand-500)]/40 focus:outline-none cursor-pointer"
        >
          {rightVersions.map((v) => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => onDiffViewModeChange("plain")}
            title="Preview the selected version"
            className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium cursor-pointer transition-colors duration-150 ${
              diffViewMode === "plain"
                ? "bg-white/[0.08] text-white/70"
                : "text-white/35 hover:text-white/55 hover:bg-white/[0.04]"
            }`}
          >
            <Eye size={11} strokeWidth={1.5} />
            Preview
          </button>
          <button
            type="button"
            onClick={() => onDiffViewModeChange("diff")}
            title="Show diff"
            className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium cursor-pointer transition-colors duration-150 ${
              diffViewMode === "diff"
                ? "bg-white/[0.08] text-white/70"
                : "text-white/35 hover:text-white/55 hover:bg-white/[0.04]"
            }`}
          >
            <GitCompare size={11} strokeWidth={1.5} />
            Diff
          </button>
        </div>
      </div>

      {/* AI draft navigator (only when an AI draft is selected) */}
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
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-xs text-white/25">
            {rightVersions.length === 0 ? "No versions to compare" : "Select a version"}
          </div>
        ) : diffViewMode === "plain" ? (
          <div className="rounded-lg border border-white/[0.06] bg-[var(--color-surface-elevated)] p-5">
            {renderMarkdown(selected.content)}
          </div>
        ) : (
          <StoryDiff
            key={`${diffNewId}-${snapshotKey}`}
            oldText={baseSnapshot}
            newText={selected.content}
            oldLabel="Your draft"
            newLabel={selected.label}
            interactive
            pendingIsOld
            onResultChange={onResultChange}
            hunkStates={hunkStates}
            onHunkStatesChange={onHunkStatesChange}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function StoryWriterEditor({
  localDraft,
  baseDescription,
  aiDrafts,
  ticket,
  onDraftChange,
  onDismissDraft,
  activeDraftId,
}: StoryWriterEditorProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>("editor");
  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>("diff");
  const [diffNewId, setDiffNewId] = useState("");
  const [diffHunkStates, setDiffHunkStates] = useState<Record<number, HunkState>>({});
  const [selectedDraftIdx, setSelectedDraftIdx] = useState(0);

  // Snapshot of localDraft captured when entering comparison mode or changing target.
  // The diff always compares this snapshot (left) vs the selected version (right).
  // localDraft is patched in the background as hunks are accepted, but the diff stays stable.
  const [diffBaseSnapshot, setDiffBaseSnapshot] = useState(localDraft);
  const [snapshotKey, setSnapshotKey] = useState(0);

  // Split pane resize
  const [splitWidth, setSplitWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_SPLIT_WIDTH;
    const s = localStorage.getItem(SPLIT_WIDTH_KEY);
    return s
      ? Math.max(MIN_SPLIT_WIDTH, Math.min(MAX_SPLIT_WIDTH, parseInt(s, 10)))
      : DEFAULT_SPLIT_WIDTH;
  });
  const splitDragging = useRef(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);

  // Right-side version list: Jira + AI drafts (never "local" — that's always the left/base)
  const rightVersions = useMemo<RightVersion[]>(() => {
    const versions: RightVersion[] = [];
    if (baseDescription) {
      versions.push({ id: "jira", label: "Jira version", content: baseDescription });
    }
    for (const draft of aiDrafts) {
      versions.push({
        id: `ai-${draft.id}`,
        label: `AI Draft ${draft.draftIndex + 1}`,
        content: draft.content,
        isDraft: true,
        draftDbId: draft.id,
      });
    }
    return versions;
  }, [baseDescription, aiDrafts]);

  // Default diffNewId to latest AI draft (or Jira)
  useEffect(() => {
    if (!diffNewId && rightVersions.length > 0) {
      const latestAi = [...rightVersions].reverse().find((v) => v.isDraft);
      setDiffNewId(latestAi?.id ?? rightVersions[0].id);
    }
  }, [rightVersions, diffNewId]);

  // External navigation from chat badge: jump to that AI draft in diff tab
  if (activeDraftId) {
    const versionId = `ai-${activeDraftId}`;
    if (diffNewId !== versionId || (activeTab !== "diff" && activeTab !== "split")) {
      setDiffNewId(versionId);
      if (activeTab !== "diff" && activeTab !== "split") setActiveTab("diff");
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
      // Snapshot the draft when entering a comparison tab from a non-comparison tab
      if (
        (tab === "diff" || tab === "split") &&
        activeTab !== "diff" &&
        activeTab !== "split"
      ) {
        setDiffBaseSnapshot(localDraft);
        setSnapshotKey((k) => k + 1);
        setDiffHunkStates({});
      }
      setActiveTab(tab);
    },
    [activeTab, localDraft],
  );

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
      // If dismissed draft was selected, try to move to previous
      if (aiDrafts.length <= 1) {
        setDiffNewId(baseDescription ? "jira" : "");
      } else {
        const newIdx = Math.max(0, selectedDraftIdx - 1);
        setSelectedDraftIdx(newIdx);
        const next = aiDrafts[newIdx === selectedDraftIdx ? selectedDraftIdx + 1 : newIdx];
        if (next) setDiffNewId(`ai-${next.id}`);
      }
    },
    [onDismissDraft, aiDrafts, selectedDraftIdx, baseDescription],
  );

  // Split pane drag resize
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
      localStorage.setItem(SPLIT_WIDTH_KEY, String(splitWidth));
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [splitWidth]);

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

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-white/[0.06] px-4 py-2">
        <TabButton
          active={activeTab === "editor"}
          onClick={() => handleTabChange("editor")}
          icon={<FileText size={14} strokeWidth={1.5} />}
          label="Editor"
        />
        <TabButton
          active={activeTab === "diff"}
          onClick={() => handleTabChange("diff")}
          icon={<GitCompare size={14} strokeWidth={1.5} />}
          label="Diff"
          badge={hasDrafts && activeTab !== "diff"}
        />
        <TabButton
          active={activeTab === "split"}
          onClick={() => handleTabChange("split")}
          icon={<Columns2 size={14} strokeWidth={1.5} />}
          label="Split"
          badge={hasDrafts && activeTab !== "split"}
        />
        <TabButton
          active={activeTab === "history"}
          onClick={() => handleTabChange("history")}
          icon={<History size={14} strokeWidth={1.5} />}
          label="History"
        />
      </div>

      {/* Editor tab */}
      {activeTab === "editor" && (
        <div className="flex-1 overflow-hidden">
          <RichEditor
            value={localDraft}
            onChange={onDraftChange}
            placeholder="Story description..."
            borderless
          />
        </div>
      )}

      {/* Diff tab (full width) */}
      {activeTab === "diff" && (
        <div className="flex-1 overflow-hidden">
          <DiffPane {...diffPaneProps} />
        </div>
      )}

      {/* Split tab (editor left, diff right) */}
      {activeTab === "split" && (
        <div ref={splitContainerRef} className="flex flex-1 overflow-hidden">
          {/* Editor — left */}
          <div
            style={{ width: splitWidth }}
            className="flex shrink-0 flex-col overflow-hidden border-r border-white/[0.06]"
          >
            <RichEditor
              value={localDraft}
              onChange={onDraftChange}
              placeholder="Story description..."
              borderless
            />
          </div>

          {/* Resize handle */}
          <div
            onMouseDown={handleSplitMouseDown}
            className="group flex w-1 cursor-col-resize items-center justify-center hover:bg-[var(--color-brand-500)]/20 transition-colors duration-150"
          >
            <div className="h-8 w-0.5 rounded-full bg-white/[0.08] group-hover:bg-[var(--color-brand-500)]/40 transition-colors duration-150" />
          </div>

          {/* Diff — right */}
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
      className={`relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium cursor-pointer transition-colors duration-150 ${
        active ? "bg-white/[0.08] text-white/80" : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
      }`}
    >
      {icon}
      {label}
      {badge && (
        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)]" />
      )}
    </button>
  );
}
