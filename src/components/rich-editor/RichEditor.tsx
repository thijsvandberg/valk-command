"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { expandEmojiShortcodes } from "@/lib/emoji-shortcodes";
import { Toolbar } from "./Toolbar";

const STORAGE_KEY = "rich-editor-mode";

type EditorMode = "rich" | "markdown";

interface RichEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  onSave?: () => void;
  placeholder?: string;
  className?: string;
  minHeight?: number;
  /** Removes card wrapper (border, bg, radius) so the editor fills its container */
  borderless?: boolean;
  /** Extra buttons rendered in the toolbar bar, before the mode toggle */
  actions?: React.ReactNode;
  /** Makes the toolbar bar sticky so it stays visible when the page scrolls */
  stickyToolbar?: boolean;
  /** Breaks the toolbar out to the full width of the nearest CSS container, with buttons centered at max-w-4xl */
  fullWidthToolbar?: boolean;
}

function markdownToEditorHtml(markdown: string): string {
  return calloutMarkdownToHtml(expandEmojiShortcodes(markdown));
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

  // Normalize hard break markers line by line.
  // Inside blockquotes (lines starting with '>'), preserve trailing '  ' (two-space) and
  // trailing '\' hard-break markers so tiptap-markdown re-creates hardBreak nodes on the
  // next load — without them the soft enter is lost on round-trip.
  // Outside blockquotes, strip them to match ADF hardBreak conversion behavior.
  const normalized = withCallouts
    .replace(/<br\s*\/?>/gi, "\n")
    .split("\n")
    .map((line) => {
      if (line.startsWith(">")) return line;
      return line.replace(/  $/, "").replace(/\\$/, "");
    })
    .join("\n");

  return normalized
    // tiptap-markdown escapes [ and ] in plain text to prevent link ambiguity.
    // We never use markdown link syntax (links are ADF marks), so these escapes
    // accumulate each round-trip through the HTML-wrapped paragraph path.
    .replace(/\\+([\[\]])/g, "$1");
}

export function RichEditor({
  value,
  onChange,
  onSave,
  placeholder = "Start writing...",
  className = "",
  minHeight = 200,
  borderless = false,
  actions,
  stickyToolbar = false,
  fullWidthToolbar = false,
}: RichEditorProps) {
  const [mode, setMode] = useState<EditorMode>(getInitialMode);
  const suppressRef = useRef(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (fullWidthToolbar && stickyToolbar) {
      setPortalTarget(document.getElementById("ticket-toolbar-portal"));
    }
  }, [fullWidthToolbar, stickyToolbar]);
  // Stable ref so the TipTap keydown handler never needs to be re-registered
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

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
    content: markdownToEditorHtml(value),
    editorProps: {
      attributes: {
        class: "rich-editor-content",
        style: `min-height: ${minHeight}px`,
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          onSaveRef.current?.();
          return true;
        }
        return false;
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
    editor.commands.setContent(markdownToEditorHtml(value));
    suppressRef.current = false;
  }, [value, editor]);

  const handleModeToggle = useCallback(
    (newMode: EditorMode) => {
      if (newMode === mode) return;

      if (newMode === "rich" && editor) {
        suppressRef.current = true;
        editor.commands.setContent(markdownToEditorHtml(value));
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
    : fullWidthToolbar
      ? `rich-editor-root ${className}`
      : `rich-editor-root rounded-lg border border-white/[0.08] bg-[var(--color-surface-elevated)] ${stickyToolbar ? "" : "overflow-hidden"} ${className}`;

  const toolbarWrapperClasses = stickyToolbar
    ? `sticky top-0 z-10 border-b border-white/[0.06] bg-[var(--color-surface-elevated)]${fullWidthToolbar ? "" : " rounded-t-lg"}`
    : "border-b border-white/[0.06]";

  const toolbarContent = (
    <Toolbar
      editor={editor}
      mode={mode}
      beforeMore={<ModeToggle mode={mode} onToggle={handleModeToggle} />}
      endContent={actions ?? undefined}
    />
  );

  // When fullWidthToolbar + stickyToolbar, portal the toolbar outside the overflow-clipped
  // scroll container so it can visually span the full viewport width including the sidebar.
  const isPortaled = fullWidthToolbar && stickyToolbar && !!portalTarget;

  const toolbarEl = (
    <div className={isPortaled ? "border-b border-white/[0.06] bg-[var(--color-surface-elevated)]" : toolbarWrapperClasses}>
      {fullWidthToolbar ? (
        <div className="mx-auto max-w-4xl px-8">{toolbarContent}</div>
      ) : toolbarContent}
    </div>
  );

  return (
    <div className={rootClasses}>
      {isPortaled ? createPortal(toolbarEl, portalTarget!) : toolbarEl}

      {mode === "rich" ? (
        <EditorContent
          editor={editor}
          className={`rich-editor-wrapper ${borderless ? "flex-1 overflow-y-auto" : ""} ${fullWidthToolbar ? "rich-editor-wrapper--no-x-pad" : ""}`}
        />
      ) : (
        <textarea
          value={value}
          onChange={handleMarkdownChange}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              onSave?.();
            }
          }}
          placeholder={placeholder}
          className={`w-full bg-transparent ${fullWidthToolbar ? "py-3" : "px-4 py-3"} font-mono text-sm text-white/90 placeholder:text-white/25 focus:outline-none ${borderless ? "flex-1 resize-none" : "resize-y"}`}
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
  const isRich = mode === "rich";
  return (
    <button
      type="button"
      onClick={() => onToggle(isRich ? "markdown" : "rich")}
      className="cursor-pointer shrink-0 flex items-center rounded h-7 px-2.5 text-xs font-medium text-white/30 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white/60 active:scale-95"
    >
      {isRich ? "Markdown" : "Rich Text"}
    </button>
  );
}

export type { RichEditorProps, EditorMode };
