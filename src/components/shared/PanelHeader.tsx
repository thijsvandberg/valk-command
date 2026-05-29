import type { ReactNode } from "react";

interface PanelHeaderProps {
  icon?: ReactNode;
  label: string;
  tone?: "default" | "warning";
  meta?: ReactNode;
  className?: string;
}

// Shared header for the icon + uppercase-label panels (recurring failures,
// timeline, etc.) so every panel uses the same typographic rhythm.
export function PanelHeader({
  icon,
  label,
  tone = "default",
  meta,
  className,
}: PanelHeaderProps) {
  const toneColor = tone === "warning" ? "text-amber-400/70" : "text-text-muted";
  return (
    <div className={`flex items-center gap-2${className ? ` ${className}` : ""}`}>
      {icon && <span className={`flex items-center ${toneColor}`}>{icon}</span>}
      <span className={`text-label font-semibold uppercase tracking-wider font-[var(--font-body)] ${toneColor}`}>
        {label}
      </span>
      {meta && <div className="ml-auto flex items-center">{meta}</div>}
    </div>
  );
}
