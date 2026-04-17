"use client";

import { useState, useRef, useEffect } from "react";
import { IssueTypeIcon, ISSUE_TYPE_COLORS } from "@/components/shared/IssueTypeIcon";
import type { IssueType } from "@/types/ticket";

const SELECTABLE_TYPES: IssueType[] = ["story", "bug", "task", "spike"];

const TYPE_LABELS: Partial<Record<IssueType, string>> = {
  story: "Story",
  bug: "Bug",
  task: "Task",
  spike: "Spike",
};

interface IssueTypePickerProps {
  type: IssueType | string;
  size?: number;
  onTypeChange: (newType: IssueType) => void;
}

export function IssueTypePicker({ type, size = 16, onTypeChange }: IssueTypePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Change issue type"
        className="flex items-center rounded cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        style={{ opacity: open ? 1 : undefined, transition: "opacity 0.12s ease" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.7"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = ""; }}
      >
        <IssueTypeIcon type={type} size={size} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1.5 w-[118px] overflow-hidden rounded-lg border border-border-default bg-[#141822] shadow-[0_12px_32px_rgba(0,0,0,0.55),0_2px_8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.04)]"
          style={{ animation: "issue-picker-in 0.12s cubic-bezier(0.16,1,0.3,1)" }}
        >
          <style>{`
            @keyframes issue-picker-in {
              from { opacity: 0; transform: translateY(-4px) scale(0.97); }
              to   { opacity: 1; transform: translateY(0)   scale(1);    }
            }
          `}</style>
          <div className="p-1">
            {SELECTABLE_TYPES.map((t) => {
              const active = t === type;
              const color = ISSUE_TYPE_COLORS[t];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    onTypeChange(t);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-label font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
                  style={{
                    background: active ? `${color}14` : "transparent",
                    color: active ? color : "rgba(255,255,255,0.55)",
                    transition: "background 0.1s ease, color 0.1s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  <IssueTypeIcon type={t} size={12} />
                  <span>{TYPE_LABELS[t]}</span>
                  {active && (
                    <span
                      className="ml-auto h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ background: color, boxShadow: `0 0 4px ${color}80` }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
