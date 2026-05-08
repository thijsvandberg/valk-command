"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { getBvColor } from "@/types/ticket";
import { Minus, X } from "lucide-react";

const BV_SCORE_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const;

export function BusinessValuePicker({
  value,
  onChange,
  align = "right",
  subtle = false,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
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

  const isNA = value === 0;
  const color = value != null ? getBvColor(value) : null;
  const showBg = !subtle || hovered || open;
  const displayLabel = value != null ? (isNA ? "-" : String(value)) : null;

  return (
    <div ref={ref} className="relative inline-flex justify-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        title={isNA ? "N/A" : value != null ? `Business Value: ${value}` : "Set Business Value"}
        className="flex h-6 min-w-[24px] items-center justify-center rounded-md cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:opacity-60 text-xs font-medium tabular-nums"
        style={{
          color: color?.text ?? "var(--color-text-muted)",
          backgroundColor: showBg ? (color?.bg ?? "var(--color-overlay-subtle)") : "transparent",
          opacity: hovered && showBg ? 0.85 : 1,
        }}
      >
        {displayLabel ?? <span className="h-1.5 w-1.5 rounded-full bg-white/20" />}
      </button>

      {open && (
        <div
          className={`absolute top-full z-50 mt-1 rounded-lg border border-border-default p-1.5 ${align === "left" ? "left-0" : "right-0"}`}
          style={{
            backgroundColor: "var(--color-surface-floating)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.3)",
          }}
        >
          <div className="flex items-center gap-1">
            {/* N/A option */}
            <button
              type="button"
              onClick={() => { onChange(0); setOpen(false); }}
              title="Not applicable"
              className="flex h-7 w-7 items-center justify-center rounded-md cursor-pointer transition-colors duration-100 hover:opacity-80 active:opacity-60"
              style={{
                color: isNA ? "#fff" : "#555a64",
                backgroundColor: isNA ? "#555a64" : "rgba(85, 90, 100, 0.08)",
                boxShadow: isNA ? "0 0 0 1px rgba(85, 90, 100, 0.4)" : undefined,
              }}
            >
              <Minus size={12} strokeWidth={1.5} />
            </button>

            {/* Score options 1-7 */}
            {BV_SCORE_OPTIONS.map((n) => {
              const c = getBvColor(n);
              const isActive = n === value;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => { onChange(n); setOpen(false); }}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-medium tabular-nums cursor-pointer transition-colors duration-100 hover:opacity-80 active:opacity-60"
                  style={{
                    color: isActive ? "#fff" : c.text,
                    backgroundColor: isActive ? c.text : c.bg,
                    boxShadow: isActive ? `0 0 0 1px ${c.text}40` : undefined,
                  }}
                >
                  {n}
                </button>
              );
            })}

            {/* Clear (back to unset) */}
            {value != null && (
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false); }}
                title="Clear"
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted cursor-pointer hover:bg-overlay-default hover:text-text-secondary transition-colors duration-100 active:opacity-60"
              >
                <X size={12} strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
