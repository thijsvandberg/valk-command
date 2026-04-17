import type { HTMLAttributes, ReactNode } from "react";

const VARIANT_CLASSES = {
  default: "bg-white/[0.06] text-white/40",
  brand: "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)]",
  success: "bg-emerald-500/15 text-emerald-400",
  warning: "bg-amber-500/15 text-amber-400",
  danger: "bg-red-500/15 text-red-400",
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
