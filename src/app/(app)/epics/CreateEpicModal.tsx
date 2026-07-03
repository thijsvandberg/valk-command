"use client";

import { useState, useCallback, useRef, useEffect } from "react";
// useSWRConfig, not the top-level "swr" mutate: the app's custom cache provider
// makes the global mutate a silent no-op for provider-backed keys (BRDG-458).
import { useSWRConfig } from "swr";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/shared/Modal";
import { Field } from "@/components/shared/Field";
import { TextInput } from "@/components/shared/TextInput";
import { TextArea } from "@/components/shared/TextArea";
import { Button } from "@/components/ui/Button";
import { epics } from "@/lib/api-client";
import { Type, AlignLeft, X, AlertTriangle } from "lucide-react";

interface CreateEpicModalProps {
  onClose: () => void;
  showToast: (msg: string) => void;
}

export function CreateEpicModal({ onClose, showToast }: CreateEpicModalProps) {
  const { mutate } = useSWRConfig();
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
  }, [title, description, router, showToast, mutate]);

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
          <Field label="Epic title" icon={<Type size={11} strokeWidth={1.5} />}>
            <TextInput
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter" && title.trim() && !creating) handleCreate(); }}
              placeholder="e.g. Booking calendar revamp"
            />
          </Field>

          {/* Optional description */}
          <Field
            label="Description"
            icon={<AlignLeft size={11} strokeWidth={1.5} />}
            hint="(optional)"
          >
            <TextArea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this epic about? You can flesh this out later..."
              rows={4}
              className="resize-none"
            />
          </Field>

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
