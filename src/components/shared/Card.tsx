import type { HTMLAttributes } from "react";

const VARIANT_CLASSES = {
  default: "rounded-xl border border-border-strong bg-white/[0.03]",
  subtle: "rounded-xl border border-border-subtle bg-white/[0.02]",
  floating:
    "rounded-xl border border-border-strong bg-[var(--color-surface-floating)] shadow-[0_8px_32px_rgba(0,0,0,0.5)]",
  dashed: "rounded-xl border border-dashed border-border-strong",
} as const;

type CardVariant = keyof typeof VARIANT_CLASSES;

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

export function Card({
  variant = "default",
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={`${VARIANT_CLASSES[variant]}${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {children}
    </div>
  );
}
