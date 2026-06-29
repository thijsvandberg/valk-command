"use client";

import { Check, Loader2, X } from "lucide-react";

interface ToastProps {
  toast: React.ReactNode | null;
  loading?: boolean;
  onDismiss: () => void;
}

/**
 * Floating transient-feedback toast shared across views. Pair with `useToast`.
 * Renders nothing when there is no active toast, so callers can mount it
 * unconditionally.
 */
export function Toast({ toast, loading = false, onDismiss }: ToastProps) {
  if (toast == null) return null;
  return (
    <div role="status" className="pointer-events-auto fixed right-6 bottom-6 z-notification flex items-center gap-2 rounded-lg border border-border-strong bg-surface-floating px-4 py-2.5 shadow-lg" style={{ animation: "fadeInUp 0.2s ease-out" }}>
      {loading
        ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-text-tertiary" strokeWidth={1.5} />
        : <Check className="h-4 w-4 shrink-0 text-[var(--color-brand-400)]" strokeWidth={1.5} />}
      <span className="text-body-lg text-text-secondary">{toast}</span>
      {!loading && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="ml-1 shrink-0 cursor-pointer text-text-muted hover:text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"><X className="h-3.5 w-3.5" strokeWidth={2} /></button>
      )}
    </div>
  );
}
