"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { usePickerState } from "@/components/shared/BasePicker";
import { getSpColor } from "@/types/ticket";
import { Minus, X, Hash } from "lucide-react";

const SP_PRESET_OPTIONS = [1, 2, 3, 5, 8] as const;
const SP_PRESET_SET = new Set<number>(SP_PRESET_OPTIONS);

export function StoryPointPicker({
  value,
  onChange,
  align = "right",
  subtle = false,
  size = "sm",
  onOpenChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  align?: "left" | "right";
  subtle?: boolean;
  size?: "sm" | "lg";
  onOpenChange?: (open: boolean) => void;
}) {
  const isLg = size === "lg";
  const [hovered, setHovered] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [lgCustomInput, setLgCustomInput] = useState("");
  const customInputRef = useRef<HTMLInputElement>(null);
  const lgCustomInputRef = useRef<HTMLInputElement>(null);

  const { open, pos, triggerRef, popoverRef, handleOpen, handleClose, getPopoverStyle } = usePickerState({
    portal: true,
    align,
    popoverHeight: isLg ? 80 : 48,
    onOpen: () => onOpenChange?.(true),
    onClose: () => {
      setCustomMode(false);
      setCustomInput("");
      onOpenChange?.(false);
    },
  });

  const handleMouseEnter = useCallback(() => setHovered(true), []);
  const handleMouseLeave = useCallback(() => setHovered(false), []);

  const handleCustomSubmit = useCallback(() => {
    const parsed = parseInt(customInput, 10);
    if (parsed > 0 && parsed <= 999) onChange(parsed);
    handleClose();
  }, [customInput, onChange, handleClose]);

  const handleLgCustomSubmit = useCallback(() => {
    const parsed = parseInt(lgCustomInput, 10);
    if (parsed > 0 && parsed <= 999) {
      onChange(parsed);
      handleClose();
    }
  }, [lgCustomInput, onChange, handleClose]);

  useEffect(() => {
    if (customMode && customInputRef.current) customInputRef.current.focus();
  }, [customMode]);

  // Keyboard shortcuts for presets
  useEffect(() => {
    if (!open || customMode) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (lgCustomInputRef.current && document.activeElement === lgCustomInputRef.current) return;
      if (e.key === "Escape") return;
      const num = parseInt(e.key, 10);
      if (SP_PRESET_SET.has(num)) { onChange(num); handleClose(); return; }
      if (e.key === "0" || e.key === "-") { onChange(0); handleClose(); return; }
      if (e.key === "Backspace" || e.key === "Delete") { onChange(null); handleClose(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, customMode, onChange, handleClose]);

  const isNA = value === 0;
  const isCustomValue = value != null && value > 0 && !SP_PRESET_SET.has(value);
  const color = value != null ? getSpColor(value) : null;
  const showBg = !subtle || hovered || open;
  const displayLabel = value != null ? (isNA ? "-" : String(value)) : null;

  const btnSize = isLg ? "h-10 w-10" : "h-7 w-7";
  const btnText = isLg ? "text-body-lg font-semibold" : "text-body-sm font-medium";
  const iconSize = isLg ? 14 : 12;
  const popoverPadding = isLg ? "p-3" : "p-1.5";
  const customInputH = isLg ? "h-10 w-20" : "h-7 w-14";
  const customInputText = isLg ? "text-body-lg font-semibold" : "text-body-sm font-medium";

  return (
    <>
      {isLg ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => open ? handleClose() : handleOpen()}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          title={isNA ? "N/A" : value != null ? `Story Points: ${value}` : "Set Story Points"}
          className="flex h-7 items-center gap-1.5 rounded-lg px-2.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:opacity-60"
          style={{
            color: color?.text ?? "var(--color-text-muted)",
            backgroundColor: color?.bg ?? "var(--color-overlay-subtle)",
            opacity: hovered ? 0.85 : 1,
            transition: "opacity 0.15s ease",
          }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider opacity-60">SP</span>
          <span className="text-body-sm font-semibold tabular-nums">{displayLabel ?? "?"}</span>
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => open ? handleClose() : handleOpen()}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          title={isNA ? "N/A" : value != null ? `Story Points: ${value}` : "Set Story Points"}
          className="flex h-6 min-w-[24px] items-center justify-center rounded-md cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:opacity-60 text-body-sm font-medium tabular-nums"
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
          className={`fixed z-[9999] rounded-lg border border-border-default ${popoverPadding}`}
          style={getPopoverStyle()}
        >
          {isLg ? (
            <>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Story Points</div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => { onChange(0); handleClose(); }} title="Not applicable" className="flex h-10 w-10 items-center justify-center rounded-md cursor-pointer transition-colors duration-100 hover:opacity-80 active:opacity-60" style={{ color: isNA ? "#fff" : "#555a64", backgroundColor: isNA ? "#555a64" : "color-mix(in srgb, #555a64 8%, transparent)", boxShadow: isNA ? "0 0 0 1px color-mix(in srgb, #555a64 40%, transparent)" : undefined }}>
                  <Minus size={14} strokeWidth={1.5} />
                </button>
                {SP_PRESET_OPTIONS.map((n) => {
                  const c = getSpColor(n);
                  const isActive = n === value;
                  return (
                    <button key={n} type="button" onClick={() => { onChange(n); handleClose(); }} className="flex h-10 w-10 items-center justify-center rounded-md text-body-lg font-semibold tabular-nums cursor-pointer transition-colors duration-100 hover:opacity-80 active:opacity-60" style={{ color: isActive ? "#fff" : c.text, backgroundColor: isActive ? c.text : c.bg, boxShadow: isActive ? `0 0 0 1px ${c.text}40` : undefined }}>
                      {n}
                    </button>
                  );
                })}
                <input ref={lgCustomInputRef} type="number" min="1" max="999" value={lgCustomInput} onChange={(e) => setLgCustomInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleLgCustomSubmit(); } if (e.key === "Escape") { e.preventDefault(); handleClose(); } }} placeholder="#" className="h-10 w-10 rounded-md border border-border-default bg-[var(--color-surface-default)] text-center text-body-lg font-medium tabular-nums text-text-primary placeholder:text-text-muted outline-none focus:border-[var(--color-brand-400)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" style={{ transition: "border-color 0.15s ease" }} />
                <button type="button" onClick={() => { onChange(null); handleClose(); }} title="Clear story points" className={`flex h-10 w-10 items-center justify-center rounded-md text-text-muted cursor-pointer hover:bg-overlay-default hover:text-text-secondary transition-colors duration-100 active:opacity-60 ${value == null ? "opacity-30 pointer-events-none" : ""}`} disabled={value == null}>
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>
            </>
          ) : customMode ? (
            <div className="flex items-center gap-1">
              <input ref={customInputRef} type="number" min="1" max="999" value={customInput} onChange={(e) => setCustomInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCustomSubmit(); } if (e.key === "Escape") { e.preventDefault(); e.nativeEvent.stopImmediatePropagation(); setCustomMode(false); setCustomInput(""); } }} placeholder="SP" className={`${customInputH} rounded-md border border-border-default bg-[var(--color-surface-default)] px-2 text-center ${customInputText} tabular-nums text-text-primary outline-none focus:border-[var(--color-brand-400)]`} />
              <button type="button" onClick={handleCustomSubmit} className={`flex ${btnSize} items-center justify-center rounded-md text-text-muted cursor-pointer hover:bg-overlay-default hover:text-text-secondary transition-colors duration-100 active:opacity-60`}>
                <Hash size={iconSize} strokeWidth={1.5} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => { onChange(0); handleClose(); }} title="Not applicable" className={`flex ${btnSize} items-center justify-center rounded-md cursor-pointer transition-colors duration-100 hover:opacity-80 active:opacity-60`} style={{ color: isNA ? "#fff" : "#555a64", backgroundColor: isNA ? "#555a64" : "color-mix(in srgb, #555a64 8%, transparent)", boxShadow: isNA ? "0 0 0 1px color-mix(in srgb, #555a64 40%, transparent)" : undefined }}>
                <Minus size={iconSize} strokeWidth={1.5} />
              </button>
              {SP_PRESET_OPTIONS.map((n) => {
                const c = getSpColor(n);
                const isActive = n === value;
                return (
                  <button key={n} type="button" onClick={() => { onChange(n); handleClose(); }} className={`flex ${btnSize} items-center justify-center rounded-md ${btnText} tabular-nums cursor-pointer transition-colors duration-100 hover:opacity-80 active:opacity-60`} style={{ color: isActive ? "#fff" : c.text, backgroundColor: isActive ? c.text : c.bg, boxShadow: isActive ? `0 0 0 1px ${c.text}40` : undefined }}>
                    {n}
                  </button>
                );
              })}
              <button type="button" onClick={() => setCustomMode(true)} title="Custom value" className={`flex ${btnSize} items-center justify-center rounded-md cursor-pointer transition-colors duration-100 hover:opacity-80 active:opacity-60`} style={{ color: isCustomValue ? "#fff" : "var(--color-text-muted)", backgroundColor: isCustomValue ? (color?.text ?? "var(--color-overlay-default)") : "var(--color-overlay-subtle)", boxShadow: isCustomValue ? `0 0 0 1px ${color?.text ?? "var(--color-text-muted)"}40` : undefined }}>
                <Hash size={11} strokeWidth={1.5} />
              </button>
              <button type="button" onClick={() => { onChange(null); handleClose(); }} title="Clear story points" className={`flex ${btnSize} items-center justify-center rounded-md text-text-muted cursor-pointer hover:bg-overlay-default hover:text-text-secondary transition-colors duration-100 active:opacity-60 ${value == null ? "opacity-30 pointer-events-none" : ""}`} disabled={value == null}>
                <X size={iconSize} strokeWidth={1.5} />
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
