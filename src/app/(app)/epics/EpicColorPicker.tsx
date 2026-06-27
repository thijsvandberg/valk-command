"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, RotateCcw } from "lucide-react";
import { EPIC_PALETTE, deriveEpicColor } from "@/lib/epic-palette";
import { getEpicColor } from "@/types/ticket";
import { useSetEpicColor } from "@/hooks/useEpics";
import { usePickerState } from "@/components/shared/BasePicker";

interface EpicColorPickerProps {
  epicKey: string;
  name: string;
  color: string | null;
}

export function EpicColorPicker({ epicKey, name, color }: EpicColorPickerProps) {
  const setColor = useSetEpicColor();
  // Portal mode so the menu escapes the epic row's `overflow-hidden` clip.
  const { open, triggerRef, popoverRef, handleOpen, handleClose, getPopoverStyle } =
    usePickerState({ portal: true, align: "right", popoverHeight: 180 });

  // Optimistic override: undefined = no pending write, otherwise the value being
  // written (null = reset). Cleared once the write settles and the prop catches up.
  const [pending, setPending] = useState<string | null | undefined>(undefined);

  const current = pending === undefined ? color : pending;
  // Effective swatch shown on the trigger: the chosen color, or the derived default.
  const effective = current ? deriveEpicColor(current) : getEpicColor(name);

  async function commit(next: string | null) {
    setPending(next);
    handleClose();
    try {
      await setColor(epicKey, name, next);
    } finally {
      setPending(undefined);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          open ? handleClose() : handleOpen();
        }}
        aria-haspopup="menu"
        aria-label={current ? "Change epic color" : "Set epic color"}
        title={current ? "Change epic color" : "Set epic color"}
        className="group/color flex shrink-0 items-center rounded-md p-1.5 cursor-pointer transition-colors duration-150 hover:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
      >
        <span
          className="h-3.5 w-3.5 rounded-full border transition-transform duration-150 group-hover/color:scale-110"
          style={{ backgroundColor: effective.bg, borderColor: effective.text }}
        />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            role="menu"
            className="fixed z-[9999] w-[180px] overflow-hidden rounded-lg border border-border-strong py-2"
            style={getPopoverStyle()}
          >
            <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Epic color
            </div>
            <div className="grid grid-cols-5 gap-1.5 px-3 pb-1">
              {EPIC_PALETTE.map((swatch) => {
                const selected = current === swatch.base;
                return (
                  <button
                    key={swatch.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    aria-label={swatch.label}
                    title={swatch.label}
                    onClick={() => commit(swatch.base)}
                    className="flex h-6 w-6 items-center justify-center rounded-full transition-transform duration-150 cursor-pointer hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
                    style={{
                      backgroundColor: swatch.base,
                      boxShadow: selected ? `0 0 0 2px var(--color-surface-floating), 0 0 0 3.5px ${swatch.base}` : undefined,
                    }}
                  >
                    {selected && <Check size={13} strokeWidth={3} className="text-white" />}
                  </button>
                );
              })}
            </div>
            {current && (
              <>
                <div className="mx-3 my-1.5 border-t border-border-default" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => commit(null)}
                  className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-body-sm text-text-tertiary cursor-pointer transition-colors duration-150 hover:bg-hover-list-item hover:text-text-secondary"
                >
                  <RotateCcw size={12} strokeWidth={2} />
                  Reset to default
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
