"use client";

import { useState, useRef, useEffect } from "react";
import { PenLine, MessageCircleQuestion, Sparkles, PauseCircle } from "lucide-react";
import type { TicketReadiness } from "@/types/ticket";
import { READINESS_CONFIG, READINESS_OPTIONS } from "@/types/ticket";

export function ReadinessIcon({ value, size = 13 }: { value: TicketReadiness; size?: number }) {
  const props = { style: { width: size, height: size }, strokeWidth: 1.75 };
  switch (value) {
    case "drafting":             return <PenLine {...props} />;
    case "waiting_for_feedback": return <MessageCircleQuestion {...props} />;
    case "ready_to_refine":      return <Sparkles {...props} />;
    case "on_hold":              return <PauseCircle {...props} />;
  }
}

// Compact icon-only readiness picker for use in table cells.
export function ReadinessCell({
  value,
  onChange,
}: {
  value: TicketReadiness | null;
  onChange: (v: TicketReadiness | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const cfg = value ? READINESS_CONFIG[value] : null;

  return (
    <div ref={ref} className="relative inline-flex justify-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={value ? READINESS_CONFIG[value].label : "Ready for Development"}
        className="flex h-6 w-6 items-center justify-center rounded-md cursor-pointer transition-colors duration-150 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:opacity-60"
        style={{
          color: cfg?.color ?? "rgba(255,255,255,0.2)",
          backgroundColor: cfg?.bg ?? "rgba(255,255,255,0.04)",
        }}
      >
        {value ? <ReadinessIcon value={value} /> : <span className="h-1.5 w-1.5 rounded-full bg-white/20" />}
      </button>

      {open && (
        <div
          className="absolute top-full right-0 z-50 mt-1 min-w-[188px] rounded-lg border border-white/[0.07] py-1"
          style={{
            backgroundColor: "var(--color-surface-floating)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.3)",
          }}
        >
          {READINESS_OPTIONS.map((opt) => {
            const optCfg = opt.value ? READINESS_CONFIG[opt.value] : null;
            const isActive = opt.value === value;
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs cursor-pointer hover:bg-hover-list-item active:bg-white/[0.06]"
              >
                <span
                  className="shrink-0 flex h-4 w-4 items-center justify-center rounded-full"
                  style={{
                    color: optCfg?.color ?? "rgba(255,255,255,0.25)",
                    backgroundColor: optCfg?.bg ?? "rgba(255,255,255,0.05)",
                  }}
                >
                  {opt.value ? <ReadinessIcon value={opt.value} size={10} /> : null}
                </span>
                <span className={isActive ? "text-white/90" : "text-white/50"}>{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
