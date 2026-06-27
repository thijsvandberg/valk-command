"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { usePickerState } from "@/components/shared/BasePicker";
import { getSpColor } from "@/types/ticket";
import { Minus, X, Hash, Check, ArrowRight } from "lucide-react";
import { Tooltip } from "@/components/shared/Tooltip";

// Unified SP + guestimation control (BRDG-323, "pencil to ink"). Replaces the two
// separate StoryPointPicker / GuestimationPicker badges on a board row with ONE
// chip so an unscored row never reveals two near-identical "#" affordances on
// hover. The chip graduates through a lifecycle:
//
//   empty  ->  dashed PO guess  ->  solid committed SP
//
// A guess shares SP's slate tone, set apart only by a dashed inset border (the
// BRDG-321 "penciled in" look). Committing copies the guess into story points but
// KEEPS the guess as the guesstimate of record, so it can be reverted ("back to
// guesstimate (# N)"). The guess of record is the value the popover had when it
// opened, so adjusting then committing preserves the earlier guess instead of the
// value you replaced it with.
//
// planningMode off (no forward planning): the guess lifecycle is dropped and the
// control behaves as a plain story-point picker (solid chip or empty ghost).

const SP_PRESET_OPTIONS = [1, 2, 3, 5, 8] as const;
const SP_PRESET_SET = new Set<number>(SP_PRESET_OPTIONS);

// Slate tone shared by SP and the guess (theme-aware foreground + transparent tint).
const TONE = getSpColor(1);
const SLATE = TONE.solid;
const SLATE_FG = TONE.text;
const DASH_BORDER = `color-mix(in srgb, ${SLATE_FG} 45%, transparent)`;

