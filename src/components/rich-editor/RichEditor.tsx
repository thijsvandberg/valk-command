"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import { LinkFloatingToolbar } from "./LinkFloatingToolbar";
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
import { SelectionDecorationExtension } from "./selection-decoration";
import { calloutMarkdownToHtml, htmlToCalloutMarkdown } from "./callout-markdown";
import { expandEmojiShortcodes } from "@/lib/emoji-shortcodes";
import { Toolbar } from "./Toolbar";
import { Tooltip } from "@/components/shared/Tooltip";
import { SlashCommandExtension } from "./slash-commands/slash-command-extension";
import { SlashCommandMenu } from "./slash-commands/SlashCommandMenu";

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
  /** Rendered inside the scroll container, above the editor content */
  slotBeforeContent?: React.ReactNode;
  /** Hides the formatting toolbar entirely */
  hideToolbar?: boolean;
  /** Constrains the scroll content to max-w-4xl, centered — matches draft preview and ticket single view */
  contentMaxWidth?: boolean;
  /** Id of the element the full-width toolbar portals into. Override when more
   * than one editor renders on the same page (e.g. the ticket side panel) so the
   * toolbar lands in its own surface instead of the first match in the document. */
  toolbarPortalId?: string;
}

// Exported for testing only. Normalizes markdown delimiter edge cases before
// passing to TipTap so that markdown-it reliably closes bold/italic spans.
export function normalizeMarkdownForEditor(markdown: string): string {
  // Bold (**):
  //   1. `**word:**` (original ADF form): colon is inside the closing **, which some
  //      parsers treat as an ambiguous right-flanking delimiter → move colon outside.
  //   2. `**word****:**` (corrupted DB form): colon wrapped in its own **:**. Strip → colon.
  //
  // Italic (*):
  //   3. `*word:*` (Jira wiki / tiptap-markdown round-trip): colon inside closing *.
  //   4. `*word*:*` (tiptap-markdown round-trip artifact): orphan * after italic+colon.
  //   5. `*:*` (stray italic colon): reduce to bare colon.
  //
  // Apply in order: specific multi-token patterns first, then simple ones, to avoid
  // the *:* simplification consuming the trailing *:* inside a *word*:* pattern.
  // Lookbehind/lookahead guards prevent matching inside ***bold+italic*** spans.
  return markdown
    .replace(/\*\*:\*\*/g, ":")
    .replace(/(?<!\*)\*([^*\n]+)\*:\*(?!\*)/g, "*$1*:")
    .replace(/(?<!\*)\*:\*(?!\*)/g, ":")
    .replace(/\*\*([^*\n]+):\*\*/g, "**$1**:")
    .replace(/(?<!\*)\*([^*\n]+):\*(?!\*)/g, "*$1*:");
}

// Exported for testing only — the markdown -> editor-HTML load path.
export function markdownToEditorHtml(markdown: string): string {
  return calloutMarkdownToHtml(expandEmojiShortcodes(normalizeMarkdownForEditor(markdown)));
}

// The production extension set, shared by the live editor and the round-trip test so the
// two never drift. No prop dependencies (keyboard/save handling lives in editorProps).
export function buildEditorExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      codeBlock: { HTMLAttributes: { class: "editor-code-block" } },
    }),
    LinkExtension.extend({
      addKeyboardShortcuts() {
        return {
          "Mod-k": () => {
            this.editor.emit("openLinkPopover", {});
            return true;
          },
        };
      },
    }).configure({
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
    SelectionDecorationExtension,
    SlashCommandExtension,
  ];
}

function getInitialMode(): EditorMode {
  if (typeof window === "undefined") return "rich";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "rich" || stored === "markdown") return stored;
  return "rich";
}

