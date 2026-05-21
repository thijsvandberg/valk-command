"use client";

import { useEffect } from "react";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import { useWriterContext } from "../WriterContext";
import { usePaneContext } from "../PaneContext";

export function StoryPreviewApp() {
  const writer = useWriterContext();
  const pane = usePaneContext();
  const { registerToolbar, unregisterToolbar } = pane;

  const title = writer.session?.localTitle ?? writer.ticketData?.title ?? "";
  const content = writer.session?.localDraft ?? "";

  useEffect(() => {
    registerToolbar("story-preview", {
      label: "Story preview",
    });
    return () => unregisterToolbar("story-preview");
  }, [registerToolbar, unregisterToolbar]);

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
