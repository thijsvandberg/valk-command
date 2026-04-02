"use client";

import { useState, useCallback, useMemo } from "react";
import {
  FileText, GitCompare, Check, Trash2,
  ChevronLeft, ChevronRight, History, Eye,
} from "lucide-react";
import { RichEditor } from "@/components/rich-editor/RichEditor";
import { StoryDiff, type HunkState } from "@/components/story-diff/StoryDiff";
import { TicketHistory } from "@/components/ticket-detail/TicketHistory";
import type { StoryWriterDraftRow } from "@/db/schema";
import type { Ticket } from "@/types/ticket";

type EditorTab = "editor" | "diff" | "history";
type DiffViewMode = "diff" | "plain";

interface DiffVersion {
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
  onAcceptDraft: (draftId: string) => void;
  onDismissDraft: (draftId: string) => void;
  onMergeResult: (content: string) => void;
  activeDraftId?: string | null;
}

function renderPlainMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="mt-4 mb-1 text-sm font-semibold text-white/80">{line.slice(4)}</h3>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="mt-5 mb-1 text-base font-semibold text-white/85">{line.slice(3)}</h2>);
    } else if (line.startsWith("- ")) {
      elements.push(<li key={i} className="ml-4 list-disc text-sm text-white/60 leading-[1.7]">{line.slice(2)}</li>);
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(<p key={i} className="text-sm leading-[1.7] text-white/60">{line}</p>);
    }
  }
  return elements;
}

