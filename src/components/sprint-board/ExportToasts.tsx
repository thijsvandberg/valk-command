"use client";

import { useRouter } from "next/navigation";
import { Check, AlertTriangle, Copy as CopyIcon, ExternalLink } from "lucide-react";
import { ToastCard } from "@/components/ui/Toast";

interface ExportToastsProps {
  status: string;
  output: string | null;
  error: string | null;
  conversationId: string | null;
  dismiss: () => void;
  showToast: (message: React.ReactNode) => void;
}

// Rendered through the shared ToastCard (BRDG-430); only the export-specific
// content and the bottom-16 offset (above the standard toast, which shows the
// "Copied" confirmation at bottom-6) live here.
export function ExportToasts({ status, output, error, conversationId, dismiss, showToast }: ExportToastsProps) {
  const router = useRouter();

  if (status === "completed" && output) {
    return (
      <div className="fixed right-6 bottom-16 z-notification pointer-events-none">
        <ToastCard
          role="alert"
          variant="success"
          icon={<Check className="h-4 w-4 text-[var(--color-brand-400)]" strokeWidth={2} />}
          onDismiss={dismiss}
          className="max-w-sm"
        >
          <p className="text-body-sm font-medium text-text-primary">Stakeholder export ready</p>
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={() => { navigator.clipboard.writeText(output).then(() => showToast("Copied to clipboard")).catch(() => showToast("Failed to copy")); }} className="flex items-center gap-1.5 rounded-md border border-[var(--color-brand-500)]/20 bg-[var(--color-brand-500)]/10 px-2.5 py-1 text-body-sm font-medium text-[var(--color-brand-300)] cursor-pointer hover:bg-[var(--color-brand-500)]/15 active:bg-[var(--color-brand-500)]/20 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]">
              <CopyIcon className="h-3 w-3" strokeWidth={2} />Copy to clipboard
            </button>
            <button type="button" onClick={() => { if (conversationId) router.push(`/chat/${conversationId}`); dismiss(); }} className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-body-sm text-text-tertiary cursor-pointer hover:text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]">
              <ExternalLink className="h-3 w-3" strokeWidth={2} />View in chat
            </button>
          </div>
        </ToastCard>
      </div>
    );
  }

  if (status === "failed" && error) {
    return (
      <div className="fixed right-6 bottom-16 z-notification pointer-events-none">
        <ToastCard
          role="alert"
          variant="error"
          icon={<AlertTriangle className="h-4 w-4 text-red-400" strokeWidth={2} />}
          onDismiss={dismiss}
          className="max-w-sm"
        >
          <p className="text-body-sm font-medium text-text-primary">Export failed</p>
          <p className="text-label text-text-tertiary mt-0.5">{error}</p>
        </ToastCard>
      </div>
    );
  }

  return null;
}
