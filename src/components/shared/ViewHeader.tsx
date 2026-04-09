import type { ReactNode } from "react";

interface ViewHeaderProps {
  icon: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function ViewHeader({ icon, children, actions, className }: ViewHeaderProps) {
  return (
    <div className={`relative flex items-center justify-between border-b border-white/[0.06] bg-[var(--color-surface-elevated)]/60 px-5 py-3.5${className ? ` ${className}` : ""}`}>
      <div className="pointer-events-none absolute left-0 top-0 h-full w-64 bg-[radial-gradient(ellipse_at_left_center,rgba(26,111,194,0.06)_0%,transparent_70%)]" />
      <div className="relative flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-500)]/20 shadow-[0_2px_12px_rgba(26,111,194,0.20),inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-[var(--color-brand-500)]/25">
          {icon}
        </div>
        {children}
      </div>
      {actions && (
        <div className="relative flex items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

export function ViewHeaderTitle({ children }: { children: ReactNode }) {
  return (
    <span className="font-[var(--font-display)] text-[15px] font-semibold tracking-tight text-white/90">
      {children}
    </span>
  );
}

export function ViewHeaderDivider() {
  return <div className="h-6 w-px shrink-0 bg-gradient-to-b from-transparent via-white/[0.12] to-transparent" />;
}
