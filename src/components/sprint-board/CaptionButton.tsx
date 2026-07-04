"use client";

import type { ReactNode } from "react";

interface CaptionButtonProps {
  children: ReactNode;
  onClick: () => void;
  /** "chip" carries a subtle base fill (segmented control); "ghost" is flat. */
  variant?: "ghost" | "chip";
  /** Brand-tinted selected state (e.g. the active version chip). */
  active?: boolean;
  disabled?: boolean;
  title?: string;
  className?: string;
  "data-testid"?: string;
}

// One caption-sized text button for the test-doc toolbars (version chips, the
// Compare / Edit toggles, the bundle's per-block Edit). Centralises the
// hover / focus-visible / active states so every small control behaves the
// same — the pressed state uses a transform (matching the Button primitive),
// never a colour-only cue.
const BASE =
  "cursor-pointer rounded-md px-2 py-0.5 text-caption font-medium transition-colors duration-150 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] disabled:cursor-default disabled:opacity-45 disabled:pointer-events-none";
const ACTIVE = "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] ring-1 ring-[var(--color-brand-500)]/30";
const INACTIVE = "text-text-tertiary hover:bg-overlay-default hover:text-text-secondary";
const CHIP_FILL = "bg-overlay-subtle";

export function CaptionButton({
  children,
  onClick,
  variant = "ghost",
  active = false,
  disabled = false,
  title,
  className,
  ...rest
}: CaptionButtonProps) {
  const tone = active ? ACTIVE : `${variant === "chip" ? `${CHIP_FILL} ` : ""}${INACTIVE}`;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${BASE} ${tone}${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {children}
    </button>
  );
}
