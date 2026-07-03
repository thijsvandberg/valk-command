"use client";

import { type ReactNode, type RefObject, type HTMLAttributes } from "react";
import { AnchoredPanel } from "@/components/shared/AnchoredPanel";

/**
 * Inline anchored panel: positioned `absolute top-full` inside the trigger's
 * relative container, with click-outside + ESC dismissal. Thin wrapper over
 * AnchoredPanel (BRDG-429), kept for its established API.
 */
interface PopoverProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: "left" | "right";
  offsetClass?: string;
  /** Counted as inside for outside-click, so clicking the trigger while open
   *  closes the panel instead of close-then-reopen. */
  triggerRef?: RefObject<HTMLElement | null>;
}

export function Popover({
  open,
  onClose,
  children,
  align = "right",
  offsetClass = "mt-1.5",
  className,
  triggerRef,
  ...rest
}: PopoverProps) {
  return (
    <AnchoredPanel
      open={open}
      onClose={onClose}
      portal={false}
      align={align}
      offsetClass={offsetClass}
      insideRefs={triggerRef ? [triggerRef] : undefined}
      className={className}
      {...rest}
    >
      {children}
    </AnchoredPanel>
  );
}
