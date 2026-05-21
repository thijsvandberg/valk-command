"use client";

import { useEffect } from "react";
import { RelatedStoriesPanel } from "@/components/story-writer/RelatedStoriesPanel";
import { useWriterContext } from "../WriterContext";
import { usePaneContext } from "../PaneContext";

export function RelatedApp() {
  const writer = useWriterContext();
  const pane = usePaneContext();
  const { registerToolbar, unregisterToolbar } = pane;

  const count = writer.relatedCandidates.length;
  const linkedCount = writer.relatedCandidates.filter((c) => c.isLinked).length;

  useEffect(() => {
    const parts: string[] = [];
    if (count > 0) parts.push(`${count}`);
    if (linkedCount > 0) parts.push(`${linkedCount} linked`);
    registerToolbar("related", {
      label: "Related stories",
      contextLabel: parts.length > 0 ? parts.join(" · ") : undefined,
    });
    return () => unregisterToolbar("related");
  }, [registerToolbar, unregisterToolbar, count, linkedCount]);

  const handleFindRelated = async () => {
    await writer.onSend("Find related stories", "find-related");
  };

  const handlePrefillFindRelated = () => {
    pane.prefillChat("Find related stories");
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <RelatedStoriesPanel
        candidates={writer.relatedCandidates}
        onLink={writer.onLinkCandidate}
        onClose={() => pane.closeApp("related")}
        selectedKey={pane.relatedSelectedKey}
        onSelectedKeyChange={pane.setRelatedSelectedKey}
        onFindRelated={handleFindRelated}
        onPrefillFindRelated={handlePrefillFindRelated}
      />
    </div>
  );
}
