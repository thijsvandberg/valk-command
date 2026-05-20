"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Check, Minus, IterationCw } from "lucide-react";

interface Sprint {
  id: number;
  name: string;
  state: string;
  startDate: string | null;
  endDate: string | null;
  hidden?: boolean;
}

export function SprintPicker({
  value,
  sprints,
  onChange,
  align = "right",
}: {
  value: string | null;
  sprints: Sprint[];
  onChange: (sprintId: string | null) => void;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; flipUp: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const activeSprints = sprints.filter((s) => !s.hidden && (s.state === "active" || s.state === "future"));
  const currentSprint = sprints.find((s) => String(s.id) === value);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const flipUp = rect.bottom + 200 > window.innerHeight;
    setPos({
      top: flipUp ? rect.top : rect.bottom + 4,
      left: align === "left" ? rect.left : rect.right,
      flipUp,
    });
  }, [align]);

  const handleOpen = useCallback(() => {
    updatePosition();
    setOpen(true);
  }, [updatePosition]);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        popoverRef.current?.contains(e.target as Node)
      ) return;
      handleClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    function handleScroll() { updatePosition(); }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open, updatePosition, handleClose]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => open ? handleClose() : handleOpen()}
        title={currentSprint ? `Sprint: ${currentSprint.name}` : "No sprint"}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm text-text-secondary cursor-pointer hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:opacity-60"
        style={{ transition: "background-color 0.15s ease" }}
      >
        <span className="truncate">{currentSprint?.name ?? "None"}</span>
      </button>

      {open && pos && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[9999] max-h-[260px] min-w-[200px] overflow-y-auto rounded-lg border border-border-default py-1"
          style={{
            top: pos.flipUp ? undefined : pos.top,
            bottom: pos.flipUp ? window.innerHeight - pos.top + 4 : undefined,
            left: align === "left" ? pos.left : undefined,
            right: align === "right" ? window.innerWidth - pos.left : undefined,
            backgroundColor: "var(--color-surface-floating)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.3)",
          }}
        >
          {/* No sprint option */}
          <button
            type="button"
            onClick={() => { onChange(null); handleClose(); }}
            className="flex w-full items-center gap-2.5 px-3 py-[7px] text-xs cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
          >
            <span className="flex w-4 items-center justify-center shrink-0 text-text-muted">
              <Minus size={12} strokeWidth={1.5} />
            </span>
            <span className={!value ? "text-text-primary font-medium" : "text-text-secondary"}>No sprint</span>
            {!value && <Check size={12} strokeWidth={1.5} className="ml-auto text-[var(--color-brand-400)]" />}
          </button>

          {/* Active sprints */}
          {activeSprints.map((s) => {
            const isActive = String(s.id) === value;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => { onChange(String(s.id)); handleClose(); }}
                className="flex w-full items-center gap-2.5 px-3 py-[7px] text-xs cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
              >
                <span className="flex w-4 items-center justify-center shrink-0 text-text-muted">
                  <IterationCw size={12} strokeWidth={1.5} />
                </span>
                <span className={isActive ? "text-text-primary font-medium" : "text-text-secondary"}>{s.name}</span>
                {s.state === "active" && (
                  <span className="ml-1 rounded bg-[var(--color-brand-500)]/10 px-1 py-0.5 text-caption text-[var(--color-brand-400)]">active</span>
                )}
                {isActive && <Check size={12} strokeWidth={1.5} className="ml-auto text-[var(--color-brand-400)]" />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
