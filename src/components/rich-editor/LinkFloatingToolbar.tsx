"use client";

import { useState, useCallback } from "react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Pencil, Unlink, ExternalLink, Copy, Check } from "lucide-react";
import type { Editor } from "@tiptap/react";
// Side-effect import to pull in EditorEvents augmentation for openLinkPopover
import "./LinkPopover";

interface LinkFloatingToolbarProps {
  editor: Editor;
}

export function LinkFloatingToolbar({ editor }: LinkFloatingToolbarProps) {
  const [copied, setCopied] = useState(false);

  const href = (editor.getAttributes("link").href as string) || "";

  const handleEdit = useCallback(() => {
    editor.emit("openLinkPopover", {});
  }, [editor]);

  const handleUnlink = useCallback(() => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
  }, [editor]);

  const handleOpen = useCallback(() => {
    if (href) window.open(href, "_blank", "noopener,noreferrer");
  }, [href]);

  const handleCopy = useCallback(() => {
    if (!href) return;
    navigator.clipboard.writeText(href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [href]);

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: ed }) => ed.isActive("link")}
      options={{ placement: "bottom-start" }}
    >
      <div className="flex items-center gap-0.5 rounded-lg border border-border-strong bg-[var(--color-surface-floating)] p-1 shadow-lg shadow-black/40">
        <ToolbarAction label="Edit link" onClick={handleEdit}>
          <Pencil size={13} strokeWidth={1.5} />
        </ToolbarAction>
        <ToolbarAction label="Unlink" onClick={handleUnlink}>
          <Unlink size={13} strokeWidth={1.5} />
        </ToolbarAction>
        <ToolbarAction label="Open in new tab" onClick={handleOpen}>
          <ExternalLink size={13} strokeWidth={1.5} />
        </ToolbarAction>
        <ToolbarAction label={copied ? "Copied" : "Copy URL"} onClick={handleCopy}>
          {copied ? (
            <Check size={13} strokeWidth={1.5} className="text-[var(--color-status-green)]" />
          ) : (
            <Copy size={13} strokeWidth={1.5} />
          )}
        </ToolbarAction>
      </div>
    </BubbleMenu>
  );
}

function ToolbarAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="cursor-pointer flex items-center justify-center rounded h-7 w-7 text-text-secondary transition-colors duration-150 hover:bg-hover-interactive hover:text-text-primary active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
    >
      {children}
    </button>
  );
}
