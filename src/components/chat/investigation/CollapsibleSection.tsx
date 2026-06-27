"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { CopyActions } from "../CopyActions";

interface CollapsibleSectionProps {
  title: string;
  icon: LucideIcon;
  defaultOpen?: boolean;
  copyContent?: string;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = true,
  copyContent,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-l-2 border-border-default pl-4">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-2 py-2 cursor-pointer group focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        aria-expanded={open}
      >
        <Icon
          size={14}
          strokeWidth={1.5}
          className="text-text-muted group-hover:text-text-tertiary transition-colors duration-150"
        />
        <span className="font-[var(--font-display)] text-body-sm font-semibold tracking-[-0.01em] text-text-secondary group-hover:text-text-secondary transition-colors duration-150 uppercase">
          {title}
        </span>
        <ChevronRight
          size={12}
          strokeWidth={2}
          className={`ml-auto text-text-muted transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div className="pb-2 text-body-lg leading-[1.7] text-text-secondary font-[var(--font-body)]">
          {children}
          {copyContent && (
            <CopyActions content={copyContent} className="mt-2 pt-1.5 border-t border-border-subtle" />
          )}
        </div>
      )}
    </div>
  );
}
