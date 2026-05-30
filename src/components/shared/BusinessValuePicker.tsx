"use client";

import { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { usePickerState } from "@/components/shared/BasePicker";
import { getBvColor } from "@/types/ticket";
import { Minus, X } from "lucide-react";

const BV_SCORE_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const;

export function BusinessValuePicker({
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
  const [hovered, setHovered] = useState(false);
  const handleMouseEnter = useCallback(() => setHovered(true), []);
  const handleMouseLeave = useCallback(() => setHovered(false), []);

  const { open, pos, triggerRef, popoverRef, handleOpen, handleClose, getPopoverStyle } = usePickerState({
    portal: true,
    align,
    popoverHeight: 48,
    onOpen: () => onOpenChange?.(true),
    onClose: () => onOpenChange?.(false),
  });

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
          onClick={() => open ? handleClose() : handleOpen()}
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
          <span className="text-body-sm font-semibold tabular-nums">{displayLabel ?? "?"}</span>
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => open ? handleClose() : handleOpen()}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          title={isNA ? "N/A" : value != null ? `Business Value: ${value}` : "Set Business Value"}
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
          className="fixed z-[9999] rounded-lg border border-border-default p-1.5"
          style={getPopoverStyle()}
        >
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => { onChange(0); handleClose(); }} title="Not applicable" className="flex h-7 w-7 items-center justify-center rounded-md cursor-pointer transition-colors duration-100 hover:opacity-80 active:opacity-60" style={{ color: isNA ? "#fff" : "#555a64", backgroundColor: isNA ? "#555a64" : "color-mix(in srgb, #555a64 8%, transparent)", boxShadow: isNA ? "0 0 0 1px color-mix(in srgb, #555a64 40%, transparent)" : undefined }}>
              <Minus size={12} strokeWidth={1.5} />
            </button>

            {BV_SCORE_OPTIONS.map((n) => {
              const c = getBvColor(n);
              const isActive = n === value;
              return (
                <button key={n} type="button" onClick={() => { onChange(n); handleClose(); }} className="flex h-7 w-7 items-center justify-center rounded-md text-body-sm font-medium tabular-nums cursor-pointer transition-colors duration-100 hover:opacity-80 active:opacity-60" style={{ color: isActive ? "#fff" : c.text, backgroundColor: isActive ? c.text : c.bg, boxShadow: isActive ? `0 0 0 1px ${c.text}40` : undefined }}>
                  {n}
                </button>
              );
            })}

            {value != null && (
              <button type="button" onClick={() => { onChange(null); handleClose(); }} title="Clear" className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted cursor-pointer hover:bg-overlay-default hover:text-text-secondary transition-colors duration-100 active:opacity-60">
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
