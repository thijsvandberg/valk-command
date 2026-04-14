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

function stripLeadingH1(markdown: string): string {
  return markdown.replace(/^#\s+[^\n]*\n*/, "");
}

export function EditorApp() {
  const writer = useWriterContext();
  const pane = usePaneContext();
  const { registerToolbar, unregisterToolbar } = pane;

  const [viewMode, setViewMode] = useState<"editor" | "diff">("editor");
  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>("plain");
  const [hunkStates, setHunkStates] = useState<Record<number, HunkState>>({});
  const [selectedDraftIdx, setSelectedDraftIdx] = useState(0);
  const [diffBaseSnapshot, setDiffBaseSnapshot] = useState(
    writer.session?.localDraft ?? "",
  );
  const [snapshotKey, setSnapshotKey] = useState(0);

  const localDraftRef = useRef(writer.session?.localDraft ?? "");
  useEffect(() => {
    localDraftRef.current = writer.session?.localDraft ?? "";
  }, [writer.session?.localDraft]);

  const rightVersions = useMemo<RightVersion[]>(() => {
    const versions: RightVersion[] = [];
    if (writer.baseDescription) {
      versions.push({
        id: "jira",
        label: "Jira version",
        content: writer.baseDescription,
        title: "Jira version",
        tag: "current",
      });
    }
    for (const draft of writer.aiDrafts) {
      versions.push({
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
        tag: "ai-draft",
      });
    }
    return versions;
  }, [writer.baseDescription, writer.aiDrafts]);

  const diffNewId = useMemo(() => {
    const latestAi = [...rightVersions].reverse().find((v) => v.isDraft);
    return latestAi?.id ?? (rightVersions[0]?.id ?? "");
  }, [rightVersions]);

  const handleDiffNewIdChange = useCallback(
    (id: string) => {
      setHunkStates({});
      setDiffBaseSnapshot(localDraftRef.current);
      setSnapshotKey((k) => k + 1);
      const idx = writer.aiDrafts.findIndex((d) => `ai-${d.id}` === id);
      if (idx >= 0) setSelectedDraftIdx(idx);
    },
    [writer.aiDrafts],
  );

  const handleNavigateDraft = useCallback(
    (dir: -1 | 1) => {
      const newIdx = Math.max(
        0,
        Math.min(writer.aiDrafts.length - 1, selectedDraftIdx + dir),
      );
      setSelectedDraftIdx(newIdx);
      const draft = writer.aiDrafts[newIdx];
      if (draft) {
        setHunkStates({});
        setDiffBaseSnapshot(localDraftRef.current);
        setSnapshotKey((k) => k + 1);
      }
    },
    [selectedDraftIdx, writer.aiDrafts],
  );

  const inSplitMode = writer.splitModeVisible && !!writer.targetTicketKey;

  // viewMode is only meaningful in split mode; outside of it we always show the editor
  const activeViewMode = inSplitMode ? viewMode : "editor";

  useEffect(() => {
    registerToolbar("editor", {
      label: "Editor",
      actions: inSplitMode ? (
        <div className="flex items-center gap-2">
          {activeViewMode === "editor" ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<GitCompare size={11} strokeWidth={1.5} />}
              onClick={() => setViewMode("diff")}
              title="Show diff"
              className="border-0 bg-transparent text-white/35 hover:text-white/55 hover:bg-white/[0.04]"
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
              className="border-0 bg-transparent text-white/35 hover:text-white/55 hover:bg-white/[0.04]"
            >
              Editor
            </Button>
          )}
        </div>
      ) : undefined,
    });
    return () => unregisterToolbar("editor");
  }, [registerToolbar, unregisterToolbar, activeViewMode, inSplitMode]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {activeViewMode === "editor" ? (
        <RichEditor
          value={stripLeadingH1(writer.session?.localDraft ?? "")}
          onChange={writer.onDraftChange}
          placeholder="Story description..."
          borderless
          slotBeforeContent={
            <TitleInput
              value={writer.session?.localTitle ?? writer.ticketData?.title ?? ""}
              onChange={writer.onTitleChange}
            />
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
          totalDrafts={writer.aiDrafts.length}
          snapshotKey={snapshotKey}
          onDiffNewIdChange={handleDiffNewIdChange}
          onDiffViewModeChange={setDiffViewMode}
          onHunkStatesChange={setHunkStates}
          onResultChange={writer.onDraftChange}
          onNavigateDraft={handleNavigateDraft}
          onDismissDraft={writer.onDismissDraft}
          showHeader={false}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-white/25">
          No AI drafts yet
        </div>
      )}
    </div>
  );
}
