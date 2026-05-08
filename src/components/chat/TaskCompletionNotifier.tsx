"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, notifications } from "@/lib/api-client";
import { CheckCircle2, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface AgentAlert {
  id: string;
  type: string;
  message: string;
  linkUrl: string | null;
  createdAt: string;
}

interface Toast {
  id: string;
  message: string;
  linkUrl: string | null;
}

const POLL_INTERVAL_MS = 15_000;

/**
 * Polls for agent task completion notifications and shows dismissible toasts.
 * Only shows toasts for notifications that arrive after the component mounts,
 * to avoid replaying old alerts on page load.
 */
export function TaskCompletionNotifier() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenIdsRef = useRef(new Set<string>());
  const initializedRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const data = await apiFetch<{ notifications: AgentAlert[] }>("/api/notifications?unread=true&limit=20");
        if (cancelled) return;
        const agentAlerts = data.notifications.filter((n) => n.type === "task-complete");

        if (!initializedRef.current) {
          // Seed seen IDs on first load to avoid notifying about old completions
          for (const alert of agentAlerts) {
            seenIdsRef.current.add(alert.id);
          }
          initializedRef.current = true;
          return;
        }

        for (const alert of agentAlerts) {
          if (seenIdsRef.current.has(alert.id)) continue;
          seenIdsRef.current.add(alert.id);

          setToasts((prev) => [
            ...prev,
            { id: alert.id, message: alert.message, linkUrl: alert.linkUrl },
          ]);

          // Mark as read so it doesn't appear on next poll
          notifications.markRead(alert.id).catch(() => {});
        }
      } catch {
        // Silently ignore poll errors
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-16 right-4 z-modal flex flex-col gap-2 pointer-events-none">
      {toasts.slice(-3).map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-[var(--color-brand-500)]/15 bg-[var(--color-surface-floating)]/95 px-3.5 py-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.4)] backdrop-blur-sm max-w-[320px]"
          role="alert"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-[var(--color-brand-400)]" strokeWidth={2} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-text-primary font-[var(--font-body)]">
              Task complete
            </p>
            <p className="text-label text-text-tertiary font-[var(--font-body)] truncate mt-0.5">
              {toast.message}
            </p>
          </div>
          <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
            {toast.linkUrl && (
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                icon={<ExternalLink className="h-3 w-3" strokeWidth={2} />}
                onClick={() => {
                  router.push(toast.linkUrl!);
                  dismiss(toast.id);
                }}
                className="text-[var(--color-brand-400)]/60 hover:text-[var(--color-brand-400)] border-0"
                aria-label="Go to conversation"
              />
            )}
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              icon={<X className="h-3.5 w-3.5" strokeWidth={2} />}
              onClick={() => dismiss(toast.id)}
              className="text-text-muted hover:text-text-secondary border-0"
              aria-label="Dismiss"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
