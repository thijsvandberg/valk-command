import type { ReactNode } from "react";

const VARIANT_CLASSES = {
  error: "border-red-500/20 bg-red-500/10 text-red-400",
  warning: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  info: "border-blue-500/20 bg-blue-500/10 text-blue-400",
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
