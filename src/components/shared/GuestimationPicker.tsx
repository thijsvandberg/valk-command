"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { usePickerState } from "@/components/shared/BasePicker";
import { getGuestimationColor, GUESTIMATION_OPTIONS, GUESTIMATION_OPTION_SET } from "@/types/ticket";
import { Minus, X, Hash } from "lucide-react";
import { Tooltip } from "@/components/shared/Tooltip";

// Forward-planning guestimation (BRDG-303, re-styled in BRDG-321). Technically
// identical to the story point picker (same Fibonacci scale, same keyboard
// entry) and now wears the SAME slate Hash tone — a guess is set apart purely by
// a dashed inset border ("penciled in"), never by a different hue. Because the
// dashed border sits inside the existing footprint (border-box), the draft chip
// is exactly the same outer size as a committed SP chip. No custom-number entry:
// a guess is intentionally coarse.

export function GuestimationPicker({
  value,
  onChange,
  align = "right",
  subtle = false,
  size = "sm",
  showMetricIcon = false,
  richTooltip = false,
  revealWhenEmpty = false,
  revealGroup = "default",
  dense = false,
  onOpenChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  align?: "left" | "right";
  subtle?: boolean;
  size?: "sm" | "lg";
  // Compact trigger so the editable picker lines up with the uniform list badges.
  dense?: boolean;
  // Show a leading pencil icon so the guess is recognizable without a header.
  showMetricIcon?: boolean;
  // Replace the native title attribute with the styled Tooltip component.
  richTooltip?: boolean;
  // When empty, keep the trigger hidden until the enclosing row is hovered
  // (or the popover is open/focused), so unscored rows stay calm.
  revealWhenEmpty?: boolean;
  revealGroup?: "default" | "row";
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

  // Keyboard shortcuts while open: Fibonacci presets set a guess, 0/- mark N/A,
  // Backspace/Delete clear. Mirrors the story point picker exactly.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") return;
      const num = parseInt(e.key, 10);
      if (GUESTIMATION_OPTION_SET.has(num)) { onChange(num); handleClose(); return; }
      if (e.key === "0" || e.key === "-") { onChange(0); handleClose(); return; }
      if (e.key === "Backspace" || e.key === "Delete") { onChange(null); handleClose(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onChange, handleClose]);

  const isLg = size === "lg";
  const isNA = value === 0;
  const color = value != null ? getGuestimationColor(value) : null;
  // A guess wears a dashed slate outline with NO fill ("penciled in"), so it
  // reads as the same SP chip but not yet committed (BRDG-321, exploration pick B).
  const borderColor = color ? color.text : "var(--color-text-muted)";
  const showBg = !subtle || hovered || open || value != null;
  const displayLabel = value != null ? (isNA ? "-" : String(value)) : null;
  const titleText = isNA ? "Guestimation: N/A" : value != null ? `Guestimation: ${value} (PO guess)` : "Set guestimation";

  const trigger = isLg ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => open ? handleClose() : handleOpen()}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          title={richTooltip ? undefined : titleText}
          aria-label={titleText}
          className="flex h-7 items-center gap-1.5 rounded-lg border border-dashed px-2.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:opacity-60"
          style={{
            color: color?.text ?? "var(--color-text-muted)",
            backgroundColor: "transparent",
            borderColor: `color-mix(in srgb, ${borderColor} 45%, transparent)`,
            opacity: hovered ? 0.85 : 1,
            transition: "opacity 0.15s ease",
          }}
        >
          {showMetricIcon ? <Hash size={12} strokeWidth={2} aria-hidden /> : <span className="text-[10px] font-semibold uppercase tracking-wider opacity-60">G</span>}
          <span className="text-body-sm font-semibold tabular-nums">{displayLabel ?? "?"}</span>
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => open ? handleClose() : handleOpen()}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          title={richTooltip ? undefined : titleText}
          aria-label={titleText}
          className={`flex items-center rounded-md border border-dashed cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:opacity-60 font-medium tabular-nums ${dense ? "h-5 text-[11px] leading-none" : "h-6 text-body-sm"} ${showMetricIcon ? "gap-1 px-1.5 min-w-[2.25rem] justify-start" : "min-w-[24px] justify-center px-1"}`}
          style={{
            color: color?.text ?? "var(--color-text-muted)",
            backgroundColor: "transparent",
            borderColor: showBg ? `color-mix(in srgb, ${borderColor} 45%, transparent)` : "transparent",
            opacity: hovered && showBg ? 0.85 : 1,
          }}
        >
          {showMetricIcon ? (
            // Reserve the icon + value footprint so empty and filled cells share
            // one width and the column reads as a calm, aligned guess gutter.
            <>
              <Hash size={dense ? 10 : 11} strokeWidth={2} aria-hidden />
              {displayLabel != null && displayLabel}
            </>
          ) : displayLabel != null ? (
            displayLabel
          ) : (
            <Hash size={dense ? 10 : 11} strokeWidth={2} aria-hidden style={{ opacity: 0.7 }} />
          )}
        </button>
  );

  // Reveal-on-hover wrapper for empty cells. Opacity composites across nesting,
  // so the wrapper hides the trigger regardless of its own inline opacity.
  const revealCls =
    revealWhenEmpty && value == null && !open
      ? revealGroup === "row"
        ? "opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 focus-within:opacity-100"
        : "opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100"
      : "";

  return (
    <span className={revealCls || undefined}>
      {richTooltip ? <Tooltip content={titleText}>{trigger}</Tooltip> : trigger}

      {open && pos && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[9999] rounded-lg border border-dashed border-border-default p-1.5"
          style={getPopoverStyle()}
        >
          <div className="mb-1 px-0.5 text-[9px] font-semibold uppercase tracking-wider text-text-muted">Guestimate</div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => { onChange(0); handleClose(); }} title="Not applicable" className="flex h-7 w-7 items-center justify-center rounded-md border border-dashed cursor-pointer transition-colors duration-100 hover:opacity-80 active:opacity-60" style={{ color: isNA ? "#fff" : "#555a64", backgroundColor: isNA ? "#555a64" : "color-mix(in srgb, #555a64 8%, transparent)", borderColor: isNA ? "transparent" : "color-mix(in srgb, #555a64 35%, transparent)" }}>
              <Minus size={12} strokeWidth={1.5} />
            </button>

            {GUESTIMATION_OPTIONS.map((n) => {
              const c = getGuestimationColor(n);
              const isActive = n === value;
              return (
                <button key={n} type="button" onClick={() => { onChange(n); handleClose(); }} className="flex h-7 w-7 items-center justify-center rounded-md border border-dashed text-body-sm font-semibold tabular-nums cursor-pointer transition-colors duration-100 hover:opacity-80 active:opacity-60" style={{ color: isActive ? "#fff" : c.text, backgroundColor: isActive ? c.solid : c.bg, borderColor: isActive ? "transparent" : `color-mix(in srgb, ${c.solid} 40%, transparent)` }}>
                  {n}
                </button>
              );
            })}

            {value != null && (
              <button type="button" onClick={() => { onChange(null); handleClose(); }} title="Clear guestimation" className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted cursor-pointer hover:bg-overlay-default hover:text-text-secondary transition-colors duration-100 active:opacity-60">
                <X size={12} strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}
