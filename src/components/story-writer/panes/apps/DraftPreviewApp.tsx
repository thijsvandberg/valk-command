"use client";

import { useEffect } from "react";
import { Check, GitCompare } from "lucide-react";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import { Button } from "@/components/ui/Button";
import { usePaneContext } from "../PaneContext";
import { useWriterContext } from "../WriterContext";

export function DraftPreviewApp() {
  const pane = usePaneContext();
  const writer = useWriterContext();
  const { draftPreviewContent, openApp } = pane;

  const handleOpenDiff = () => {
    openApp("diff");
  };

  const handleAcceptDraft = async () => {
    if (!draftPreviewContent?.draftId) return;
    await writer.onAcceptDraft(draftPreviewContent.draftId);
    pane.openApp("editor");
    pane.closeApp("draft-preview");
  };

  useEffect(() => {
    pane.registerToolbar("draft-preview", {
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
            className="border-0 bg-transparent text-white/35 hover:text-white/55 hover:bg-white/[0.04]"
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
    return () => pane.unregisterToolbar("draft-preview");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane, draftPreviewContent?.label, draftPreviewContent?.draftId]);

  if (!draftPreviewContent) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-white/20">
        No draft selected. Open a draft from the chat.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      <div className="description-content">
        {renderMarkdown(draftPreviewContent.content)}
      </div>
    </div>
  );
}