// Exported for testing only — the editor -> markdown serialize path.
export function getEditorMarkdown(editor: ReturnType<typeof useEditor>): string {
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
    .replace(/\\+([\[\]])/g, "$1")
    // tiptap-markdown HTML-encodes < and > in text nodes (escapeHTML in its
    // text serializer). Unescape so stored markdown contains raw characters.
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
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
  slotBeforeContent,
  hideToolbar = false,
  contentMaxWidth = false,
  toolbarPortalId = "ticket-toolbar-portal",
}: RichEditorProps) {
  const [mode, setMode] = useState<EditorMode>(getInitialMode);
  const suppressRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const portalTarget = fullWidthToolbar && stickyToolbar && typeof document !== "undefined"
    ? document.getElementById(toolbarPortalId)
    : null;
  // Stable ref so the TipTap keydown handler never needs to be re-registered
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: buildEditorExtensions(),
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

  // Auto-resize textarea to fit content on mount and value changes
  useEffect(() => {
    if (mode !== "markdown" || !textareaRef.current) return;
    const el = textareaRef.current;
    el.style.height = "auto";
    if (borderless) {
      // Fill at least the full visible container, expand beyond for long content
      const containerHeight = el.parentElement?.clientHeight ?? 0;
      el.style.height = `${Math.max(containerHeight, el.scrollHeight)}px`;
    } else {
      el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
    }
  }, [value, mode, borderless, minHeight]);

  const rootClasses = borderless
    ? `rich-editor-root flex h-full flex-col overflow-hidden ${className}`
    : fullWidthToolbar
      ? `rich-editor-root ${className}`
      : `rich-editor-root rounded-lg border border-border-strong bg-[var(--color-surface-elevated)] ${stickyToolbar ? "" : "overflow-hidden"} ${className}`;

  const toolbarWrapperClasses = stickyToolbar
    ? `sticky top-0 z-10 border-b border-border-default bg-[var(--color-surface-elevated)]${fullWidthToolbar ? "" : " rounded-t-lg"}`
    : `border-b border-border-default bg-[var(--color-surface-elevated)]${borderless ? " px-2" : ""}`;

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
    <div className={isPortaled ? "border-b border-border-default bg-[var(--color-surface-elevated)]" : toolbarWrapperClasses}>
      {fullWidthToolbar ? (
        // A portaled toolbar spans the full viewport, so its controls are
        // centered to max-w-4xl. Inline, the controls must instead line up with
        // the editor body, which mirrors the contentMaxWidth wrapper below and
        // carries no horizontal padding.
        isPortaled ? (
          <div className="mx-auto max-w-4xl px-8">{toolbarContent}</div>
        ) : (
          <div className={contentMaxWidth ? "mx-auto w-full max-w-4xl" : ""}>{toolbarContent}</div>
        )
      ) : toolbarContent}
    </div>
  );

  return (
    <div className={rootClasses}>
      <SlashCommandMenu editor={editor} />
      {editor && <LinkFloatingToolbar editor={editor} />}
      {!hideToolbar && (isPortaled ? createPortal(toolbarEl, portalTarget!) : toolbarEl)}

      <div className={borderless ? "flex-1 overflow-y-auto" : ""}>
        <div className={contentMaxWidth ? "mx-auto w-full max-w-4xl" : ""}>
          {slotBeforeContent}
          {mode === "rich" ? (
            <EditorContent
              editor={editor}
              className={`rich-editor-wrapper ${borderless ? "rich-editor-wrapper--borderless" : ""} ${fullWidthToolbar ? "rich-editor-wrapper--no-x-pad" : ""}`}
            />
          ) : (
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleMarkdownChange}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  onSave?.();
                }
              }}
              placeholder={placeholder}
              className={`w-full bg-transparent ${fullWidthToolbar ? "py-3" : "px-4 py-3"} font-mono text-body-lg text-text-primary placeholder:text-text-muted focus:outline-none ${borderless ? "min-h-full resize-none" : "resize-y"}`}
              style={borderless ? undefined : { minHeight: `${minHeight}px` }}
              spellCheck={false}
            />
          )}
        </div>
      </div>
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
    <Tooltip content={isRich ? "Edit raw Markdown source" : "Switch to rich text editing"}>
      <button
        type="button"
        onClick={() => onToggle(isRich ? "markdown" : "rich")}
        className="cursor-pointer shrink-0 flex items-center rounded h-7 px-2.5 text-body-sm font-medium text-text-tertiary transition-colors duration-150 hover:bg-hover-interactive hover:text-text-secondary active:scale-95"
      >
        {isRich ? "Markdown" : "Rich Text"}
      </button>
    </Tooltip>
  );
}

export type { RichEditorProps, EditorMode };
