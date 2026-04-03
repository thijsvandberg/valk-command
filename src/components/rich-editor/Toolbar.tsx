"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import {
  List, ListOrdered, Code2, Link, ChevronDown, Info,
  Strikethrough, Quote, Minus, Table, ChevronRight, Smile,
} from "lucide-react";
import type { Editor } from "@tiptap/react";
import type { CalloutType } from "./callout-extension";
import type { EditorMode } from "./RichEditor";

interface ToolbarProps {
  editor: Editor | null;
  mode: EditorMode;
}

export function Toolbar({ editor, mode }: ToolbarProps) {
  if (!editor || mode !== "rich") return null;

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-0.5" role="toolbar" aria-label="Editor formatting">
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
        action={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        label="Italic"
      >
        <span className="italic">I</span>
      </FormatButton>

      <FormatButton
        editor={editor}
        action={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive("strike")}
        label="Strikethrough"
      >
        <Strikethrough size={14} strokeWidth={1.5} />
      </FormatButton>

      <ColorButton editor={editor} />

      <Divider />

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
        <List size={16} strokeWidth={1.5} />
      </FormatButton>

      <FormatButton
        editor={editor}
        action={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        label="Numbered list"
      >
        <ListOrdered size={16} strokeWidth={1.5} />
      </FormatButton>

      <Divider />

      <FormatButton
        editor={editor}
        action={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive("blockquote")}
        label="Blockquote"
      >
        <Quote size={15} strokeWidth={1.5} />
      </FormatButton>

      <FormatButton
        editor={editor}
        action={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive("codeBlock")}
        label="Code block"
      >
        <Code2 size={16} strokeWidth={1.5} />
      </FormatButton>

      <FormatButton
        editor={editor}
        action={() => editor.chain().focus().setHorizontalRule().run()}
        active={false}
        label="Horizontal rule"
      >
        <Minus size={16} strokeWidth={1.5} />
      </FormatButton>

      <LinkButton editor={editor} />

      <TableButton editor={editor} />

      <Divider />

      <CalloutDropdown editor={editor} />

      <ExpandButton editor={editor} />

      <EmojiButton editor={editor} />
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
      className={`cursor-pointer flex items-center justify-center rounded px-2 py-2 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
        active
          ? "bg-white/[0.1] text-white"
          : "text-white/50 hover:bg-white/[0.06] hover:text-white/80 active:scale-95"
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
      <Link size={16} strokeWidth={1.5} />
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
      <Table size={15} strokeWidth={1.5} />
    </FormatButton>
  );
}

const TEXT_COLORS = [
  { label: "Red",    color: "#ef4444" },
  { label: "Orange", color: "#f97316" },
  { label: "Amber",  color: "#f59e0b" },
  { label: "Green",  color: "#22c55e" },
  { label: "Blue",   color: "#3b82f6" },
  { label: "Purple", color: "#a855f7" },
  { label: "Pink",   color: "#ec4899" },
  { label: "Gray",   color: "#6b7280" },
];

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
        className={`cursor-pointer flex items-center gap-0.5 rounded px-2 py-2 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
          open ? "bg-white/[0.1] text-white" : "text-white/50 hover:bg-white/[0.06] hover:text-white/80"
        }`}
      >
        <span className="font-bold text-sm" style={{ color: currentColor ?? "currentColor" }}>A</span>
        <ChevronDown size={8} strokeWidth={1.5} className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-36 rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] p-2 shadow-lg shadow-black/40">
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
            className="cursor-pointer w-full rounded px-2 py-1 text-[11px] text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/70"
          >
            Remove color
          </button>
        </div>
      )}
    </div>
  );
}

const CALLOUT_OPTIONS: { type: CalloutType; label: string; color: string }[] = [
  { type: "info",    label: "Info",    color: "#3b82f6" },
  { type: "warning", label: "Warning", color: "#f59e0b" },
  { type: "error",   label: "Error",   color: "#ef4444" },
  { type: "note",    label: "Note",    color: "#a855f7" },
  { type: "success", label: "Success", color: "#22c55e" },
];

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
        className={`cursor-pointer flex items-center gap-1 rounded px-2 py-2 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
          open ? "bg-white/[0.1] text-white" : "text-white/50 hover:bg-white/[0.06] hover:text-white/80 active:scale-95"
        }`}
      >
        <Info size={16} strokeWidth={1.5} />
        <ChevronDown size={8} strokeWidth={1.5} className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-40 rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] py-1 shadow-lg shadow-black/40">
          {CALLOUT_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              type="button"
              onClick={() => insertCallout(opt.type)}
              className="cursor-pointer flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-white/70 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
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
  const insert = useCallback(() => {
    const title = window.prompt("Section title", "Details");
    if (title === null) return;
    editor.chain().focus().setExpand({ title: title || "Details" }).run();
  }, [editor]);

  return (
    <FormatButton editor={editor} action={insert} active={editor.isActive("expand")} label="Insert expandable section">
      <ChevronRight size={16} strokeWidth={1.5} />
    </FormatButton>
  );
}

// Common emoji palette for quick insertion
const COMMON_EMOJIS = [
  { emoji: "✅", shortname: ":check_mark:" },
  { emoji: "⚠️", shortname: ":warning:" },
  { emoji: "❓", shortname: ":question_mark:" },
  { emoji: "ℹ️", shortname: ":info:" },
  { emoji: "🔴", shortname: ":red_circle:" },
  { emoji: "🟢", shortname: ":large_green_circle:" },
  { emoji: "🟡", shortname: ":large_yellow_circle:" },
  { emoji: "🔵", shortname: ":large_blue_circle:" },
  { emoji: "⭐", shortname: ":star:" },
  { emoji: "🔥", shortname: ":fire:" },
  { emoji: "🚀", shortname: ":rocket:" },
  { emoji: "🎉", shortname: ":tada:" },
  { emoji: "👍", shortname: ":thumbsup:" },
  { emoji: "👎", shortname: ":thumbsdown:" },
  { emoji: "💡", shortname: ":bulb:" },
  { emoji: "📝", shortname: ":memo:" },
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
    (shortname: string) => {
      editor.chain().focus().insertContent(shortname).run();
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
        className={`cursor-pointer flex items-center rounded px-2 py-2 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
          open ? "bg-white/[0.1] text-white" : "text-white/50 hover:bg-white/[0.06] hover:text-white/80 active:scale-95"
        }`}
      >
        <Smile size={16} strokeWidth={1.5} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] p-2 shadow-lg shadow-black/40">
          <div className="grid grid-cols-8 gap-0.5">
            {COMMON_EMOJIS.map(({ emoji, shortname }) => (
              <button
                key={shortname}
                type="button"
                onClick={() => insertEmoji(shortname)}
                title={shortname}
                className="cursor-pointer flex h-7 w-7 items-center justify-center rounded text-base transition-colors hover:bg-white/[0.08] active:scale-90"
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
  return <div className="mx-1 h-5 w-px bg-white/[0.08]" />;
}
