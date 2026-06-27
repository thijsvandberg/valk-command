import type { HTMLAttributes, ReactNode } from "react";

// Status variants derive from the --color-status-* tokens (BRDG-419); the
// `-subtle` fills are pre-tuned per theme. `brand` stays on the brand accent
// (not a status meaning).
const VARIANT_CLASSES = {
  default: "bg-overlay-default text-text-tertiary",
  brand: "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)]",
  success: "bg-[var(--color-status-success-subtle)] text-[var(--color-status-success)]",
  warning: "bg-[var(--color-status-warning-subtle)] text-[var(--color-status-warning)]",
  danger: "bg-[var(--color-status-error-subtle)] text-[var(--color-status-error)]",
} as const;

const SIZE_CLASSES = {
  sm: "h-4 min-w-4 px-1 text-caption",
  md: "h-5 min-w-5 px-1.5 text-caption",
} as const;

type BadgeVariant = keyof typeof VARIANT_CLASSES;
type BadgeSize = keyof typeof SIZE_CLASSES;

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: ReactNode;
}

export function Badge({
  variant = "default",
  size = "md",
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold tabular-nums leading-none ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]}${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {children}
    </span>
  );
}
