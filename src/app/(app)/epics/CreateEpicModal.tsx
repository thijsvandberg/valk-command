"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { mutate } from "swr";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/Button";
import { epics } from "@/lib/api-client";
import { Type, AlignLeft, X, AlertTriangle } from "lucide-react";

interface CreateEpicModalProps {
  onClose: () => void;
  showToast: (msg: string) => void;
}

export function CreateEpicModal({ onClose, showToast }: CreateEpicModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus after Modal's own focus trap runs (which uses rAF)
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => titleRef.current?.focus());
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const handleCreate = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed) return;

    setCreating(true);
    setError(null);
    try {
      const result = await epics.create({
        title: trimmed,
        ...(description.trim() ? { description: description.trim() } : {}),
      });

      // The list renders from the progress endpoint; refresh it so the new epic surfaces.
      await mutate("/api/epics/progress");
      showToast("Epic created");
      router.push(`/tickets/${result.key}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create epic";
      setError(msg);
      setCreating(false);
    }
  }, [title, description, router, showToast]);

  return (
    <Modal open onClose={onClose} aria-label="Create epic">
      <div className="w-full max-w-md rounded-xl border border-border-strong bg-surface-floating shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-default px-5 py-3.5">
          <h2 className="font-[var(--font-display)] text-body-lg font-semibold text-text-primary">
            Create Epic
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-text-muted cursor-pointer hover:text-text-secondary hover:bg-overlay-default transition-colors duration-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-3.5 px-5 py-4">
          {/* Epic title */}
          <label className="block space-y-1">
            <span className="flex items-center gap-1.5 text-body-sm font-medium text-text-secondary">
              <Type size={11} strokeWidth={1.5} className="shrink-0 text-text-muted" />
              Epic title
            </span>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter" && title.trim() && !creating) handleCreate(); }}
              placeholder="e.g. Booking calendar revamp"
              className="w-full rounded-lg border border-border-default bg-surface-elevated px-3 py-2 text-body-sm text-text-primary
                placeholder:text-text-muted
                focus:border-[var(--color-brand-500)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]/30
                transition-colors duration-100"
            />
          </label>

          {/* Optional description */}
          <label className="block space-y-1">
            <span className="flex items-center gap-1.5 text-body-sm font-medium text-text-secondary">
              <AlignLeft size={11} strokeWidth={1.5} className="shrink-0 text-text-muted" />
              Description
              <span className="font-normal text-text-muted">(optional)</span>
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this epic about? You can flesh this out later..."
              rows={4}
              className="w-full rounded-lg border border-border-default bg-surface-elevated px-3 py-2 text-body-sm leading-relaxed text-text-primary
                placeholder:text-text-muted resize-none
                focus:border-[var(--color-brand-500)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]/30
                transition-colors duration-100"
            />
          </label>

          {/* Inline error */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2.5">
              <AlertTriangle size={13} strokeWidth={1.5} className="mt-px shrink-0 text-red-400" />
              <p className="text-body-sm leading-relaxed text-red-300">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border-default px-5 py-3">
          <Button variant="ghost" size="md" onClick={onClose} disabled={creating}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleCreate}
            disabled={creating || !title.trim()}
          >
            {creating ? "Creating..." : "Create epic"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
