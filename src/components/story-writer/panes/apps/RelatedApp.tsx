"use client";

import { useEffect } from "react";
import { RelatedStoriesPanel } from "@/components/story-writer/RelatedStoriesPanel";
import { useWriterContext } from "../WriterContext";
import { usePaneContext } from "../PaneContext";

export function RelatedApp() {
  const writer = useWriterContext();
  const pane = usePaneContext();

  const count = writer.relatedCandidates.length;

  useEffect(() => {
    pane.registerToolbar("related", {
      label: "Related stories",
      contextLabel: count > 0 ? `${count}` : undefined,
    });
  }, [pane, count]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <RelatedStoriesPanel
        candidates={writer.relatedCandidates}
        onLink={writer.onLinkCandidate}
        onClose={() => pane.closeApp("related")}
        selectedKey={pane.relatedSelectedKey}
        onSelectedKeyChange={pane.setRelatedSelectedKey}
      />
    </div>
  );
}
