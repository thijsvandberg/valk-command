"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { FilePen, MessageCircleQuestion, CheckCircle2, Ban, Minus } from "lucide-react";
import type { TicketReadiness } from "@/types/ticket";
import { READINESS_CONFIG, READINESS_OPTIONS } from "@/types/ticket";

export function ReadinessIcon({ value, size = 13 }: { value: TicketReadiness; size?: number }) {
  const props = { style: { width: size, height: size }, strokeWidth: 1.75 };
  switch (value) {
    case "drafting":             return <FilePen {...props} />;
    case "waiting_for_feedback": return <MessageCircleQuestion {...props} />;
    case "ready_to_refine":      return <CheckCircle2 {...props} />;
    case "on_hold":              return <Ban {...props} />;
  }
}

// Compact icon-only readiness picker for use in table cells and sidebars.
// align="right" (default) positions the dropdown leftward from the button; "left" positions it rightward.
// subtle=true hides the background until hover — used in table rows to avoid visual clutter.
export function ReadinessCell({
  value,
  onChange,
  align = "right",
  subtle = false,
}: {
  value: TicketReadiness | null;
  onChange: (v: TicketReadiness | null) => void;
  align?: "left" | "right";
  subtle?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const handleMouseEnter = useCallback(() => setHovered(true), []);
  const handleMouseLeave = useCallback(() => setHovered(false), []);

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
  const showBg = !subtle || hovered || open;

  return (
    <div ref={ref} className="relative inline-flex justify-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        title={value ? READINESS_CONFIG[value].label : "Ready for Development"}
        className="flex h-6 w-6 items-center justify-center rounded-md cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:opacity-60"
        style={{
          color: cfg?.color ?? "var(--color-text-muted)",
          backgroundColor: showBg ? (cfg?.bg ?? "var(--color-overlay-subtle)") : "transparent",
          opacity: hovered && showBg ? 0.8 : 1,
        }}
      >
        {value ? <ReadinessIcon value={value} /> : <span className="h-1.5 w-1.5 rounded-full bg-overlay-strong" />}
      </button>

      {open && (
        <div
          className={`absolute top-full z-50 mt-1 min-w-[210px] rounded-lg border border-border-default py-1 ${align === "left" ? "left-0" : "right-0"}`}
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
                className="flex w-full items-center gap-2.5 px-3 py-[7px] text-xs cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
              >
                <span
                  className="shrink-0 w-4 flex items-center justify-center"
                  style={{ color: optCfg?.color ?? "var(--color-text-muted)" }}
                >
                  {opt.value ? <ReadinessIcon value={opt.value} size={13} /> : <Minus style={{ width: 11, height: 11 }} strokeWidth={1.5} />}
                </span>
                <span className={isActive ? "text-text-primary font-medium" : "text-text-secondary"}>{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
