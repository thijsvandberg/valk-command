"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table";
import { TableHeader } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table";
import { Markdown } from "tiptap-markdown";
import { CalloutExtension } from "./callout-extension";
import { ExpandExtension } from "./expand-extension";
import { calloutMarkdownToHtml, htmlToCalloutMarkdown } from "./callout-markdown";
import { Toolbar } from "./Toolbar";

const STORAGE_KEY = "rich-editor-mode";

type EditorMode = "rich" | "markdown";

interface RichEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: number;
  /** Removes card wrapper (border, bg, radius) so the editor fills its container */
  borderless?: boolean;
}

function getInitialMode(): EditorMode {
  if (typeof window === "undefined") return "rich";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "rich" || stored === "markdown") return stored;
  return "rich";
}

function getEditorMarkdown(editor: ReturnType<typeof useEditor>): string {
  if (!editor) return "";
  const raw = (editor.storage as unknown as Record<string, { getMarkdown?: () => string }>).markdown?.getMarkdown?.() ?? "";
  const withCallouts = htmlToCalloutMarkdown(raw);
  // Normalize hard breaks to single newlines, matching ADF hardBreak conversion behavior.
  // tiptap-markdown serializes Shift+Enter as "  \n" or "<br>" depending on context.
  return withCallouts
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\\\n/g, "\n");
}

export function RichEditor({
  value,
  onChange,
  placeholder = "Start writing...",
  className = "",
  minHeight = 200,
  borderless = false,
}: RichEditorProps) {
  const [mode, setMode] = useState<EditorMode>(getInitialMode);
  const suppressRef = useRef(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        codeBlock: { HTMLAttributes: { class: "editor-code-block" } },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "editor-link" },
      }),
      Image.configure({
        allowBase64: false,
        HTMLAttributes: { class: "editor-image" },
      }),
      TextStyle,
      Color,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Markdown.configure({
        html: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
      CalloutExtension,
      ExpandExtension,
    ],
    content: calloutMarkdownToHtml(value),
    editorProps: {
      attributes: {
        class: "rich-editor-content",
        style: `min-height: ${minHeight}px`,
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (suppressRef.current) return;
      onChange(getEditorMarkdown(ed));
    },
  });

  // Sync external value prop into the TipTap editor
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const current = getEditorMarkdown(editor);
    if (current === value) return;
    suppressRef.current = true;
    editor.commands.setContent(calloutMarkdownToHtml(value));
    suppressRef.current = false;
  }, [value, editor]);

  const handleModeToggle = useCallback(
    (newMode: EditorMode) => {
      if (newMode === mode) return;

      if (newMode === "rich" && editor) {
        suppressRef.current = true;
        editor.commands.setContent(calloutMarkdownToHtml(value));
        suppressRef.current = false;
      }

      setMode(newMode);
      localStorage.setItem(STORAGE_KEY, newMode);
    },
    [mode, editor, value]
  );

  const handleMarkdownChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  const rootClasses = borderless
    ? `rich-editor-root flex h-full flex-col overflow-hidden ${className}`
    : `rich-editor-root rounded-lg border border-white/[0.08] bg-[var(--color-surface-elevated)] overflow-hidden ${className}`;

  return (
    <div className={rootClasses}>
      <div className="flex items-center justify-between border-b border-white/[0.06] px-1 py-1">
        <Toolbar editor={editor} mode={mode} />
        <ModeToggle mode={mode} onToggle={handleModeToggle} />
      </div>

      {mode === "rich" ? (
        <EditorContent
          editor={editor}
          className={`rich-editor-wrapper ${borderless ? "flex-1 overflow-y-auto" : ""}`}
        />
      ) : (
        <textarea
          value={value}
          onChange={handleMarkdownChange}
          placeholder={placeholder}
          className={`w-full bg-transparent px-4 py-3 font-mono text-sm text-white/90 placeholder:text-white/25 focus:outline-none ${borderless ? "flex-1 resize-none" : "resize-y"}`}
          style={borderless ? undefined : { minHeight: `${minHeight}px` }}
          spellCheck={false}
        />
      )}
    </div>
  );
}

function ModeToggle({
  mode,
  onToggle,
}: {
  mode: EditorMode;
  onToggle: (mode: EditorMode) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md bg-white/[0.04] p-0.5">
      <button
        type="button"
        onClick={() => onToggle("rich")}
        className={`cursor-pointer rounded px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
          mode === "rich"
            ? "bg-[var(--color-brand-600)] text-white shadow-sm shadow-[var(--color-brand-900)]/40"
            : "text-white/40 hover:text-white/70"
        }`}
      >
        Rich Text
      </button>
      <button
        type="button"
        onClick={() => onToggle("markdown")}
        className={`cursor-pointer rounded px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
          mode === "markdown"
            ? "bg-[var(--color-brand-600)] text-white shadow-sm shadow-[var(--color-brand-900)]/40"
            : "text-white/40 hover:text-white/70"
        }`}
      >
        Markdown
      </button>
    </div>
  );
}

export type { RichEditorProps, EditorMode };
