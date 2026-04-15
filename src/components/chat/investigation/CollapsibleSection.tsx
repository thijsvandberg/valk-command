"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";

interface CollapsibleSectionProps {
  title: string;
  icon: LucideIcon;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-l-2 border-white/[0.06] pl-4">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-2 py-2 cursor-pointer group"
        aria-expanded={open}
      >
        <Icon
          size={14}
          strokeWidth={1.5}
          className="text-white/25 group-hover:text-white/40 transition-colors duration-150"
        />
        <span className="font-[var(--font-display)] text-xs font-semibold tracking-[-0.01em] text-white/50 group-hover:text-white/70 transition-colors duration-150 uppercase">
          {title}
        </span>
        <ChevronRight
          size={12}
          strokeWidth={2}
          className={`ml-auto text-white/20 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div className="pb-2 text-sm leading-[1.7] text-white/70 font-[var(--font-body)]">
          {children}
        </div>
      )}
    </div>
  );
}
