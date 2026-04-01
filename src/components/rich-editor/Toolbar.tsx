"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import { List, ListOrdered, Code2, Link, ChevronDown, Info } from "lucide-react";
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
    <div className="flex items-center gap-0.5 px-1" role="toolbar" aria-label="Editor formatting">
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

      <FormatButton
        editor={editor}
        action={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive("codeBlock")}
        label="Code block"
      >
        <Code2 size={14} strokeWidth={1.5} />
      </FormatButton>

      <LinkButton editor={editor} />

      <Divider />

      <CalloutDropdown editor={editor} />
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
      className={`cursor-pointer flex items-center justify-center rounded px-2 py-1.5 text-xs transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
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

    if (url === null) return; // cancelled
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

const CALLOUT_OPTIONS: { type: CalloutType; label: string; color: string }[] = [
  { type: "info", label: "Info", color: "#3b82f6" },
  { type: "warning", label: "Warning", color: "#f59e0b" },
  { type: "error", label: "Error", color: "#ef4444" },
  { type: "note", label: "Note", color: "#9ca3af" },
  { type: "success", label: "Success", color: "#22c55e" },
];

function CalloutDropdown({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
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
        className={`cursor-pointer flex items-center gap-1 rounded px-2 py-1.5 text-xs transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
          open
            ? "bg-white/[0.1] text-white"
            : "text-white/50 hover:bg-white/[0.06] hover:text-white/80 active:scale-95"
        }`}
      >
        <Info size={14} strokeWidth={1.5} />
        <ChevronDown
          size={8}
          strokeWidth={1.5}
          className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
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
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: opt.color }}
              />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Divider() {
  return <div className="mx-1 h-4 w-px bg-white/[0.08]" />;
}

