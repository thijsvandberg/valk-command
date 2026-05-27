"use client";

import { useState, useRef, useEffect } from "react";
import { X, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/shared/TextInput";

export function SaveViewPopover({
  onSave,
  onClose,
  onDelete,
  initialTitle = "",
  isUpdate = false,
}: {
  onSave: (title: string) => void;
  onClose: () => void;
  onDelete?: () => void;
  initialTitle?: string;
  isUpdate?: boolean;
}) {
  const [title, setTitle] = useState(initialTitle);
  const inputRef = useRef<HTMLInputElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim()) {
      onSave(title.trim());
      onClose();
    }
  }

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 z-50 mt-1.5 w-64 overflow-hidden rounded-xl border border-border-strong bg-[var(--color-surface-floating)] p-3 shadow-[var(--shadow-xl)]"
    >
      <p className="mb-2 text-label font-medium text-text-tertiary">
        {isUpdate ? "Update saved view" : "Save current filter view"}
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <TextInput
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="View name..."
          style={{ boxShadow: "inset 0 1px 2px rgba(0,0,0,0.18)" }}
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          icon={<Check className="h-3 w-3" strokeWidth={2} />}
          disabled={!title.trim()}
          className="w-full"
        >
          {isUpdate ? "Update view" : "Save view"}
        </Button>
        {isUpdate && onDelete && (
          <>
            <div className="h-px bg-overlay-default" />
            <Button
              type="button"
              variant="destructive"
              size="sm"
              icon={<X className="h-3 w-3" strokeWidth={1.5} />}
              onClick={() => { onDelete(); onClose(); }}
              className="w-full"
            >
              Delete view
            </Button>
          </>
        )}
      </form>
    </div>
  );
}
