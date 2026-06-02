"use client";

import { useEffect, useCallback } from "react";
import { Check, GitCompare } from "lucide-react";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import { Button } from "@/components/ui/Button";
import { usePaneContext } from "../PaneContext";
import { useWriterContext } from "../WriterContext";

export function DraftPreviewApp() {
  const pane = usePaneContext();
  const writer = useWriterContext();
  const { draftPreviewContent, openApp, closeApp, registerToolbar, unregisterToolbar } = pane;
  const { onAcceptDraft } = writer;

  const handleOpenDiff = useCallback(() => {
    openApp("diff");
  }, [openApp]);

  const handleAcceptDraft = useCallback(async () => {
    if (!draftPreviewContent?.draftId) return;
    await onAcceptDraft(draftPreviewContent.draftId);
    openApp("editor");
    closeApp("draft-preview");
  }, [draftPreviewContent, onAcceptDraft, openApp, closeApp]);

  useEffect(() => {
    registerToolbar("draft-preview", {
      label: "Draft preview",
      contextLabel: draftPreviewContent?.label,
      actions: (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            icon={<GitCompare size={11} strokeWidth={1.5} />}
            onClick={handleOpenDiff}
            title="Open in Diff view"
            className="border-0 bg-transparent text-text-tertiary hover:text-text-secondary hover:bg-hover-list-item"
          >
            Open in Diff
          </Button>
          {draftPreviewContent?.draftId && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Check size={11} strokeWidth={2} />}
              onClick={handleAcceptDraft}
              title="Accept this draft into the editor"
              className="border-0 bg-transparent text-[var(--color-brand-400)]/60 hover:text-[var(--color-brand-400)] hover:bg-[var(--color-brand-500)]/[0.08]"
            >
              Accept
            </Button>
          )}
        </div>
      ),
    });
    return () => unregisterToolbar("draft-preview");
  }, [registerToolbar, unregisterToolbar, draftPreviewContent, handleOpenDiff, handleAcceptDraft]);

  if (!draftPreviewContent) {
    return (
      <div className="flex h-full items-center justify-center text-body-sm text-text-muted">
        No draft selected. Open a draft from the chat.
      </div>
    );
  }

  const isFocused = pane.paneCount === 1;

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      <div className={`description-content ${isFocused ? "mx-auto w-full max-w-4xl" : ""}`}>
        {renderMarkdown(draftPreviewContent.content, { linkifyRefs: true })}
      </div>
    </div>
  );
}
