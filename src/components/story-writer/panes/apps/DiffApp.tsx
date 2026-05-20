"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { GitCompare, Eye } from "lucide-react";
import { DiffPane, type RightVersion, type StoredVersionRow, type DiffViewMode } from "@/components/story-writer/DiffPane";
import { VersionPicker } from "@/components/shared/VersionPicker";
import { Button } from "@/components/ui/Button";
import type { HunkState } from "@/components/story-diff/StoryDiff";
import { useTicketVersions } from "@/hooks/useSprintBoard";
import { useWriterContext } from "../WriterContext";
import { usePaneContext } from "../PaneContext";

export function DiffApp() {
  const writer = useWriterContext();
  const pane = usePaneContext();

  const { data: versionsData } = useTicketVersions(writer.ticketKey);

  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>("plain");
  // Explicit user selection; null means "use the auto-derived default"
  const [explicitDiffId, setExplicitDiffId] = useState<string | null>(null);
  const [diffHunkStates, setDiffHunkStates] = useState<Record<number, HunkState>>({});
  const [selectedDraftIdx, setSelectedDraftIdx] = useState(0);
  const [diffBaseSnapshot, setDiffBaseSnapshot] = useState(writer.session?.localDraft ?? "");
  const [snapshotKey, setSnapshotKey] = useState(0);
  const [baseVersionId, setBaseVersionId] = useState<string>("editor");

  const localDraftRef = useRef(writer.session?.localDraft ?? "");
  useEffect(() => { localDraftRef.current = writer.session?.localDraft ?? ""; }, [writer.session?.localDraft]);

  // When opened from chat "View diff" button, switch to diff mode for the requested draft
  const { pendingDiffDraftId } = pane;
  useEffect(() => {
    if (!pendingDiffDraftId) return;
    pane.consumePendingDiffDraftId();
    setDiffViewMode("diff");
    const versionId = `ai-${pendingDiffDraftId}`;
    setExplicitDiffId(versionId);
    setDiffHunkStates({});
    setDiffBaseSnapshot(localDraftRef.current);
    setSnapshotKey((k) => k + 1);
    const idx = writer.aiDrafts.findIndex((d) => d.id === pendingDiffDraftId);
    if (idx >= 0) setSelectedDraftIdx(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDiffDraftId]);

  const rightVersions = useMemo<RightVersion[]>(() => {
    const versions: RightVersion[] = [];
    const rawRows = Array.isArray(versionsData) ? (versionsData as unknown as StoredVersionRow[]) : [];
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
    } else if (writer.baseDescription) {
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
        group: writer.aiDrafts.length > 0 ? "AI Drafts" : undefined,
        title: `AI Draft ${draft.draftIndex + 1}`,
        author: null,
        avatarUrl: null,
        isoDate: draft.createdAt,
        tag: "ai-draft",
      });
    }
    return versions;
  }, [writer.baseDescription, writer.aiDrafts, versionsData]);

  const baseVersionOptions = useMemo<RightVersion[]>(() => [
    {
      id: "editor",
      label: "Editor",
      content: "",
      title: "Editor (current)",
      tag: "draft",
    },
    ...rightVersions,
  ], [rightVersions]);

  const effectiveBaseSnapshot = useMemo(() => {
    if (baseVersionId === "editor") return diffBaseSnapshot;
    const baseVersion = rightVersions.find((v) => v.id === baseVersionId);
    return baseVersion?.content ?? diffBaseSnapshot;
  }, [baseVersionId, rightVersions, diffBaseSnapshot]);

  const baseSelected = baseVersionOptions.find((v) => v.id === baseVersionId);
  const baseLabel = baseSelected?.label ?? "Editor";

  // Derive current diffNewId: use explicit selection or fall back to latest AI draft / first version
  const diffNewId = useMemo(() => {
    if (explicitDiffId && rightVersions.some((v) => v.id === explicitDiffId)) return explicitDiffId;
    if (rightVersions.length === 0) return "";
    const latestAi = [...rightVersions].reverse().find((v) => v.isDraft);
    return latestAi?.id ?? rightVersions[0].id;
  }, [explicitDiffId, rightVersions]);

  const handleBaseIdChange = useCallback((id: string) => {
    setBaseVersionId(id);
    setDiffHunkStates({});
    if (id === "editor") {
      setDiffBaseSnapshot(localDraftRef.current);
    }
    setSnapshotKey((k) => k + 1);
  }, []);

  const handleDiffNewIdChange = useCallback(
    (id: string) => {
      setExplicitDiffId(id);
      setDiffHunkStates({});
      setDiffBaseSnapshot(localDraftRef.current);
      setSnapshotKey((k) => k + 1);
      const idx = writer.aiDrafts.findIndex((d) => `ai-${d.id}` === id);
      if (idx >= 0) setSelectedDraftIdx(idx);
    },
    [localDraftRef, writer.aiDrafts],
  );

  const handleNavigateDraft = useCallback(
    (dir: -1 | 1) => {
      const newIdx = Math.max(0, Math.min(writer.aiDrafts.length - 1, selectedDraftIdx + dir));
      setSelectedDraftIdx(newIdx);
      const draft = writer.aiDrafts[newIdx];
      if (draft) {
        setExplicitDiffId(`ai-${draft.id}`);
        setDiffHunkStates({});
        setDiffBaseSnapshot(localDraftRef.current);
        setSnapshotKey((k) => k + 1);
      }
    },
    [selectedDraftIdx, writer.aiDrafts, localDraftRef],
  );

  const handleDismissDraft = useCallback(
    (draftDbId: string) => {
      writer.onDismissDraft(draftDbId);
      if (writer.aiDrafts.length <= 1) {
        const fallback = rightVersions.find((v) => !v.isDraft);
        setExplicitDiffId(fallback?.id ?? null);
      } else {
        const newIdx = Math.max(0, selectedDraftIdx - 1);
        setSelectedDraftIdx(newIdx);
        const next = writer.aiDrafts[newIdx === selectedDraftIdx ? selectedDraftIdx + 1 : newIdx];
        if (next) setExplicitDiffId(`ai-${next.id}`);
      }
    },
    [writer, selectedDraftIdx, rightVersions],
  );

  const selected = rightVersions.find((v) => v.id === diffNewId);

  // Register toolbar with base + target version pickers and diff/preview toggle
  useEffect(() => {
    pane.registerToolbar("diff", {
      label: "Diff",
      actions: (
        <div className="flex items-center gap-2">
          <VersionPicker
            options={baseVersionOptions}
            selectedId={baseVersionId}
            onSelect={handleBaseIdChange}
          />
          <span className="text-caption text-text-muted select-none">vs</span>
          <VersionPicker
            options={rightVersions}
            selectedId={diffNewId}
            onSelect={handleDiffNewIdChange}
          />
          {diffViewMode === "plain" ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<GitCompare size={11} strokeWidth={1.5} />}
              onClick={() => setDiffViewMode("diff")}
              title="Show diff"
              className="border-0 bg-transparent text-text-tertiary hover:text-text-secondary hover:bg-hover-list-item"
            >
              Diff
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              icon={<Eye size={11} strokeWidth={1.5} />}
              onClick={() => setDiffViewMode("plain")}
              title="Preview the selected version"
              className="border-0 bg-transparent text-text-tertiary hover:text-text-secondary hover:bg-hover-list-item"
            >
              Preview
            </Button>
          )}
        </div>
      ),
    });
    return () => pane.unregisterToolbar("diff");
  }, [pane, baseVersionOptions, baseVersionId, handleBaseIdChange, rightVersions, diffNewId, diffViewMode, handleDiffNewIdChange]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DiffPane
        baseSnapshot={effectiveBaseSnapshot}
        baseLabel={baseLabel}
        rightVersions={rightVersions}
        diffNewId={diffNewId}
        diffViewMode={diffViewMode}
        hunkStates={diffHunkStates}
        selectedDraftIdx={selectedDraftIdx}
        totalDrafts={writer.aiDrafts.length}
        snapshotKey={snapshotKey}
        onDiffNewIdChange={handleDiffNewIdChange}
        onDiffViewModeChange={setDiffViewMode}
        onHunkStatesChange={setDiffHunkStates}
        onResultChange={writer.onDraftChange}
        onNavigateDraft={handleNavigateDraft}
        onDismissDraft={handleDismissDraft}
        showHeader={false}
      />
    </div>
  );
}
