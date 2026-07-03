"use client";

import Link from "next/link";
import { CheckCircle2, AlertTriangle, RotateCw, ArrowRight } from "lucide-react";
import { useActivityContext } from "@/contexts/ActivityContext";
import { Button } from "@/components/ui/Button";
import { ToastCard } from "@/components/ui/Toast";
import { mapPushErrorMessage } from "@/lib/push-error-message";
import { friendlyErrorDetail } from "@/lib/agent-errors";

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
    <div className="fixed bottom-4 right-4 z-notification flex flex-col gap-2 pointer-events-none">
      {visibleToasts.map((toast) => {
        // Push failures carry the raw Jira reason; map it to clean toast copy
        // (without the "Trim it" instruction) and link to the Bridge ticket so the
        // PO can jump back to it (BRDG-349). `scope` holds the issue key.
        const isPush = toast.entry.type === "push-to-jira";
        const ticketKey = isPush ? toast.entry.scope : null;
        return (
        <ToastItem
          key={toast.id}
          id={toast.id}
          status={toast.entry.status}
          summary={toast.entry.summary}
          error={isPush ? mapPushErrorMessage(toast.entry.errorDetail, { short: true }) : friendlyErrorDetail(toast.entry.errorDetail)}
          link={ticketKey ? { href: `/tickets/${encodeURIComponent(ticketKey)}`, label: `Open ${ticketKey}` } : undefined}
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

// Rendered through the shared ToastCard (BRDG-430); this keeps only the
// sync-specific copy (status title, error mapping, ticket link, retry).
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
  const isError = status === "failed";
  const isCancelled = status === "cancelled";

  return (
    <ToastCard
      role="alert"
      variant={isError ? "warning" : "success"}
      icon={
        isError
          ? <AlertTriangle className="h-4 w-4 text-amber-400" strokeWidth={2} />
          : <CheckCircle2 className="h-4 w-4 text-[var(--color-brand-400)]" strokeWidth={2} />
      }
      onDismiss={onDismiss}
      actions={
        retryable && onRetry ? (
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={<RotateCw className="h-3 w-3" strokeWidth={2} />}
            onClick={onRetry}
            className="text-amber-400/60 hover:text-amber-400 border-0"
            aria-label="Retry"
          />
        ) : undefined
      }
      className="max-w-[340px]"
    >
      <p className="text-body-sm font-medium text-text-primary font-[var(--font-body)]">
        {isError ? "Action failed" : isCancelled ? "Action cancelled" : "Action complete"}
      </p>
      <p className="text-label text-text-tertiary font-[var(--font-body)] line-clamp-2 mt-0.5">
        {isError ? (error ?? "Unknown error") : isCancelled ? "Cancelled by user" : (summary ?? "Done")}
      </p>
      {isError && link && (
        <Link
          href={link.href}
          className="mt-1.5 inline-flex items-center gap-1 text-label font-medium text-[var(--color-brand-400)] underline-offset-2 transition-colors duration-150 hover:text-[var(--color-brand-300)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-500)]/50"
        >
          {link.label}
          <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </Link>
      )}
    </ToastCard>
  );
}