export function StoryWriterEditor({
  localDraft,
  baseDescription,
  aiDrafts,
  ticket,
  onDraftChange,
  onAcceptDraft,
  onDismissDraft,
  onMergeResult,
  activeDraftId,
}: StoryWriterEditorProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>("editor");

  // Unified diff state
  const [diffOldId, setDiffOldId] = useState("jira");
  const [diffNewId, setDiffNewId] = useState("local");
  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>("diff");
  const [mergeResultText, setMergeResultText] = useState<string | null>(null);
  const [mergeHunkStates, setMergeHunkStates] = useState<Record<number, HunkState>>({});

  // AI draft navigator
  const [selectedDraftIdx, setSelectedDraftIdx] = useState(0);

  const hasDrafts = aiDrafts.length > 0;

  // Build version list for selectors (Jira + local + all AI drafts)
  const diffVersions: DiffVersion[] = useMemo(() => {
    const versions: DiffVersion[] = [];
    if (baseDescription) {
      versions.push({ id: "jira", label: "Jira version", content: baseDescription });
    }
    versions.push({ id: "local", label: "Your draft", content: localDraft });
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
  }, [baseDescription, localDraft, aiDrafts]);

  const diffOldVersion = diffVersions.find((v) => v.id === diffOldId);
  const diffNewVersion = diffVersions.find((v) => v.id === diffNewId);

  // The version currently shown on the "new" side, if it's an AI draft
  const activeNewDraft = diffNewVersion?.isDraft ? diffNewVersion : null;

  // External navigation from chat badge: jump to that AI draft in diff tab
  if (activeDraftId) {
    const versionId = `ai-${activeDraftId}`;
    if (diffNewId !== versionId || activeTab !== "diff") {
      setDiffNewId(versionId);
      setDiffOldId("local");
      setActiveTab("diff");
      setDiffViewMode("plain");
      setMergeResultText(null);
      setMergeHunkStates({});
      // Also sync the draft navigator
      const idx = aiDrafts.findIndex((d) => d.id === activeDraftId);
      if (idx >= 0) setSelectedDraftIdx(idx);
    }
  }

  const handleApplyMerge = useCallback(() => {
    if (mergeResultText !== null) {
      onMergeResult(mergeResultText);
      setMergeResultText(null);
      setMergeHunkStates({});
    }
  }, [mergeResultText, onMergeResult]);

  // Navigate AI drafts via prev/next (updates the diff selector)
  const navigateDraft = useCallback((direction: -1 | 1) => {
    const newIdx = Math.max(0, Math.min(aiDrafts.length - 1, selectedDraftIdx + direction));
    setSelectedDraftIdx(newIdx);
    const draft = aiDrafts[newIdx];
    if (draft) {
      setDiffNewId(`ai-${draft.id}`);
      setMergeResultText(null);
      setMergeHunkStates({});
    }
  }, [selectedDraftIdx, aiDrafts]);

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-white/[0.06] px-4 py-2.5">
        <TabButton active={activeTab === "editor"} onClick={() => setActiveTab("editor")}
          icon={<FileText size={15} strokeWidth={1.5} />} label="Editor" />
        <TabButton active={activeTab === "diff"} onClick={() => setActiveTab("diff")}
          icon={<GitCompare size={15} strokeWidth={1.5} />} label="Diff" badge={hasDrafts} />
        <TabButton active={activeTab === "history"} onClick={() => setActiveTab("history")}
          icon={<History size={15} strokeWidth={1.5} />} label="History" />
      </div>

      {/* Content */}
      {activeTab === "editor" ? (
        <div className="flex-1 overflow-hidden">
          <RichEditor
            value={localDraft}
            onChange={onDraftChange}
            placeholder="Story description..."
            borderless
          />
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto">

        {/* ---- Diff tab (merged with AI Drafts) ---- */}
        {activeTab === "diff" && (
          <div className="flex h-full flex-col">
            {/* Top bar: view mode + version selectors */}
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-2">
              {/* View mode toggle */}
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setDiffViewMode("plain")}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium border cursor-pointer active:scale-95 transition-transform duration-150 ${
                    diffViewMode === "plain"
                      ? "bg-white/[0.08] text-white/70 border-white/[0.10]"
                      : "bg-white/[0.03] text-white/40 border-white/[0.06] hover:bg-white/[0.06]"
                  }`}>
                  <Eye size={11} strokeWidth={2} />
                  View draft
                </button>
                <button type="button" onClick={() => setDiffViewMode("diff")}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium border cursor-pointer active:scale-95 transition-transform duration-150 ${
                    diffViewMode === "diff"
                      ? "bg-white/[0.08] text-white/70 border-white/[0.10]"
                      : "bg-white/[0.03] text-white/40 border-white/[0.06] hover:bg-white/[0.06]"
                  }`}>
                  <GitCompare size={11} strokeWidth={2} />
                  View diff
                </button>
              </div>

              <div className="h-4 w-px bg-white/[0.08]" />

              {/* Version selectors */}
              <div className="flex items-center gap-2 text-xs">
                <VersionSelect versions={diffVersions} value={diffOldId} excludeId={diffNewId}
                  onChange={(id) => { setDiffOldId(id); setMergeResultText(null); setMergeHunkStates({}); }} />
                <span className="text-white/30">vs</span>
                <VersionSelect versions={diffVersions} value={diffNewId} excludeId={diffOldId}
                  onChange={(id) => {
                    setDiffNewId(id); setMergeResultText(null);
                    const idx = aiDrafts.findIndex((d) => `ai-${d.id}` === id);
                    if (idx >= 0) setSelectedDraftIdx(idx);
                  }} />
              </div>

              {/* Apply merge (when editing) */}
              {mergeResultText !== null && (
                <>
                  <div className="h-4 w-px bg-white/[0.08]" />
                  <button type="button" onClick={handleApplyMerge}
                    className="flex items-center gap-1 rounded-md bg-[var(--color-brand-600)]/20 px-2.5 py-1 text-[11px] font-medium text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/20 cursor-pointer hover:bg-[var(--color-brand-600)]/30 active:scale-95 transition-transform duration-150">
                    <Check size={11} strokeWidth={2} />
                    Apply merge
                  </button>
                </>
              )}
            </div>

            {/* AI draft navigator bar (only when an AI draft is selected) */}
            {activeNewDraft && hasDrafts && (
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-1.5 bg-white/[0.015]">
                <div className="flex items-center gap-2">
                  <button type="button" disabled={selectedDraftIdx === 0}
                    onClick={() => navigateDraft(-1)}
                    className="flex h-6 w-6 items-center justify-center rounded text-white/40 cursor-pointer hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150">
                    <ChevronLeft size={14} strokeWidth={1.5} />
                  </button>
                  <span className="text-xs font-medium text-white/50">
                    Draft {selectedDraftIdx + 1} of {aiDrafts.length}
                  </span>
                  <button type="button" disabled={selectedDraftIdx === aiDrafts.length - 1}
                    onClick={() => navigateDraft(1)}
                    className="flex h-6 w-6 items-center justify-center rounded text-white/40 cursor-pointer hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150">
                    <ChevronRight size={14} strokeWidth={1.5} />
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => { if (activeNewDraft.draftDbId) onAcceptDraft(activeNewDraft.draftDbId); }}
                    className="flex items-center gap-1 rounded-md bg-[var(--color-brand-600)]/20 px-2.5 py-1 text-[11px] font-medium text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/20 cursor-pointer hover:bg-[var(--color-brand-600)]/30 active:scale-95 transition-transform duration-150">
                    <Check size={11} strokeWidth={2} />
                    Accept
                  </button>
                  <button type="button" onClick={() => {
                      if (!activeNewDraft.draftDbId) return;
                      onDismissDraft(activeNewDraft.draftDbId);
                      // Navigate to previous or fall back to local
                      if (aiDrafts.length <= 1) {
                        setDiffNewId("local");
                      } else {
                        const newIdx = Math.max(0, selectedDraftIdx - 1);
                        setSelectedDraftIdx(newIdx);
                        const next = aiDrafts[newIdx === selectedDraftIdx ? selectedDraftIdx + 1 : newIdx];
                        if (next) setDiffNewId(`ai-${next.id}`);
                        else setDiffNewId("local");
                      }
                    }}
                    className="flex items-center gap-1 rounded-md bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/40 border border-white/[0.06] cursor-pointer hover:text-red-400/70 hover:bg-red-500/[0.06] active:scale-95 transition-transform duration-150">
                    <Trash2 size={11} strokeWidth={2} />
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Diff / plain content */}
            <div className="flex-1 overflow-y-auto p-4">
              {diffOldVersion && diffNewVersion && diffOldId !== diffNewId ? (
                diffViewMode === "plain" ? (
                  <div className="rounded-lg border border-white/[0.06] bg-[var(--color-surface-elevated)] p-5">
                    {renderPlainMarkdown(diffNewVersion.content)}
                  </div>
                ) : (
                  <StoryDiff
                    key={`${diffOldId}-${diffNewId}`}
                    oldText={diffOldVersion.content}
                    newText={diffNewVersion.content}
                    oldLabel={diffOldVersion.label}
                    newLabel={diffNewVersion.label}
                    interactive
                    onResultChange={setMergeResultText}
                    hunkStates={mergeHunkStates}
                    onHunkStatesChange={setMergeHunkStates}
                  />
                )
              ) : (
                <div className="py-8 text-center text-xs text-white/25">
                  {diffVersions.length < 2
                    ? "Not enough versions to compare"
                    : "Select two different versions to compare"}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---- History tab: reuses TicketHistory from ticket detail ---- */}
        {activeTab === "history" && (
          <TicketHistory ticket={ticket} />
        )}
      </div>
      )}
    </div>
  );
}

function VersionSelect({ versions, value, excludeId, onChange }: {
  versions: DiffVersion[]; value: string; excludeId?: string; onChange: (id: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="rounded-md bg-[var(--color-surface-floating)] px-2.5 py-1 text-xs text-white/70 border border-white/[0.08] focus:border-[var(--color-brand-500)]/40 focus:outline-none cursor-pointer transition-colors duration-150">
      {versions
        .filter((v) => v.id !== excludeId)
        .map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
    </select>
  );
}

function TabButton({ active, onClick, icon, label, badge }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: boolean;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium cursor-pointer transition-colors duration-150 ${
        active ? "bg-white/[0.08] text-white/80" : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
      }`}>
      {icon}
      {label}
      {badge && !active && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)]" />}
    </button>
  );
}
