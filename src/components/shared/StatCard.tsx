import type { ReactNode } from "react";
import { Card } from "./Card";

// Accent tints are kept low-opacity so the radial glow reads as depth, not color.
const ACCENT_BG = {
  brand: "color-mix(in srgb, var(--color-brand-500) 6%, transparent)",
  emerald: "color-mix(in srgb, var(--color-secondary-400) 8%, transparent)",
  amber: "color-mix(in srgb, var(--color-status-caution) 8%, transparent)",
  red: "color-mix(in srgb, var(--color-status-error) 8%, transparent)",
} as const;

type StatAccent = keyof typeof ACCENT_BG;

interface StatCardProps {
  label: string;
  value: string;
  icon?: ReactNode;
  accent?: StatAccent;
  footer?: ReactNode;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon,
  accent = "brand",
  footer,
  className,
}: StatCardProps) {
  return (
    <Card className={`relative overflow-hidden px-4 py-3${className ? ` ${className}` : ""}`}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(ellipse at bottom right, ${ACCENT_BG[accent]}, transparent 70%)` }}
      />
      <div className="relative mb-1.5 flex items-center gap-1.5">
        {icon}
        <span className="text-label font-semibold uppercase tracking-wider text-text-muted font-[var(--font-body)]">
          {label}
        </span>
      </div>
      <div className="relative flex items-end justify-between gap-2">
        <span className="font-[var(--font-display)] text-heading font-bold tabular-nums tracking-tight text-text-primary">
          {value}
        </span>
        {footer && <div className="pb-0.5">{footer}</div>}
      </div>
    </Card>
  );
}
