"use client";

import type { ReactNode } from "react";
import { Check, Loader2, X } from "lucide-react";

// ---------------------------------------------------------------------------
// ToastCard: the one toast body (BRDG-430). Every toast in the app (the
// transient status toast, the sync/activity stack, the export cards) renders
// through this, so skin/anatomy changes happen in one place. Positioning
// (which fixed corner, stacking) stays with the caller; the layer is always
// z-notification.
// ---------------------------------------------------------------------------

export type ToastVariant = "success" | "error" | "warning" | "neutral";

const VARIANT_BORDER: Record<ToastVariant, string> = {
  success: "border-[var(--color-brand-500)]/15",
  error: "border-red-500/20",
  warning: "border-amber-500/20",
  neutral: "border-border-strong",
};

interface ToastCardProps {
  role?: "status" | "alert";
  variant?: ToastVariant;
  icon?: ReactNode;
  /** Renders the standard dismiss cross when provided. */
  onDismiss?: () => void;
  /** Extra right-aligned controls (e.g. retry), rendered before the cross. */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function ToastCard({
  role = "status",
  variant = "neutral",
  icon,
  onDismiss,
  actions,
  className,
  children,
}: ToastCardProps) {
  return (
    <div
      role={role}
      className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border ${VARIANT_BORDER[variant]} bg-surface-floating/95 px-3.5 py-2.5 shadow-md backdrop-blur-sm${className ? ` ${className}` : ""}`}
      style={{ animation: "fadeInUp 0.2s ease-out" }}
    >
      {icon && <span className="flex shrink-0 items-center mt-0.5">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
      {(actions || onDismiss) && (
        <div className="mt-0.5 flex shrink-0 items-center gap-0.5">
          {actions}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="ml-1 shrink-0 cursor-pointer text-text-muted hover:text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast: the transient status toast. Pair with `useToast`.
// ---------------------------------------------------------------------------

interface ToastProps {
  toast: ReactNode | null;
  loading?: boolean;
  onDismiss: () => void;
}

/**
 * Floating transient-feedback toast shared across views. Renders nothing when
 * there is no active toast, so callers can mount it unconditionally.
 */
export function Toast({ toast, loading = false, onDismiss }: ToastProps) {
  if (toast == null) return null;
  return (
    <div className="fixed right-6 bottom-6 z-notification pointer-events-none">
      <ToastCard
        role="status"
        variant={loading ? "neutral" : "success"}
        icon={
          loading
            ? <Loader2 className="h-4 w-4 animate-spin text-text-tertiary" strokeWidth={1.5} />
            : <Check className="h-4 w-4 text-[var(--color-brand-400)]" strokeWidth={1.5} />
        }
        onDismiss={loading ? undefined : onDismiss}
      >
        <span className="text-body-lg text-text-secondary">{toast}</span>
      </ToastCard>
    </div>
  );
}
