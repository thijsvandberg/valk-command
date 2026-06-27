"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { usePickerState } from "@/components/shared/BasePicker";
import { getBvColor } from "@/types/ticket";
import { Minus, X, TrendingUp } from "lucide-react";
import { Tooltip } from "@/components/shared/Tooltip";

const BV_SCORE_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const;

export function BusinessValuePicker({
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
  // Compact 18px trigger so the editable picker lines up with the uniform list badges.
  dense?: boolean;
  // Show a leading goal icon (value/target) so BV is recognizable without the
  // column header. Used in the sprint-board table (BRDG-240).
  showMetricIcon?: boolean;
  // Replace the native title attribute with the styled Tooltip component.
  richTooltip?: boolean;
  // When the value is empty, keep the trigger hidden until the enclosing row is
  // hovered (or the popover is open/focused), so unscored rows stay calm. The
  // row must be a Tailwind group; revealGroup selects which named group to follow.
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
    popoverHeight: 64,
    onOpen: () => onOpenChange?.(true),
    onClose: () => onOpenChange?.(false),
  });

  // Keyboard shortcuts while open: 1-7 set a score, 0/- mark N/A, Backspace/Delete clear.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 7) { onChange(num); handleClose(); return; }
      if (e.key === "0" || e.key === "-") { onChange(0); handleClose(); return; }
      if (e.key === "Backspace" || e.key === "Delete") { onChange(null); handleClose(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onChange, handleClose]);

  const isLg = size === "lg";
  const isNA = value === 0;
  const color = value != null ? getBvColor(value) : null;
  // Empty BV still wears the violet family tone (BRDG-323) so the unscored "↗"
  // placeholder reads as the BV slot, not a generic grey button.
  const emptyTone = getBvColor(1);
  const showBg = !subtle || hovered || open;
  const displayLabel = value != null ? (isNA ? "-" : String(value)) : null;
  const titleText = isNA ? "N/A" : value != null ? `Business Value: ${value}` : "Set Business Value";

  const trigger = isLg ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => open ? handleClose() : handleOpen()}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          title={richTooltip ? undefined : titleText}
          aria-label={titleText}
          className="flex h-7 items-center gap-1.5 rounded-lg border border-transparent px-2.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:opacity-60"
          style={{
            color: color?.text ?? emptyTone.text,
            backgroundColor: color?.bg ?? emptyTone.bg,
            // Empty keeps the violet hue but sits a bit muted so it stays calm.
            opacity: value == null ? (hovered ? 0.8 : 0.6) : hovered ? 0.85 : 1,
            transition: "opacity 0.15s ease",
          }}
        >
          {showMetricIcon ? <TrendingUp size={13} strokeWidth={2} aria-hidden /> : <span className="text-[10px] font-semibold uppercase tracking-wider opacity-60">BV</span>}
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
          className={`flex items-center rounded-md border border-transparent cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:opacity-60 font-medium tabular-nums ${dense ? "h-5 text-[11px] leading-none" : "h-6 text-body-sm"} ${showMetricIcon ? "gap-1 px-1.5 min-w-[2.25rem] justify-start" : "min-w-[24px] justify-center"}`}
          style={{
            color: color?.text ?? emptyTone.text,
            backgroundColor: showBg ? (color?.bg ?? emptyTone.bg) : "transparent",
            // Empty placeholder keeps the violet hue but sits a bit muted so it stays calm.
            opacity: value == null ? (hovered ? 0.8 : 0.6) : hovered && showBg ? 0.85 : 1,
          }}
        >
          {showMetricIcon ? (
            // Always reserve the icon + value footprint so empty and filled cells
            // share one width and the column reads as a calm, aligned BV gutter.
            // Both scored and unset cells wear the flat violet tone; the unset cell
            // is just the glyph without a number.
            <>
              <TrendingUp size={dense ? 11 : 12} strokeWidth={2} aria-hidden />
              {displayLabel != null && displayLabel}
            </>
          ) : displayLabel != null ? (
            displayLabel
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-overlay-strong" />
          )}
        </button>
  );

  // Reveal-on-hover wrapper for empty cells. Opacity composites across the
  // nesting, so the wrapper hides the trigger regardless of its own inline
  // opacity. Stays visible while focused or while the popover is open.
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
          className="fixed z-[9999] rounded-lg border border-border-default p-1.5"
          style={getPopoverStyle()}
        >
          <div className="mb-2 px-0.5 text-[9px] font-semibold uppercase tracking-wider text-text-muted">
            Business value
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => { onChange(0); handleClose(); }} title="Not applicable" className="flex h-7 w-7 items-center justify-center rounded-md cursor-pointer transition-colors duration-100 hover:opacity-80 active:opacity-60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]" style={{ color: isNA ? "#fff" : "#555a64", backgroundColor: isNA ? "#555a64" : "color-mix(in srgb, #555a64 8%, transparent)", boxShadow: isNA ? "0 0 0 1px color-mix(in srgb, #555a64 40%, transparent)" : undefined }}>
              <Minus size={12} strokeWidth={1.5} />
            </button>

            {BV_SCORE_OPTIONS.map((n) => {
              const c = getBvColor(n);
              const isActive = n === value;
              return (
                <button key={n} type="button" onClick={() => { onChange(n); handleClose(); }} className="flex h-7 w-7 items-center justify-center rounded-md text-body-sm font-medium tabular-nums cursor-pointer transition-colors duration-100 hover:opacity-80 active:opacity-60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]" style={{ color: isActive ? "#fff" : c.text, backgroundColor: isActive ? c.solid : c.bg, boxShadow: isActive ? `0 0 0 1px color-mix(in srgb, ${c.solid} 40%, transparent)` : undefined }}>
                  {n}
                </button>
              );
            })}

            {value != null && (
              <button type="button" onClick={() => { onChange(null); handleClose(); }} title="Clear" className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted cursor-pointer hover:bg-overlay-default hover:text-text-secondary transition-colors duration-100 active:opacity-60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]">
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
