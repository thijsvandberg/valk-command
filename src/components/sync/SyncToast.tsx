"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2, AlertTriangle, X, RotateCw, ExternalLink } from "lucide-react";
import { useActivityContext } from "@/contexts/ActivityContext";
import { Button } from "@/components/ui/Button";
import { mapPushErrorMessage } from "@/lib/push-error-message";
import { getJiraUrl } from "@/lib/jira-url";

export function ActivityToast() {
  const { toasts, dismissToast, acknowledgeError, retryEntry } = useActivityContext();

  const isRefinement = typeof document !== "undefined" && document.body.classList.contains("refinement-session-active");

  // In refinement sessions, only show error/failed toasts to reduce distraction
  const filteredToasts = isRefinement
    ? toasts.filter((t) => t.entry.status === "failed")
    : toasts;

  const visibleToasts = filteredToasts.slice(-5);

  if (visibleToasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-modal flex flex-col gap-2 pointer-events-none">
      {visibleToasts.map((toast) => {
        // Push failures carry the raw Jira reason; map it to clean toast copy
        // (without the "Trim it" instruction) and link straight to the ticket so
        // the PO can open it in Jira (BRDG-349). `scope` holds the issue key.
        const isPush = toast.entry.type === "push-to-jira";
        const ticketKey = isPush ? toast.entry.scope : null;
        return (
        <ToastItem
          key={toast.id}
          id={toast.id}
          status={toast.entry.status}
          summary={toast.entry.summary}
          error={isPush ? mapPushErrorMessage(toast.entry.errorDetail, { short: true }) : toast.entry.errorDetail}
          link={ticketKey ? { href: getJiraUrl(ticketKey), label: `Open ${ticketKey} in Jira` } : undefined}
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
        );
      })}
    </div>
  );
}

function ToastItem({
  id,
  status,
  summary,
  error,
  link,
  retryable,
  onRetry,
  onDismiss,
}: {
  id: string;
  status: "success" | "failed" | "running" | "cancelled";
  summary: string | null;
  error: string | null;
  link?: { href: string; label: string };
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
      className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 shadow-[var(--shadow-md)] backdrop-blur-sm max-w-[340px] ${
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
        <p className="text-body-sm font-medium text-text-primary font-[var(--font-body)]">
          {isError ? "Action failed" : isCancelled ? "Action cancelled" : "Action complete"}
        </p>
        <p className="text-label text-text-tertiary font-[var(--font-body)] line-clamp-2 mt-0.5">
          {isError ? (error ?? "Unknown error") : isCancelled ? "Cancelled by user" : (summary ?? "Done")}
        </p>
        {isError && link && (
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-flex items-center gap-1 text-label font-medium text-[var(--color-brand-400)] underline-offset-2 transition-colors duration-150 hover:text-[var(--color-brand-300)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-500)]/50"
          >
            {link.label}
            <ExternalLink className="h-3 w-3" strokeWidth={2} />
          </a>
        )}
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
          className="text-text-muted hover:text-text-secondary border-0"
          aria-label="Dismiss"
        />
      </div>
    </div>
  );
}
