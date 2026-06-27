import type { ReactNode } from "react";

// Colors derive from the theme-aware --color-status-* tokens (BRDG-419) so a
// future status retune propagates here automatically. The `-subtle` fills are
// pre-tuned transparent mixes that composite over either light or dark surface.
const VARIANT_CLASSES = {
  error: "border-[var(--color-status-error)]/20 bg-[var(--color-status-error-subtle)] text-[var(--color-status-error)]",
  warning: "border-[var(--color-status-warning)]/20 bg-[var(--color-status-warning-subtle)] text-[var(--color-status-warning)]",
  info: "border-[var(--color-status-info)]/20 bg-[var(--color-status-info-subtle)] text-[var(--color-status-info)]",
} as const;

type AlertVariant = keyof typeof VARIANT_CLASSES;

interface InlineAlertProps {
  variant: AlertVariant;
  children: ReactNode;
  className?: string;
}

export function InlineAlert({
  variant,
  children,
  className,
}: InlineAlertProps) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-body-lg ${VARIANT_CLASSES[variant]}${className ? ` ${className}` : ""}`}
      role="alert"
    >
      {children}
    </div>
  );
}
