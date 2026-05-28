"use client";

import { ChevronDown } from "lucide-react";

const C_BORDER = "var(--color-border-strong)";

export function CollapsedBar({ count, onExpand }: { count: number; onExpand: () => void }) {
  return (
    <button
      type="button"
      onClick={onExpand}
      className="flex w-full items-center justify-center gap-1.5 border-y px-4 py-1.5 text-label text-text-muted cursor-pointer hover:bg-overlay-subtle hover:text-text-tertiary focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-brand-400)]"
      style={{
        borderColor: C_BORDER,
        backgroundColor: "var(--color-overlay-subtle)",
        transition: "background-color 0.15s ease, color 0.15s ease",
      }}
    >
      <ChevronDown size={12} strokeWidth={1.5} />
      Show {count} unchanged line{count !== 1 ? "s" : ""}
    </button>
  );
}
