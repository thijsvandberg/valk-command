"use client";

import { useRouter } from "next/navigation";
import { Check, AlertTriangle, Copy as CopyIcon, ExternalLink, X } from "lucide-react";

interface ExportToastsProps {
  status: string;
  output: string | null;
  error: string | null;
  conversationId: string | null;
  dismiss: () => void;
  showToast: (message: React.ReactNode) => void;
}

export function ExportToasts({ status, output, error, conversationId, dismiss, showToast }: ExportToastsProps) {
  const router = useRouter();

  if (status === "completed" && output) {
    return (
      <div role="alert" className="pointer-events-auto fixed right-6 bottom-16 z-50 flex flex-col gap-2 rounded-lg border border-[var(--color-brand-500)]/20 bg-surface-floating/95 px-4 py-3 shadow-lg backdrop-blur-sm max-w-sm" style={{ animation: "fadeInUp 0.2s ease-out" }}>
        <div className="flex items-start gap-2.5">
          <Check className="h-4 w-4 shrink-0 mt-0.5 text-[var(--color-brand-400)]" strokeWidth={2} />
          <div className="flex-1 min-w-0"><p className="text-body-sm font-medium text-text-primary">Stakeholder export ready</p></div>
          <button type="button" onClick={dismiss} className="shrink-0 text-text-muted hover:text-text-secondary cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]" aria-label="Dismiss"><X className="h-3.5 w-3.5" strokeWidth={2} /></button>
        </div>
        <div className="flex items-center gap-2 pl-6.5">
          <button type="button" onClick={() => { navigator.clipboard.writeText(output).then(() => showToast("Copied to clipboard")).catch(() => showToast("Failed to copy")); }} className="flex items-center gap-1.5 rounded-md border border-[var(--color-brand-500)]/20 bg-[var(--color-brand-500)]/10 px-2.5 py-1 text-body-sm font-medium text-[var(--color-brand-300)] cursor-pointer hover:bg-[var(--color-brand-500)]/15 active:bg-[var(--color-brand-500)]/20 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]">
            <CopyIcon className="h-3 w-3" strokeWidth={2} />Copy to clipboard
          </button>
          <button type="button" onClick={() => { if (conversationId) router.push(`/chat/${conversationId}`); dismiss(); }} className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-body-sm text-text-tertiary cursor-pointer hover:text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]">
            <ExternalLink className="h-3 w-3" strokeWidth={2} />View in chat
          </button>
        </div>
      </div>
    );
  }

  if (status === "failed" && error) {
    return (
      <div role="alert" className="pointer-events-auto fixed right-6 bottom-16 z-50 flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-surface-floating/95 px-4 py-3 shadow-lg backdrop-blur-sm max-w-sm" style={{ animation: "fadeInUp 0.2s ease-out" }}>
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" strokeWidth={2} />
        <div className="flex-1 min-w-0"><p className="text-body-sm font-medium text-text-primary">Export failed</p><p className="text-label text-text-tertiary mt-0.5">{error}</p></div>
        <button type="button" onClick={dismiss} className="shrink-0 text-text-muted hover:text-text-secondary cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]" aria-label="Dismiss"><X className="h-3.5 w-3.5" strokeWidth={2} /></button>
      </div>
    );
  }

  return null;
}
