import type { ReactNode, HTMLAttributes } from "react";

// Colors derive from app tokens, not the raw Tailwind palette (BRDG-419). The
// status-meaning colors map onto --color-status-* (blue->info, amber->warning,
// red->error); `purple` (the "AI" content tag) has no status equivalent, so it
// routes through the app's single defined purple token (--color-icon-epic).
const COLOR_CLASSES = {
  brand: "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)]",
  blue: "bg-[var(--color-status-info-subtle)] text-[var(--color-status-info)]",
  purple: "bg-[var(--color-icon-epic)]/15 text-[var(--color-icon-epic)]",
  amber: "bg-[var(--color-status-warning-subtle)] text-[var(--color-status-warning)]",
  red: "bg-[var(--color-status-error-subtle)] text-[var(--color-status-error)]",
  neutral: "bg-overlay-default text-text-tertiary",
} as const;

type TagColor = keyof typeof COLOR_CLASSES;

interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  color?: TagColor;
  children: ReactNode;
}

export function Tag({
  color = "neutral",
  className,
  children,
  ...rest
}: TagProps) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-caption font-medium ${COLOR_CLASSES[color]}${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {children}
    </span>
  );
}
