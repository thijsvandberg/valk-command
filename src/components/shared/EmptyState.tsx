import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center${className ? ` ${className}` : ""}`}
    >
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-surface-floating)] border border-border-default shadow-[0_4px_16px_rgba(0,0,0,0.2)]">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-text-tertiary">{title}</p>
      {description && (
        <p className="mt-1 text-xs text-text-muted">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
