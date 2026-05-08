import type { HTMLAttributes } from "react";

const VARIANT_CLASSES = {
  default: "rounded-xl border border-border-strong bg-overlay-subtle",
  subtle: "rounded-xl border border-border-subtle bg-overlay-subtle",
  floating:
    "rounded-xl border border-border-strong bg-[var(--color-surface-floating)] shadow-[var(--shadow-lg)]",
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
