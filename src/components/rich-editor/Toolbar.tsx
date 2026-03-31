"use client";

import { useCallback, useState, useRef, useEffect } from "react";
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
        <BulletListIcon />
      </FormatButton>

      <FormatButton
        editor={editor}
        action={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        label="Numbered list"
      >
        <OrderedListIcon />
      </FormatButton>

      <Divider />

      <FormatButton
        editor={editor}
        action={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive("codeBlock")}
        label="Code block"
      >
        <CodeIcon />
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
      <LinkIcon />
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
        <CalloutIcon />
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="none"
          className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        >
          <path d="M1.5 3L4 5.5L6.5 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
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

// SVG Icons

function BulletListIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="2.5" cy="3.5" r="1" fill="currentColor" />
      <circle cx="2.5" cy="7" r="1" fill="currentColor" />
      <circle cx="2.5" cy="10.5" r="1" fill="currentColor" />
      <line x1="5.5" y1="3.5" x2="12" y2="3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="5.5" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="5.5" y1="10.5" x2="12" y2="10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function OrderedListIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <text x="1" y="5" fontSize="5" fill="currentColor" fontFamily="monospace">1</text>
      <text x="1" y="8.5" fontSize="5" fill="currentColor" fontFamily="monospace">2</text>
      <text x="1" y="12" fontSize="5" fill="currentColor" fontFamily="monospace">3</text>
      <line x1="5.5" y1="3.5" x2="12" y2="3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="5.5" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="5.5" y1="10.5" x2="12" y2="10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M4.5 3.5L1.5 7L4.5 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 3.5L12.5 7L9.5 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M6 8L8 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M5 9.5L3.5 11C2.7 11.8 1.5 11.5 1 11C0.5 10.5 0.2 9.3 1 8.5L3 6.5C3.8 5.7 5 6 5.5 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M9 4.5L10.5 3C11.3 2.2 12.5 2.5 13 3C13.5 3.5 13.8 4.7 13 5.5L11 7.5C10.2 8.3 9 8 8.5 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function CalloutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="2" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <line x1="1" y1="2" x2="1" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="7" cy="6" r="0.8" fill="currentColor" />
      <line x1="7" y1="7.5" x2="7" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
