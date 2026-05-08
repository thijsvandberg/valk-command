"use client";

import { useEffect } from "react";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import { useWriterContext } from "../WriterContext";
import { usePaneContext } from "../PaneContext";

export function StoryPreviewApp() {
  const writer = useWriterContext();
  const pane = usePaneContext();

  const title = writer.session?.localTitle ?? writer.ticketData?.title ?? "";
  const content = writer.session?.localDraft ?? "";

  useEffect(() => {
    pane.registerToolbar("story-preview", {
      label: "Story preview",
    });
    return () => pane.unregisterToolbar("story-preview");
  }, [pane]);

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      {title && (
        <h1 className="mb-4 font-[var(--font-display)] text-lg font-semibold text-text-primary tracking-tight">
          {title}
        </h1>
      )}
      <div className="description-content">
        {content ? renderMarkdown(content) : (
          <p className="text-xs text-text-muted">No content yet.</p>
        )}
      </div>
    </div>
  );
}
