import type { ReactNode, HTMLAttributes } from "react";

const COLOR_CLASSES = {
  brand: "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)]",
  blue: "bg-blue-500/15 text-blue-400",
  purple: "bg-purple-500/15 text-purple-400",
  amber: "bg-amber-500/15 text-amber-400",
  red: "bg-red-500/15 text-red-400",
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
