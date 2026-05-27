"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import {
  List, ListOrdered, Code2, Link, ChevronDown, Info,
  Strikethrough, Quote, Minus, Table, ChevronRight, Smile, MoreHorizontal,
} from "lucide-react";
import type { Editor } from "@tiptap/react";
import type { CalloutType } from "./callout-extension";
import type { EditorMode } from "./RichEditor";
import { EDITOR_PALETTE } from "@/lib/status-colors";

interface ToolbarProps {
  editor: Editor | null;
  mode: EditorMode;
  beforeMore?: React.ReactNode;
  endContent?: React.ReactNode;
}

export function Toolbar({ editor, mode, beforeMore, endContent }: ToolbarProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  if (!editor || mode !== "rich") {
    if (!beforeMore && !endContent) return null;
    return (
      <div className="flex h-[42.5px] items-center justify-end gap-1 px-2">
        {beforeMore}
        {beforeMore && endContent && <div className="h-5 w-px bg-overlay-strong" />}
        {endContent}
      </div>
    );
  }

  return (
    <div className="flex flex-col" role="toolbar" aria-label="Editor formatting">
      <div className="flex h-[42.5px] items-center gap-0.5">
        <FormatButton
          editor={editor}
          action={() => editor.chain().focus().setParagraph().run()}
          active={editor.isActive("paragraph")}
          label="Paragraph"
        >
          P
        </FormatButton>

        <FormatButton
          editor={editor}
          action={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
          label="Heading 2"
        >
          H2
        </FormatButton>

        <FormatButton
          editor={editor}
          action={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive("heading", { level: 3 })}
          label="Heading 3"
        >
          H3
        </FormatButton>

        <FormatButton
          editor={editor}
          action={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
          active={editor.isActive("heading", { level: 4 })}
          label="Heading 4"
        >
          H4
        </FormatButton>

        <Divider />

        <FormatButton
          editor={editor}
          action={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          label="Bullet list"
        >
          <List size={14} strokeWidth={1.5} />
        </FormatButton>

        <FormatButton
          editor={editor}
          action={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          label="Numbered list"
        >
          <ListOrdered size={14} strokeWidth={1.5} />
        </FormatButton>

        <Divider />

        <LinkButton editor={editor} />

        <Divider />

        <CalloutDropdown editor={editor} />

        <Divider />

        {beforeMore}

        <button
          type="button"
          onClick={() => setMoreOpen(!moreOpen)}
          aria-label="More formatting options"
          aria-expanded={moreOpen}
          className={`cursor-pointer flex items-center justify-center rounded h-7 min-w-7 px-1.5 text-body transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
            moreOpen
              ? "bg-overlay-strong text-text-primary"
              : "text-text-secondary hover:bg-hover-interactive hover:text-text-primary active:scale-95"
          }`}
        >
          <MoreHorizontal size={14} strokeWidth={1.5} />
        </button>
        {endContent && <div className="ml-auto flex items-center gap-1">{endContent}</div>}
      </div>

      {moreOpen && (
        <div className="flex h-[42.5px] items-center gap-0.5 border-t border-border-default px-2">
          <FormatButton
            editor={editor}
            action={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")}
            label="Bold"
          >
            <span className="font-bold">B</span>
          </FormatButton>

          <FormatButton
            editor={editor}
            action={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive("strike")}
            label="Strikethrough"
          >
            <Strikethrough size={14} strokeWidth={1.5} />
          </FormatButton>

          <FormatButton
            editor={editor}
            action={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")}
            label="Italic"
          >
            <span className="italic">I</span>
          </FormatButton>

          <ColorButton editor={editor} />

          <Divider />

          <FormatButton
            editor={editor}
            action={() => editor.chain().focus().toggleBlockquote().run()}
            active={editor.isActive("blockquote")}
            label="Blockquote"
          >
            <Quote size={13} strokeWidth={1.5} />
          </FormatButton>

          <FormatButton
            editor={editor}
            action={() => editor.chain().focus().toggleCodeBlock().run()}
            active={editor.isActive("codeBlock")}
            label="Code block"
          >
            <Code2 size={14} strokeWidth={1.5} />
          </FormatButton>

          <FormatButton
            editor={editor}
            action={() => editor.chain().focus().setHorizontalRule().run()}
            active={false}
            label="Horizontal rule"
          >
            <Minus size={14} strokeWidth={1.5} />
          </FormatButton>

          <TableButton editor={editor} />

          <Divider />

          <ExpandButton editor={editor} />

          <EmojiButton editor={editor} />
        </div>
      )}
    </div>
  );
}

function FormatButton({
  editor,
  action,
  active,
  label,
  children,
}: {
  editor: Editor;
  action: () => void;
  active: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={action}
      aria-label={label}
      aria-pressed={active}
      className={`cursor-pointer flex items-center justify-center rounded h-7 min-w-7 px-1.5 text-body transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
        active
          ? "bg-overlay-strong text-text-primary"
          : "text-text-secondary hover:bg-hover-interactive hover:text-text-primary active:scale-95"
      }`}
    >
      {children}
    </button>
  );
}

function LinkButton({ editor }: { editor: Editor }) {
  const handleLink = useCallback(() => {
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL", previousUrl || "https://");

    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    try {
      const parsed = new URL(url);
      if (!["http:", "https:", "mailto:"].includes(parsed.protocol)) return;
    } catch {
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  return (
    <FormatButton
      editor={editor}
      action={handleLink}
      active={editor.isActive("link")}
      label="Insert link"
    >
      <Link size={14} strokeWidth={1.5} />
    </FormatButton>
  );
}

function TableButton({ editor }: { editor: Editor }) {
  const insertTable = useCallback(() => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  return (
    <FormatButton
      editor={editor}
      action={insertTable}
      active={editor.isActive("table")}
      label="Insert table"
    >
      <Table size={13} strokeWidth={1.5} />
    </FormatButton>
  );
}

const TEXT_COLORS = EDITOR_PALETTE.text;

function ColorButton({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const setColor = useCallback(
    (color: string) => {
      editor.chain().focus().setColor(color).run();
      setOpen(false);
    },
    [editor]
  );

  const clearColor = useCallback(() => {
    editor.chain().focus().unsetColor().run();
    setOpen(false);
  }, [editor]);

  const currentColor = editor.getAttributes("textStyle").color as string | undefined;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Text color"
        aria-expanded={open}
        className={`cursor-pointer flex items-center gap-0.5 rounded h-7 min-w-7 px-1.5 text-body transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
          open ? "bg-overlay-strong text-text-primary" : "text-text-secondary hover:bg-hover-interactive hover:text-text-primary"
        }`}
      >
        <span className="font-bold text-sm" style={{ color: currentColor ?? "currentColor" }}>A</span>
        <ChevronDown size={8} strokeWidth={1.5} className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-36 rounded-lg border border-border-strong bg-[var(--color-surface-floating)] p-2 shadow-lg shadow-black/40">
          <div className="mb-2 grid grid-cols-4 gap-1">
            {TEXT_COLORS.map((c) => (
              <button
                key={c.color}
                type="button"
                onClick={() => setColor(c.color)}
                title={c.label}
                className="h-6 w-6 cursor-pointer rounded transition-opacity hover:opacity-80 active:scale-90"
                style={{ backgroundColor: c.color }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={clearColor}
            className="cursor-pointer w-full rounded px-2 py-1 text-label text-text-tertiary transition-colors hover:bg-hover-interactive hover:text-text-secondary"
          >
            Remove color
          </button>
        </div>
      )}
    </div>
  );
}

const CALLOUT_OPTIONS = EDITOR_PALETTE.callout as readonly { type: CalloutType; label: string; color: string }[];

function CalloutDropdown({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const insertCallout = useCallback(
    (type: CalloutType) => {
      editor.chain().focus().setCallout({ type }).run();
      setOpen(false);
    },
    [editor]
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Insert callout"
        aria-expanded={open}
        className={`cursor-pointer flex items-center gap-1 rounded h-7 min-w-7 px-1.5 text-body transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
          open ? "bg-overlay-strong text-text-primary" : "text-text-secondary hover:bg-hover-interactive hover:text-text-primary active:scale-95"
        }`}
      >
        <Info size={14} strokeWidth={1.5} />
        <ChevronDown size={8} strokeWidth={1.5} className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-40 rounded-lg border border-border-strong bg-[var(--color-surface-floating)] py-1 shadow-lg shadow-black/40">
          {CALLOUT_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              type="button"
              onClick={() => insertCallout(opt.type)}
              className="cursor-pointer flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-text-secondary transition-colors duration-150 hover:bg-hover-interactive hover:text-text-primary"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: opt.color }} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ExpandButton({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("Details");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    // Focus the input after the dropdown renders
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open]);

  const insert = useCallback(() => {
    editor.chain().focus().setExpand({ title: title.trim() || "Details" }).run();
    setOpen(false);
    setTitle("Details");
  }, [editor, title]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Insert expandable section"
        aria-expanded={open}
        className={`cursor-pointer flex items-center justify-center rounded h-7 min-w-7 px-1.5 text-body transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
          open || editor.isActive("expand")
            ? "bg-overlay-strong text-text-primary"
            : "text-text-secondary hover:bg-hover-interactive hover:text-text-primary active:scale-95"
        }`}
      >
        <ChevronRight size={14} strokeWidth={1.5} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-lg border border-border-strong bg-[var(--color-surface-floating)] p-3 shadow-lg shadow-black/40">
          <label className="mb-1.5 block text-label font-medium uppercase tracking-wider text-text-tertiary">
            Section title
          </label>
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") insert();
              if (e.key === "Escape") setOpen(false);
            }}
            className="mb-2.5 w-full rounded border border-border-strong bg-overlay-default px-2.5 py-1.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-[var(--color-brand-500)]/50 focus:bg-overlay-default"
            placeholder="Details"
          />
          <button
            type="button"
            onClick={insert}
            className="cursor-pointer w-full rounded bg-overlay-strong px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-overlay-strong hover:text-text-primary active:scale-[0.98]"
          >
            Insert
          </button>
        </div>
      )}
    </div>
  );
}

// Common emoji palette for quick insertion
const COMMON_EMOJIS = [
  // Row 1: status
  { emoji: "✅", shortname: ":check_mark:" },
  { emoji: "❌", shortname: ":cross_mark:" },
  { emoji: "⚠️", shortname: ":warning:" },
  { emoji: "❓", shortname: ":question_mark:" },
  { emoji: "ℹ️", shortname: ":info:" },
  { emoji: "🔴", shortname: ":red_circle:" },
  { emoji: "🟢", shortname: ":large_green_circle:" },
  { emoji: "🟡", shortname: ":large_yellow_circle:" },
  { emoji: "🔵", shortname: ":large_blue_circle:" },
  // Row 2: faces & hands
  { emoji: "👍", shortname: ":thumbsup:" },
  { emoji: "👎", shortname: ":thumbsdown:" },
  { emoji: "👌", shortname: ":ok_hand:" },
  { emoji: "😃", shortname: ":smiley:" },
  { emoji: "😛", shortname: ":stuck_out_tongue:" },
  { emoji: "😟", shortname: ":worried:" },
  { emoji: "🙄", shortname: ":rolling_eyes:" },
  { emoji: "🤔", shortname: ":thinking:" },
  { emoji: "😎", shortname: ":sunglasses:" },
  // Row 3: objects
  { emoji: "⭐", shortname: ":star:" },
  { emoji: "🔥", shortname: ":fire:" },
  { emoji: "🚀", shortname: ":rocket:" },
  { emoji: "🎉", shortname: ":tada:" },
  { emoji: "💡", shortname: ":bulb:" },
  { emoji: "📝", shortname: ":memo:" },
  { emoji: "🔧", shortname: ":wrench:" },
  { emoji: "🐛", shortname: ":bug:" },
  { emoji: "🏆", shortname: ":trophy:" },
];

function EmojiButton({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const insertEmoji = useCallback(
    (emoji: string) => {
      editor.chain().focus().insertContent(emoji).run();
      setOpen(false);
    },
    [editor]
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Insert emoji"
        aria-expanded={open}
        className={`cursor-pointer flex items-center justify-center rounded h-7 min-w-7 px-1.5 text-body transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
          open ? "bg-overlay-strong text-text-primary" : "text-text-secondary hover:bg-hover-interactive hover:text-text-primary active:scale-95"
        }`}
      >
        <Smile size={14} strokeWidth={1.5} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-border-strong bg-[var(--color-surface-floating)] p-2 shadow-lg shadow-black/40">
          <div className="grid grid-cols-9 gap-0.5">
            {COMMON_EMOJIS.map(({ emoji, shortname }) => (
              <button
                key={shortname}
                type="button"
                onClick={() => insertEmoji(emoji)}
                title={shortname}
                className="cursor-pointer flex h-7 w-7 items-center justify-center rounded text-base transition-colors hover:bg-overlay-strong active:scale-90"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-overlay-strong" />;
}
