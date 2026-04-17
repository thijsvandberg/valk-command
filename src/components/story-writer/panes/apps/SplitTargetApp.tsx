"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { GitCompare, Eye } from "lucide-react";
import { RichEditor } from "@/components/rich-editor/RichEditor";
import { TitleInput } from "@/components/story-writer/TitleInput";
import { DiffPane, type RightVersion, type DiffViewMode } from "@/components/story-writer/DiffPane";
import { Button } from "@/components/ui/Button";
import type { HunkState } from "@/components/story-diff/StoryDiff";
import { useWriterContext } from "../WriterContext";
import { usePaneContext } from "../PaneContext";

export function SplitTargetApp() {
  const writer = useWriterContext();
  const pane = usePaneContext();
  const { registerToolbar, unregisterToolbar } = pane;

  const [viewMode, setViewMode] = useState<"editor" | "diff">("editor");
  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>("plain");
  const [hunkStates, setHunkStates] = useState<Record<number, HunkState>>({});
  const [selectedDraftIdx, setSelectedDraftIdx] = useState(0);
  const [diffBaseSnapshot, setDiffBaseSnapshot] = useState(
    writer.session?.targetLocalDraft ?? "",
  );
  const [snapshotKey, setSnapshotKey] = useState(0);

  const targetDraft = writer.session?.targetLocalDraft ?? "";
  const targetTitle =
    writer.session?.targetLocalTitle ??
    writer.targetTicketTitle ??
    writer.targetTicketKey ??
    "";

  const localDraftRef = useRef(targetDraft);
  useEffect(() => {
    localDraftRef.current = targetDraft;
  }, [targetDraft]);

  const rightVersions = useMemo<RightVersion[]>(() => {
    return writer.targetAiDrafts.map((draft) => ({
      id: `ai-${draft.id}`,
      label: `AI Draft ${draft.draftIndex + 1}`,
      content: draft.content,
      isDraft: true,
      draftDbId: draft.id,
      group: "AI Drafts",
      title: `AI Draft ${draft.draftIndex + 1}`,
      author: null,
      avatarUrl: null,
      isoDate: draft.createdAt,
      tag: "ai-draft" as const,
    }));
  }, [writer.targetAiDrafts]);

  const diffNewId = useMemo(() => {
    const latestAi = [...rightVersions].reverse().find((v) => v.isDraft);
    return latestAi?.id ?? (rightVersions[0]?.id ?? "");
  }, [rightVersions]);

  const handleDiffNewIdChange = useCallback(
    (id: string) => {
      setHunkStates({});
      setDiffBaseSnapshot(localDraftRef.current);
      setSnapshotKey((k) => k + 1);
      const idx = writer.targetAiDrafts.findIndex((d) => `ai-${d.id}` === id);
      if (idx >= 0) setSelectedDraftIdx(idx);
    },
    [writer.targetAiDrafts],
  );

  const handleNavigateDraft = useCallback(
    (dir: -1 | 1) => {
      const newIdx = Math.max(
        0,
        Math.min(writer.targetAiDrafts.length - 1, selectedDraftIdx + dir),
      );
      setSelectedDraftIdx(newIdx);
      const draft = writer.targetAiDrafts[newIdx];
      if (draft) {
        setHunkStates({});
        setDiffBaseSnapshot(localDraftRef.current);
        setSnapshotKey((k) => k + 1);
      }
    },
    [selectedDraftIdx, writer.targetAiDrafts],
  );

  const contextLabel = writer.targetTicketKey ?? "";

  useEffect(() => {
    registerToolbar("split-target", {
      label: "Split target",
      contextLabel,
      actions: (
        <div className="flex items-center gap-2">
          {viewMode === "editor" ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<GitCompare size={11} strokeWidth={1.5} />}
              onClick={() => setViewMode("diff")}
              title="Show diff"
              className="border-0 bg-transparent text-white/35 hover:text-white/55 hover:bg-hover-list-item"
            >
              Diff
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              icon={<Eye size={11} strokeWidth={1.5} />}
              onClick={() => setViewMode("editor")}
              title="Show editor"
              className="border-0 bg-transparent text-white/35 hover:text-white/55 hover:bg-hover-list-item"
            >
              Editor
            </Button>
          )}
        </div>
      ),
    });
    return () => unregisterToolbar("split-target");
  }, [registerToolbar, unregisterToolbar, contextLabel, viewMode]);

  if (!writer.targetTicketKey) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-white/25">
        No split target selected
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {viewMode === "editor" ? (
        <RichEditor
          value={targetDraft}
          onChange={writer.onTargetDraftChange}
          placeholder="Story description..."
          borderless
          slotBeforeContent={
            <TitleInput value={targetTitle} onChange={writer.onTargetTitleChange} />
          }
        />
      ) : rightVersions.length > 0 ? (
        <DiffPane
          baseSnapshot={diffBaseSnapshot}
          rightVersions={rightVersions}
          diffNewId={diffNewId}
          diffViewMode={diffViewMode}
          hunkStates={hunkStates}
          selectedDraftIdx={selectedDraftIdx}
          totalDrafts={writer.targetAiDrafts.length}
          snapshotKey={snapshotKey}
          onDiffNewIdChange={handleDiffNewIdChange}
          onDiffViewModeChange={setDiffViewMode}
          onHunkStatesChange={setHunkStates}
          onResultChange={writer.onTargetDraftChange}
          onNavigateDraft={handleNavigateDraft}
          onDismissDraft={writer.onDismissDraft}
          showHeader={false}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-white/25">
          No AI drafts yet for this story
        </div>
      )}
    </div>
  );
}
