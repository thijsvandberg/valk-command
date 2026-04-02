"use client";

import { useState } from "react";
import { GitMerge, Check, X } from "lucide-react";
import { StoryDiff } from "@/components/story-diff/StoryDiff";

interface MergeBarProps {
  localDraft: string;
  remoteDraft: string;
  onAcceptRemote: () => void;
  onKeepLocal: () => void;
  onMergeResult: (merged: string) => void;
}

export function MergeBar({
  localDraft,
  remoteDraft,
  onAcceptRemote,
  onKeepLocal,
  onMergeResult,
}: MergeBarProps) {
  const [showDiff, setShowDiff] = useState(false);

  if (showDiff) {
    return (
      <div className="flex flex-col border-t border-amber-500/20 bg-amber-500/[0.03]">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
          <span className="text-xs font-medium text-amber-400">Merge drafts</span>
          <button
            onClick={() => setShowDiff(false)}
            className="rounded-md px-2 py-1 text-[11px] text-white/40 hover:text-white/60 hover:bg-white/[0.04] cursor-pointer transition-colors duration-150"
          >
            Close
          </button>
        </div>
        <div className="max-h-[400px] overflow-y-auto p-4">
          <StoryDiff
            oldText={localDraft}
            newText={remoteDraft}
            oldLabel="Your draft"
            newLabel="Workspace suggestion"
            interactive
            onResultChange={onMergeResult}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 border-t border-amber-500/20 bg-amber-500/[0.03] px-4 py-2.5">
      <GitMerge size={14} strokeWidth={1.5} className="shrink-0 text-amber-400" />
      <span className="flex-1 text-xs text-amber-300/80">
        New draft from workspace available
      </span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={onAcceptRemote}
          className="flex items-center gap-1 rounded-md bg-[var(--color-brand-600)]/20 px-2.5 py-1 text-[11px] font-medium text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/20 cursor-pointer hover:bg-[var(--color-brand-600)]/30 active:scale-95 transition-transform duration-150"
        >
          <Check size={11} strokeWidth={2} />
          Accept remote
        </button>
        <button
          onClick={onKeepLocal}
          className="flex items-center gap-1 rounded-md bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/50 border border-white/[0.06] cursor-pointer hover:bg-white/[0.06] active:scale-95 transition-transform duration-150"
        >
          <X size={11} strokeWidth={2} />
          Keep mine
        </button>
        <button
          onClick={() => setShowDiff(true)}
          className="flex items-center gap-1 rounded-md bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/50 border border-white/[0.06] cursor-pointer hover:bg-white/[0.06] active:scale-95 transition-transform duration-150"
        >
          <GitMerge size={11} strokeWidth={2} />
          View diff
        </button>
      </div>
    </div>
  );
}
