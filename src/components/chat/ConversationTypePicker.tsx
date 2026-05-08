"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, MessageCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ConversationType } from "@/types/chat";

interface ConversationTypePickerProps {
  onCreate: (type: ConversationType) => void;
}

const options: { type: ConversationType; label: string; icon: React.ReactNode }[] = [
  {
    type: "chat",
    label: "Chat",
    icon: <MessageCircle size={14} strokeWidth={1.5} />,
  },
  {
    type: "investigation",
    label: "Investigation",
    icon: <Search size={14} strokeWidth={1.5} />,
  },
];

export default function ConversationTypePicker({ onCreate }: ConversationTypePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback(
    (type: ConversationType) => {
      setOpen(false);
      onCreate(type);
    },
    [onCreate],
  );

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="soft"
        iconOnly
        icon={<Plus className="h-4 w-4" strokeWidth={2} />}
        onClick={() => setOpen((prev) => !prev)}
        aria-label="New conversation"
        aria-expanded={open}
      />

      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 min-w-[180px] rounded-lg border border-border-strong bg-[var(--color-surface-floating)] shadow-[0_4px_24px_rgba(0,0,0,0.5),0_1px_4px_rgba(0,0,0,0.3)]"
          role="menu"
        >
          <div className="p-1">
            {options.map((opt) => (
              <button
                key={opt.type}
                type="button"
                role="menuitem"
                onClick={() => handleSelect(opt.type)}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-[var(--font-body)] text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary active:bg-overlay-strong transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-brand-400)]"
              >
                <span className="text-text-tertiary">{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
