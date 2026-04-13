"use client";

import { useEffect } from "react";
import { RichEditor } from "@/components/rich-editor/RichEditor";
import { TitleInput } from "@/components/story-writer/TitleInput";
import { useWriterContext } from "../WriterContext";
import { usePaneContext } from "../PaneContext";

export function EditorApp() {
  const writer = useWriterContext();
  const pane = usePaneContext();

  const ticketKey = writer.ticketKey;
  const title = writer.session?.localTitle ?? writer.ticketData?.title ?? "";
  const contextLabel = ticketKey + (title ? ` ${title}` : "");

  useEffect(() => {
    pane.registerToolbar("editor", {
      label: "Editor",
      contextLabel,
    });
  }, [pane, contextLabel]);

  const titleSlot = (
    <TitleInput
      value={writer.session?.localTitle ?? writer.ticketData?.title ?? ""}
      onChange={writer.onTitleChange}
    />
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <RichEditor
        value={writer.session?.localDraft ?? ""}
        onChange={writer.onDraftChange}
        placeholder="Story description..."
        borderless
        slotBeforeContent={titleSlot}
      />
    </div>
  );
}
