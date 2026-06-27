"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { usePickerState } from "@/components/shared/BasePicker";
import { getSpColor } from "@/types/ticket";
import { Minus, X, Hash } from "lucide-react";
import { Tooltip } from "@/components/shared/Tooltip";

const SP_PRESET_OPTIONS = [1, 2, 3, 5, 8] as const;
const SP_PRESET_SET = new Set<number>(SP_PRESET_OPTIONS);

export function StoryPointPicker({
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
  // Show a leading gauge icon (effort/complexity) so SP is recognizable
  // without the column header. Used in the sprint-board table (BRDG-240).
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
  // Empty SP keeps the slate family tone (BRDG-323) so the placeholder badge reads
  // as SP everywhere it appears (refinement, ticket cards, detail), matching the
  // board chip, instead of a generic grey button.
  const emptyTone = getSpColor(1);
  const showBg = !subtle || hovered || open;
  const displayLabel = value != null ? (isNA ? "-" : String(value)) : null;
  const titleText = isNA ? "N/A" : value != null ? `Story Points: ${value}` : "Set Story Points";

  const btnSize = isLg ? "h-10 w-10" : "h-7 w-7";
  const btnText = isLg ? "text-body-lg font-semibold" : "text-body-sm font-medium";
  const iconSize = isLg ? 14 : 12;
  const popoverPadding = isLg ? "p-3" : "p-1.5";
  const customInputH = isLg ? "h-10 w-20" : "h-7 w-14";
  const customInputText = isLg ? "text-body-lg font-semibold" : "text-body-sm font-medium";

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
            // Empty keeps the slate hue but sits a bit muted so it stays calm.
            opacity: value == null ? (hovered ? 0.8 : 0.6) : hovered ? 0.85 : 1,
            transition: "opacity 0.15s ease",
          }}
        >
          {showMetricIcon ? <Hash size={13} strokeWidth={2} aria-hidden /> : <span className="text-[10px] font-semibold uppercase tracking-wider opacity-60">SP</span>}
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
            // Slate family tone (BRDG-321/323). Empty keeps the slate hue, a bit
            // muted, so the placeholder reads as SP. Subtle contexts stay neutral.
            color: subtle ? "var(--color-text-secondary)" : (color?.text ?? emptyTone.text),
            backgroundColor: showBg ? (subtle ? "var(--color-overlay-subtle)" : (color?.bg ?? emptyTone.bg)) : "transparent",
            opacity: !subtle && value == null ? (hovered ? 0.8 : 0.6) : hovered && showBg ? 0.85 : 1,
          }}
        >
          {showMetricIcon ? (
            // Always reserve the icon + value footprint so empty and filled cells
            // share one width and the column reads as a calm, aligned SP gutter.
            // The icon keeps the same size and color whether or not a value is set.
            <>
              <Hash size={dense ? 11 : 12} strokeWidth={2} aria-hidden />
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
          className={`fixed z-[9999] rounded-lg border border-border-default ${popoverPadding}`}
          style={getPopoverStyle()}
        >
          {isLg ? (
            <>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Story Points</div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => { onChange(0); handleClose(); }} title="Not applicable" className="flex h-10 w-10 items-center justify-center rounded-md cursor-pointer transition-colors duration-100 hover:opacity-80 active:opacity-60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]" style={{ color: isNA ? "#fff" : "#555a64", backgroundColor: isNA ? "#555a64" : "color-mix(in srgb, #555a64 8%, transparent)", boxShadow: isNA ? "0 0 0 1px color-mix(in srgb, #555a64 40%, transparent)" : undefined }}>
                  <Minus size={14} strokeWidth={1.5} />
                </button>
                {SP_PRESET_OPTIONS.map((n) => {
                  const c = getSpColor(n);
                  const isActive = n === value;
                  return (
                    <button key={n} type="button" onClick={() => { onChange(n); handleClose(); }} className="flex h-10 w-10 items-center justify-center rounded-md text-body-lg font-semibold tabular-nums cursor-pointer transition-colors duration-100 hover:opacity-80 active:opacity-60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]" style={{ color: isActive ? "#fff" : c.text, backgroundColor: isActive ? c.solid : c.bg, boxShadow: isActive ? `0 0 0 1px color-mix(in srgb, ${c.solid} 40%, transparent)` : undefined }}>
                      {n}
                    </button>
                  );
                })}
                <input ref={lgCustomInputRef} type="number" min="1" max="999" value={lgCustomInput} onChange={(e) => setLgCustomInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleLgCustomSubmit(); } if (e.key === "Escape") { e.preventDefault(); handleClose(); } }} placeholder="#" className="h-10 w-10 rounded-md border border-border-default bg-surface-base text-center text-body-lg font-medium tabular-nums text-text-primary placeholder:text-text-muted outline-none focus:border-[var(--color-brand-400)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" style={{ transition: "border-color 0.15s ease" }} />
                <button type="button" onClick={() => { onChange(null); handleClose(); }} title="Clear story points" className={`flex h-10 w-10 items-center justify-center rounded-md text-text-muted cursor-pointer hover:bg-overlay-default hover:text-text-secondary transition-colors duration-100 active:opacity-60 ${value == null ? "opacity-30 pointer-events-none" : ""} focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`} disabled={value == null}>
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>
            </>
          ) : customMode ? (
            <div className="flex items-center gap-1">
              <input ref={customInputRef} type="number" min="1" max="999" value={customInput} onChange={(e) => setCustomInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCustomSubmit(); } if (e.key === "Escape") { e.preventDefault(); e.nativeEvent.stopImmediatePropagation(); setCustomMode(false); setCustomInput(""); } }} placeholder="SP" className={`${customInputH} rounded-md border border-border-default bg-surface-base px-2 text-center ${customInputText} tabular-nums text-text-primary outline-none focus:border-[var(--color-brand-400)]`} />
              <button type="button" onClick={handleCustomSubmit} className={`flex ${btnSize} items-center justify-center rounded-md text-text-muted cursor-pointer hover:bg-overlay-default hover:text-text-secondary transition-colors duration-100 active:opacity-60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}>
                <Hash size={iconSize} strokeWidth={1.5} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => { onChange(0); handleClose(); }} title="Not applicable" className={`flex ${btnSize} items-center justify-center rounded-md cursor-pointer transition-colors duration-100 hover:opacity-80 active:opacity-60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`} style={{ color: isNA ? "#fff" : "#555a64", backgroundColor: isNA ? "#555a64" : "color-mix(in srgb, #555a64 8%, transparent)", boxShadow: isNA ? "0 0 0 1px color-mix(in srgb, #555a64 40%, transparent)" : undefined }}>
                <Minus size={iconSize} strokeWidth={1.5} />
              </button>
              {SP_PRESET_OPTIONS.map((n) => {
                const c = getSpColor(n);
                const isActive = n === value;
                return (
                  <button key={n} type="button" onClick={() => { onChange(n); handleClose(); }} className={`flex ${btnSize} items-center justify-center rounded-md ${btnText} tabular-nums cursor-pointer transition-colors duration-100 hover:opacity-80 active:opacity-60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`} style={{ color: isActive ? "#fff" : c.text, backgroundColor: isActive ? c.solid : c.bg, boxShadow: isActive ? `0 0 0 1px color-mix(in srgb, ${c.solid} 40%, transparent)` : undefined }}>
                    {n}
                  </button>
                );
              })}
              <button type="button" onClick={() => setCustomMode(true)} title="Custom value" className={`flex ${btnSize} items-center justify-center rounded-md cursor-pointer transition-colors duration-100 hover:opacity-80 active:opacity-60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`} style={{ color: isCustomValue ? "#fff" : "var(--color-text-muted)", backgroundColor: isCustomValue ? (color?.solid ?? "var(--color-overlay-default)") : "var(--color-overlay-subtle)", boxShadow: isCustomValue ? `0 0 0 1px color-mix(in srgb, ${color?.solid ?? "var(--color-text-muted)"} 40%, transparent)` : undefined }}>
                <Hash size={11} strokeWidth={1.5} />
              </button>
              <button type="button" onClick={() => { onChange(null); handleClose(); }} title="Clear story points" className={`flex ${btnSize} items-center justify-center rounded-md text-text-muted cursor-pointer hover:bg-overlay-default hover:text-text-secondary transition-colors duration-100 active:opacity-60 ${value == null ? "opacity-30 pointer-events-none" : ""} focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`} disabled={value == null}>
                <X size={iconSize} strokeWidth={1.5} />
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </span>
  );
}
