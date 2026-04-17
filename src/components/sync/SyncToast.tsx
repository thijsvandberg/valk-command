"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2, AlertTriangle, X, RotateCw } from "lucide-react";
import { useActivityContext } from "@/contexts/ActivityContext";
import { Button } from "@/components/ui/Button";

export function ActivityToast() {
  const { toasts, dismissToast, acknowledgeError, retryEntry } = useActivityContext();

  const visibleToasts = toasts.slice(-5);

  if (visibleToasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-modal flex flex-col gap-2 pointer-events-none">
      {visibleToasts.map((toast) => (
        <ToastItem
          key={toast.id}
          id={toast.id}
          status={toast.entry.status}
          summary={toast.entry.summary}
          error={toast.entry.errorDetail}
          retryable={toast.entry.status === "failed" && ["sprint-sync", "ticket-sync", "comment-sync", "incremental-sync"].includes(toast.entry.type)}
          onRetry={() => retryEntry(toast.id)}
          onDismiss={() => {
            if (toast.entry.status === "failed") {
              acknowledgeError(toast.id);
            } else {
              dismissToast(toast.id);
            }
          }}
        />
      ))}
    </div>
  );
}

function ToastItem({
  id,
  status,
  summary,
  error,
  retryable,
  onRetry,
  onDismiss,
}: {
  id: string;
  status: "success" | "failed" | "running" | "cancelled";
  summary: string | null;
  error: string | null;
  retryable?: boolean;
  onRetry?: () => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.opacity = "0";
    el.style.transform = "translateY(8px) scale(0.97)";
    requestAnimationFrame(() => {
      el.style.transition = "opacity 200ms ease-out, transform 200ms ease-out";
      el.style.opacity = "1";
      el.style.transform = "translateY(0) scale(1)";
    });
  }, []);

  const isError = status === "failed";
  const isCancelled = status === "cancelled";

  return (
    <div
      ref={ref}
      className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.4)] backdrop-blur-sm max-w-[340px] ${
        isError
          ? "border-amber-500/20 bg-[var(--color-surface-floating)]/95"
          : "border-[var(--color-brand-500)]/15 bg-[var(--color-surface-floating)]/95"
      }`}
      role="alert"
    >
      {isError ? (
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" strokeWidth={2} />
      ) : (
        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-[var(--color-brand-400)]" strokeWidth={2} />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white/80 font-[var(--font-body)]">
          {isError ? "Action failed" : isCancelled ? "Action cancelled" : "Action complete"}
        </p>
        <p className="text-label text-white/40 font-[var(--font-body)] truncate mt-0.5">
          {isError ? (error ?? "Unknown error") : isCancelled ? "Cancelled by user" : (summary ?? "Done")}
        </p>
      </div>
      <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
        {retryable && onRetry && (
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={<RotateCw className="h-3 w-3" strokeWidth={2} />}
            onClick={onRetry}
            className="text-amber-400/60 hover:text-amber-400 border-0"
            aria-label="Retry"
          />
        )}
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon={<X className="h-3.5 w-3.5" strokeWidth={2} />}
          onClick={onDismiss}
          className="text-white/20 hover:text-white/50 border-0"
          aria-label="Dismiss"
        />
      </div>
    </div>
  );
}
