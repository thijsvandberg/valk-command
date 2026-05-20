"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { getSpColor } from "@/types/ticket";
import { Minus, X, Hash } from "lucide-react";

const SP_PRESET_OPTIONS = [1, 2, 3, 5, 8] as const;
const SP_PRESET_SET = new Set<number>(SP_PRESET_OPTIONS);

export function StoryPointPicker({
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
  const [customMode, setCustomMode] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; flipUp: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);
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
    setCustomMode(false);
    setCustomInput("");
  }, [updatePosition]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setCustomMode(false);
    setCustomInput("");
  }, []);

  const handleCustomSubmit = useCallback(() => {
    const parsed = parseInt(customInput, 10);
    if (parsed > 0 && parsed <= 999) {
      onChange(parsed);
    }
    handleClose();
  }, [customInput, onChange, handleClose]);

  useEffect(() => {
    if (customMode && customInputRef.current) {
      customInputRef.current.focus();
    }
  }, [customMode]);

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
      if (customMode) return;
      if (e.key === "Escape") { handleClose(); return; }
      const num = parseInt(e.key, 10);
      if (SP_PRESET_SET.has(num)) { onChange(num); handleClose(); return; }
      if (e.key === "0" || e.key === "-") { onChange(0); handleClose(); return; }
      if (e.key === "Backspace" || e.key === "Delete") { onChange(null); handleClose(); }
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
  }, [open, customMode, onChange, updatePosition, handleClose]);

  const isNA = value === 0;
  const isCustomValue = value != null && value > 0 && !SP_PRESET_SET.has(value);
  const color = value != null ? getSpColor(value) : null;
  const showBg = !subtle || hovered || open;
  const displayLabel = value != null ? (isNA ? "-" : String(value)) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => open ? handleClose() : handleOpen()}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        title={isNA ? "N/A" : value != null ? `Story Points: ${value}` : "Set Story Points"}
        className="flex h-6 min-w-[24px] items-center justify-center rounded-md cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:opacity-60 text-xs font-medium tabular-nums"
        style={{
          color: color?.text ?? "var(--color-text-muted)",
          backgroundColor: showBg ? (color?.bg ?? "var(--color-overlay-subtle)") : "transparent",
          opacity: hovered && showBg ? 0.85 : 1,
        }}
      >
        {displayLabel ?? <span className="h-1.5 w-1.5 rounded-full bg-overlay-strong" />}
      </button>

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
          {customMode ? (
            <div className="flex items-center gap-1">
              <input
                ref={customInputRef}
                type="number"
                min="1"
                max="999"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleCustomSubmit(); }
                  if (e.key === "Escape") { e.preventDefault(); setCustomMode(false); setCustomInput(""); }
                }}
                placeholder="SP"
                className="h-7 w-14 rounded-md border border-border-default bg-[var(--color-surface-default)] px-2 text-center text-xs font-medium tabular-nums text-text-primary outline-none focus:border-[var(--color-brand-400)]"
              />
              <button
                type="button"
                onClick={handleCustomSubmit}
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted cursor-pointer hover:bg-overlay-default hover:text-text-secondary transition-colors duration-100 active:opacity-60"
              >
                <Hash size={12} strokeWidth={1.5} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              {/* N/A option */}
              <button
                type="button"
                onClick={() => { onChange(0); handleClose(); }}
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

              {/* Preset options */}
              {SP_PRESET_OPTIONS.map((n) => {
                const c = getSpColor(n);
                const isActive = n === value;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => { onChange(n); handleClose(); }}
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

              {/* Custom option */}
              <button
                type="button"
                onClick={() => setCustomMode(true)}
                title="Custom value"
                className="flex h-7 w-7 items-center justify-center rounded-md cursor-pointer transition-colors duration-100 hover:opacity-80 active:opacity-60"
                style={{
                  color: isCustomValue ? "#fff" : "var(--color-text-muted)",
                  backgroundColor: isCustomValue ? (color?.text ?? "var(--color-overlay-default)") : "var(--color-overlay-subtle)",
                  boxShadow: isCustomValue ? `0 0 0 1px ${color?.text ?? "var(--color-text-muted)"}40` : undefined,
                }}
              >
                <Hash size={11} strokeWidth={1.5} />
              </button>

              {/* Clear (back to unset) */}
              {value != null && (
                <button
                  type="button"
                  onClick={() => { onChange(null); handleClose(); }}
                  title="Clear"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted cursor-pointer hover:bg-overlay-default hover:text-text-secondary transition-colors duration-100 active:opacity-60"
                >
                  <X size={12} strokeWidth={1.5} />
                </button>
              )}
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
