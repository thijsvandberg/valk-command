"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  FileText, GitCompare,
  History, Columns2,
} from "lucide-react";
import { RichEditor } from "@/components/rich-editor/RichEditor";
import type { HunkState } from "@/components/story-diff/StoryDiff";
import { TicketHistory } from "@/components/ticket-detail/TicketHistory";
import { useTicketVersions } from "@/hooks/useSprintBoard";
import type { StoryWriterDraftRow } from "@/db/schema";
import type { Ticket } from "@/types/ticket";
import { TitleInput } from "@/components/story-writer/TitleInput";
import { DiffPane, type DiffPaneProps, type RightVersion, type StoredVersionRow, type DiffViewMode } from "@/components/story-writer/DiffPane";
import { SplitModeLayout } from "@/components/story-writer/SplitModeLayout";
import { TabButton } from "@/components/story-writer/TabButton";

export type EditorTab = "editor" | "diff" | "history";
type DiffLayout = "full" | "side-by-side";

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
const DEFAULT_SPLIT_WIDTH = 420;
const MIN_SPLIT_WIDTH = 240;
const MAX_SPLIT_WIDTH = 900;

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

    const rawRows = Array.isArray(versionsData) ? (versionsData as StoredVersionRow[]) : [];
    const sortedRows = [...rawRows].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    if (sortedRows.length > 0) {
      const total = sortedRows.length;
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

      {activeTab === "history" && (
        <div className="flex-1 overflow-y-auto">
          <TicketHistory ticket={ticket} />
        </div>
      )}
    </div>
  );
}
