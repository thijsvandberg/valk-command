"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";

const C_BORDER = "var(--color-border-strong)";

export function HunkEditor({
  initialText,
  onSave,
  onCancel,
}: {
  initialText: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initialText);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.focus();
      ref.current.style.height = "auto";
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, []);

  return (
    <div className="border-y px-3 py-3" style={{ borderColor: C_BORDER, backgroundColor: "color-mix(in srgb, #d2a8ff 3%, transparent)" }}>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
        className="w-full resize-none rounded-md border border-border-strong bg-overlay-subtle px-3 py-2 font-mono text-body-lg leading-6 text-text-secondary placeholder:text-text-muted focus:border-[var(--color-brand-500)]/40 focus:outline-none"
        rows={3}
      />
      <div className="mt-2 flex items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={() => onSave(text)}
        >
          Save edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
