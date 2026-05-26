"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { getBvColor } from "@/types/ticket";
import { Minus, X } from "lucide-react";

const BV_SCORE_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const;

export function BusinessValuePicker({
  value,
  onChange,
  align = "right",
  subtle = false,
  size = "sm",
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  align?: "left" | "right";
  subtle?: boolean;
  size?: "sm" | "lg";
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; flipUp: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const handleMouseEnter = useCallback(() => setHovered(true), []);
  const handleMouseLeave = useCallback(() => setHovered(false), []);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const flipUp = rect.bottom + 48 > window.innerHeight;
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

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        popoverRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); return; }
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 7) { onChange(num); setOpen(false); return; }
      if (e.key === "0" || e.key === "-") { onChange(0); setOpen(false); return; }
      if (e.key === "Backspace" || e.key === "Delete") { onChange(null); setOpen(false); }
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
  }, [open, onChange, updatePosition]);

  const isLg = size === "lg";
  const isNA = value === 0;
  const color = value != null ? getBvColor(value) : null;
  const showBg = !subtle || hovered || open;
  const displayLabel = value != null ? (isNA ? "-" : String(value)) : null;

  return (
    <>
      {isLg ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => open ? setOpen(false) : handleOpen()}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          title={isNA ? "N/A" : value != null ? `Business Value: ${value}` : "Set Business Value"}
          className="flex h-7 items-center gap-1.5 rounded-lg px-2.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:opacity-60"
          style={{
            color: color?.text ?? "var(--color-text-muted)",
            backgroundColor: color?.bg ?? "var(--color-overlay-subtle)",
            opacity: hovered ? 0.85 : 1,
            transition: "opacity 0.15s ease",
          }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider opacity-60">BV</span>
          <span className="text-xs font-semibold tabular-nums">
            {displayLabel ?? "?"}
          </span>
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => open ? setOpen(false) : handleOpen()}
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
          {displayLabel ?? <span className="h-1.5 w-1.5 rounded-full bg-overlay-strong" />}
        </button>
      )}

      {open && pos && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[9999] rounded-lg border border-border-default p-1.5"
          style={{
            top: pos.flipUp ? undefined : pos.top,
            bottom: pos.flipUp ? window.innerHeight - pos.top + 4 : undefined,
            left: align === "left" ? pos.left : undefined,
            right: align === "right" ? window.innerWidth - pos.left : undefined,
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
        </div>,
        document.body,
      )}
    </>
  );
}