export function EstimatePicker({
  storyPoints,
  guestimation,
  onStoryPointsChange,
  onGuestimationChange,
  planningMode = false,
  guessOnly = false,
  align = "right",
  dense = false,
  showMetricIcon = false,
  richTooltip = false,
  onOpenChange,
}: {
  storyPoints: number | null;
  guestimation: number | null;
  onStoryPointsChange: (v: number | null) => void;
  onGuestimationChange: (v: number | null) => void;
  // When off, the guess lifecycle is hidden and only story points are editable.
  planningMode?: boolean;
  // Pure-guess mode (BRDG-304 placeholders): the chip only ever sets a guestimation,
  // with no "commit to story points" affordance, since the row has no real SP and is
  // promoted into a ticket instead. Implies the guess phase regardless of storyPoints.
  guessOnly?: boolean;
  align?: "left" | "right";
  dense?: boolean;
  showMetricIcon?: boolean;
  richTooltip?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customInput, setCustomInput] = useState("");
  // Skips the guess phase for a fresh row: jump straight to story-point entry
  // without first setting a guestimate. Resets when the popover closes.
  const [skipToSp, setSkipToSp] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);

  // The guess that existed when the popover opened. Commit keeps THIS as the
  // guesstimate of record (null when started from empty, so a direct entry leaves
  // no phantom guess), instead of the value the working guess was changed to.
  const guessAtOpen = useRef<number | null>(null);

  const { open, pos, triggerRef, popoverRef, handleOpen, handleClose, getPopoverStyle } = usePickerState({
    portal: true,
    align,
    popoverHeight: 96,
    onOpen: () => onOpenChange?.(true),
    onClose: () => {
      setCustomMode(false);
      setCustomInput("");
      setSkipToSp(false);
      onOpenChange?.(false);
    },
  });

  // Guess phase while planning and no real SP yet; otherwise the story-point phase.
  // guessOnly forces the guess phase (placeholders never carry real story points).
  // skipToSp lets a fresh row bypass the guess and enter story points directly.
  const phase: "guess" | "sp" =
    (guessOnly || (planningMode && storyPoints == null)) && !skipToSp ? "guess" : "sp";
  const committed = phase === "sp";
  const activeValue = committed ? storyPoints : guestimation;

  const setValue = useCallback(
    (v: number | null) => {
      if (committed) {
        onStoryPointsChange(v);
        return;
      }
      onGuestimationChange(v);
      // An explicit clear in the guess phase drops the remembered guesstimate so a
      // later commit won't resurrect it.
      if (v == null) guessAtOpen.current = null;
    },
    [committed, onStoryPointsChange, onGuestimationChange],
  );

  const openPicker = useCallback(() => {
    guessAtOpen.current = guestimation ?? null;
    handleOpen();
  }, [guestimation, handleOpen]);

  const handleCustomSubmit = useCallback(() => {
    const parsed = parseInt(customInput, 10);
    if (parsed > 0 && parsed <= 999) setValue(parsed);
    setCustomMode(false);
    setCustomInput("");
  }, [customInput, setValue]);

  useEffect(() => {
    if (customMode && customInputRef.current) customInputRef.current.focus();
  }, [customMode]);

  // Keyboard entry while open: a preset key picks the value, 0/- marks N/A,
  // Backspace/Delete clears. The custom-number field only exists while customMode
  // is on, which this effect already guards against — so no focused-input check is
  // needed (and a blanket "any input focused" check would wrongly swallow keys
  // when an unrelated field elsewhere on the page holds focus).
  useEffect(() => {
    if (!open || customMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return;
      if (e.key === "Backspace" || e.key === "Delete") {
        setValue(null);
        return;
      }
      if (e.key === "0" || e.key === "-") {
        setValue(0);
        return;
      }
      const num = parseInt(e.key, 10);
      if (SP_PRESET_SET.has(num)) setValue(num);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, customMode, setValue]);

  const commit = useCallback(() => {
    const g = guestimation ?? null;
    onStoryPointsChange(g);
    // Keep the prior guess (the value at open), not the one we just committed.
    if (guessAtOpen.current !== g) onGuestimationChange(guessAtOpen.current);
    handleClose();
  }, [guestimation, onStoryPointsChange, onGuestimationChange, handleClose]);

  const backToGuess = useCallback(() => {
    onStoryPointsChange(null);
    handleClose();
  }, [onStoryPointsChange, handleClose]);

  // Trigger display: SP wins (solid), else a planning guess (dashed), else ghost.
  const spLabel = storyPoints != null ? (storyPoints === 0 ? "-" : String(storyPoints)) : null;
  const guessLabel = planningMode && guestimation != null ? (guestimation === 0 ? "-" : String(guestimation)) : null;
  const shown = spLabel != null ? { label: spLabel, dashed: false } : guessLabel != null ? { label: guessLabel, dashed: true } : null;
  const isCustomActive = activeValue != null && activeValue > 0 && !SP_PRESET_SET.has(activeValue);

  const titleText = shown
    ? shown.dashed
      ? guestimation === 0
        ? "Guestimate: N/A"
        : `Guestimate: ${guestimation}`
      : storyPoints === 0
        ? "Story Points: N/A"
        : `Story Points: ${storyPoints}`
    : planningMode
      ? "Set guestimate or story points"
      : "Set Story Points";

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        open ? handleClose() : openPicker();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={richTooltip ? undefined : titleText}
      aria-label={titleText}
      className={`flex items-center rounded-md border cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:opacity-60 font-medium tabular-nums ${dense ? "h-5 text-[11px] leading-none" : "h-6 text-body-sm"} ${showMetricIcon ? "gap-1 px-1.5 min-w-[2.25rem] justify-start" : "min-w-[24px] justify-center px-1"} ${shown?.dashed ? "border-dashed" : "border-transparent"}`}
      style={{
        // Carry the slate tone even when empty so the "#" reads as the SP/guess
        // slot, not a generic grey button (BRDG-323). A guess stays fill-less +
        // dashed; a committed/empty SP sits on the faint slate tint.
        color: SLATE_FG,
        backgroundColor: shown?.dashed ? "transparent" : TONE.bg,
        borderColor: shown?.dashed ? DASH_BORDER : "transparent",
        // Empty placeholder keeps the slate hue but sits a bit muted so it stays calm.
        opacity: shown ? (hovered ? 0.85 : 1) : hovered ? 0.8 : 0.6,
      }}
    >
      {showMetricIcon ? (
        <>
          <Hash size={dense ? 11 : 12} strokeWidth={2} aria-hidden />
          {shown?.label}
        </>
      ) : shown ? (
        shown.label
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-overlay-strong" />
      )}
    </button>
  );

  const btnSize = "h-7 w-7";
  // In guessOnly mode the "commit to story points" / "back to guess" actions are
  // suppressed: a placeholder is promoted into a ticket, not committed to SP.
  const showGuessActions = planningMode && !guessOnly;

  return (
    <span>
      {richTooltip ? <Tooltip content={titleText}>{trigger}</Tooltip> : trigger}

      {open &&
        pos &&
        createPortal(
          <div
            ref={popoverRef}
            className={`fixed z-[9999] rounded-lg border p-1.5 ${committed ? "border-border-default" : "border-dashed border-border-default"}`}
            style={{ ...getPopoverStyle(), width: 268 }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-baseline gap-1 px-0.5 text-[9px] font-semibold uppercase tracking-wider text-text-muted">
              <span>{committed ? "Story points" : "Guestimate"}</span>
              {/* Skip the guess entirely on a fresh row: jump straight to story-point
                  entry. Only offered while there is no guess yet to commit. */}
              {showGuessActions && !committed && guestimation == null && !customMode && (
                <button
                  type="button"
                  onClick={() => setSkipToSp(true)}
                  aria-label="skip to story points"
                  title="Skip to story points"
                  className="text-text-muted/60 transition-colors duration-100 hover:text-text-secondary cursor-pointer"
                >
                  / SP
                </button>
              )}
            </div>

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
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCustomSubmit();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      e.nativeEvent.stopImmediatePropagation();
                      setCustomMode(false);
                      setCustomInput("");
                    }
                  }}
                  placeholder="13"
                  className="h-7 w-16 rounded-md border border-border-default bg-surface-base px-2 text-center text-body-sm font-medium tabular-nums text-text-primary outline-none focus:border-[var(--color-brand-400)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onClick={handleCustomSubmit}
                  title="Set value"
                  className={`flex ${btnSize} items-center justify-center rounded-md cursor-pointer transition-[opacity] duration-100 hover:opacity-80 active:opacity-60`}
                  style={{ color: "#fff", background: SLATE }}
                >
                  <Check size={13} strokeWidth={2.2} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setValue(0)}
                  title="Not applicable"
                  className={`flex ${btnSize} items-center justify-center rounded-md cursor-pointer transition-colors duration-100 hover:opacity-80 active:opacity-60 ${committed ? "" : "border border-dashed"}`}
                  style={{
                    color: activeValue === 0 ? "#fff" : "#555a64",
                    backgroundColor: activeValue === 0 ? "#555a64" : "color-mix(in srgb, #555a64 8%, transparent)",
                    borderColor: committed ? undefined : activeValue === 0 ? "transparent" : "color-mix(in srgb, #555a64 35%, transparent)",
                  }}
                >
                  <Minus size={12} strokeWidth={1.5} />
                </button>

                {SP_PRESET_OPTIONS.map((n) => {
                  const isActive = n === activeValue;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setValue(n)}
                      className={`flex ${btnSize} items-center justify-center rounded-md text-body-sm font-semibold tabular-nums cursor-pointer transition-colors duration-100 hover:opacity-80 active:opacity-60 ${committed ? "" : "border border-dashed"}`}
                      style={{
                        color: isActive ? "#fff" : SLATE_FG,
                        backgroundColor: isActive ? SLATE : TONE.bg,
                        borderColor: committed ? undefined : isActive ? "transparent" : DASH_BORDER,
                      }}
                    >
                      {n}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => {
                    setCustomInput(isCustomActive ? String(activeValue) : "");
                    setCustomMode(true);
                  }}
                  title="Custom value (13, 21, ...)"
                  className={`flex ${btnSize} items-center justify-center rounded-md text-body-sm font-semibold tabular-nums cursor-pointer transition-colors duration-100 hover:opacity-80 active:opacity-60 ${!committed && !isCustomActive ? "border border-dashed" : ""}`}
                  style={{
                    color: isCustomActive ? "#fff" : SLATE_FG,
                    backgroundColor: isCustomActive ? SLATE : TONE.bg,
                    borderColor: committed ? undefined : isCustomActive ? "transparent" : DASH_BORDER,
                  }}
                >
                  {isCustomActive ? activeValue : <Hash size={11} strokeWidth={1.5} />}
                </button>

                <button
                  type="button"
                  onClick={() => setValue(null)}
                  disabled={activeValue == null}
                  title="Clear (not set)"
                  className={`flex ${btnSize} items-center justify-center rounded-md text-text-muted cursor-pointer transition-colors duration-100 hover:bg-overlay-default hover:text-text-secondary active:opacity-60 ${activeValue == null ? "opacity-30 pointer-events-none" : ""}`}
                >
                  <X size={13} strokeWidth={1.5} />
                </button>
              </div>
            )}

            {/* Commit a penciled guess into solid story points: the "ink" step.
                Kept light — a quiet brand-text action with an arrow showing what it
                becomes, not a filled button. */}
            {showGuessActions && !committed && guestimation != null && !customMode && (
              <button
                type="button"
                onClick={commit}
                className="group/commit mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors duration-100 hover:bg-[color-mix(in_srgb,var(--color-brand-500)_10%,transparent)] active:opacity-70 cursor-pointer"
                style={{ color: "var(--color-brand-400)" }}
              >
                Commit as story points
                <ArrowRight
                  size={12}
                  strokeWidth={2.2}
                  aria-hidden
                  className="transition-transform duration-100 group-hover/commit:translate-x-0.5"
                />
              </button>
            )}

            {/* Revert a committed SP back to the preserved prior guess. */}
            {showGuessActions && committed && guestimation != null && !customMode && (
              <div className="mt-1.5 flex justify-end border-t border-border-subtle pt-1.5 text-[10px] text-text-tertiary">
                <button
                  type="button"
                  onClick={backToGuess}
                  className="transition-colors duration-100 hover:text-text-secondary cursor-pointer"
                >
                  back to guestimate{" "}
                  <span className="font-semibold text-text-secondary">{guestimation === 0 ? "(N/A)" : `(# ${guestimation})`}</span>
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}
