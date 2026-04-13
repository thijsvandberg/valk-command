"use client";

import { useEffect } from "react";
import { GitCompare } from "lucide-react";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import { Button } from "@/components/ui/Button";
import { usePaneContext } from "../PaneContext";

export function DraftPreviewApp() {
  const pane = usePaneContext();
  const { draftPreviewContent, openApp } = pane;

  const handleOpenDiff = () => {
    openApp("diff");
  };

  useEffect(() => {
    pane.registerToolbar("draft-preview", {
      label: "Draft preview",
      contextLabel: draftPreviewContent?.label,
      actions: (
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
      ),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane, draftPreviewContent?.label]);

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
