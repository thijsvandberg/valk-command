"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { X } from "lucide-react";
import type { Editor } from "@tiptap/react";

// Augment TipTap's EditorEvents to include the custom link popover event
declare module "@tiptap/core" {
  interface EditorEvents {
    openLinkPopover: Record<string, never>;
  }
}

interface LinkPopoverProps {
  editor: Editor;
  open: boolean;
  onClose: () => void;
}

function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// Compute initial field values from editor state at the moment the popover opens
function getInitialValues(editor: Editor) {
  const existingHref = (editor.getAttributes("link").href as string) || "";
  const { from, to } = editor.state.selection;
  const selectedText = from !== to ? editor.state.doc.textBetween(from, to) : "";
  return {
    url: existingHref || "https://",
    displayText: selectedText,
  };
}

export function LinkPopover({ editor, open, onClose }: LinkPopoverProps) {
  // Derive initial values once when the popover first opens.
  // useMemo recalculates when `open` changes. When open turns true,
  // we snapshot the editor state; when open is false this value is unused.
  const initial = useMemo(
    () => (open ? getInitialValues(editor) : { url: "", displayText: "" }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open]
  );

  const [url, setUrl] = useState(initial.url);
  const [displayText, setDisplayText] = useState(initial.displayText);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  // Reset fields when initial values change (i.e. when popover opens/closes)
  useEffect(() => {
    setUrl(initial.url);
    setDisplayText(initial.displayText);
    setError("");
  }, [initial]);

  // Auto-focus URL input when popover opens
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => urlInputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [open]);

  useOutsideClick(ref, onClose, { enabled: open });

  const handleApply = useCallback(() => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl || trimmedUrl === "https://") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      onClose();
      return;
    }

    if (!validateUrl(trimmedUrl)) {
      setError("Only http, https, and mailto links are supported");
      return;
    }

    const { from, to } = editor.state.selection;
    const hasSelection = from !== to;
    const text = displayText.trim() || trimmedUrl;

    if (hasSelection) {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .command(({ tr, state }) => {
          const { from: selFrom, to: selTo } = state.selection;
          tr.insertText(text, selFrom, selTo);
          return true;
        })
        .setLink({ href: trimmedUrl })
        .run();
    } else {
      editor
        .chain()
        .focus()
        .insertContent(`<a href="${trimmedUrl}">${text}</a>`)
        .run();
    }

    onClose();
  }, [editor, url, displayText, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleApply();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        editor.chain().focus().run();
      }
    },
    [handleApply, onClose, editor]
  );

  if (!open) return null;

  return (
    <div
      ref={ref}
      onKeyDown={handleKeyDown}
      className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-border-strong bg-[var(--color-surface-floating)] p-3 shadow-lg shadow-black/40"
    >
      <label className="mb-1.5 block text-label font-medium uppercase tracking-wider text-text-tertiary">
        URL
      </label>
      <div className="relative mb-2.5">
        <input
          ref={urlInputRef}
          type="text"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError("");
          }}
          placeholder="https://"
          className="w-full rounded border border-border-strong bg-overlay-default px-2.5 py-1.5 pr-8 text-body-lg text-text-primary outline-none placeholder:text-text-muted focus:border-[var(--color-brand-500)]/50 focus:bg-overlay-default"
        />
        {url && url !== "https://" && (
          <button
            type="button"
            onClick={() => {
              setUrl("");
              setError("");
              urlInputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-text-muted transition-colors duration-150 hover:text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            aria-label="Clear URL"
          >
            <X size={12} strokeWidth={2} />
          </button>
        )}
      </div>

      {error && (
        <p className="mb-2 text-body-sm text-[var(--color-status-red)]">{error}</p>
      )}

      <label className="mb-1.5 block text-label font-medium uppercase tracking-wider text-text-tertiary">
        Display text
        <span className="ml-1 normal-case tracking-normal font-normal">(optional)</span>
      </label>
      <input
        type="text"
        value={displayText}
        onChange={(e) => setDisplayText(e.target.value)}
        placeholder="Text to display"
        className="mb-3 w-full rounded border border-border-strong bg-overlay-default px-2.5 py-1.5 text-body-lg text-text-primary outline-none placeholder:text-text-muted focus:border-[var(--color-brand-500)]/50 focus:bg-overlay-default"
      />

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            onClose();
            editor.chain().focus().run();
          }}
          className="cursor-pointer rounded px-3 py-1.5 text-body-sm text-text-tertiary transition-colors duration-150 hover:text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleApply}
          className="cursor-pointer rounded bg-overlay-strong px-3 py-1.5 text-body-sm font-medium text-text-secondary transition-colors duration-150 hover:bg-overlay-strong hover:text-text-primary active:scale-[0.97] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

export { validateUrl };
