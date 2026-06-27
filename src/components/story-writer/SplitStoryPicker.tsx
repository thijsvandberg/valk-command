"use client";

import { useState, useEffect } from "react";
import { Scissors, X, Plus, Link, ChevronDown } from "lucide-react";
import { sprintSlots as sprintSlotsApi } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/shared/Modal";

interface SprintSlot {
  slotIndex: number;
  sprintId: string;
  sprintName: string;
}

interface SplitStoryPickerProps {
  open: boolean;
  originalTitle: string;
  originalSprintId: string | null;
  onConfirm: (targetKey?: string, sprintId?: string, title?: string, issueType?: string) => Promise<void>;
  onClose: () => void;
}

type PickerMode = "create" | "existing";

export function SplitStoryPicker({ open, originalTitle, originalSprintId, onConfirm, onClose }: SplitStoryPickerProps) {
  const [mode, setMode] = useState<PickerMode>("create");
  const [customTitle, setCustomTitle] = useState(`Split: ${originalTitle}`);
  const [selectedIssueType, setSelectedIssueType] = useState("story");
  const [existingKey, setExistingKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sprints, setSprints] = useState<SprintSlot[]>([]);
  const [selectedSprintId, setSelectedSprintId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    (sprintSlotsApi.list() as Promise<SprintSlot[]>)
      .then((data) => {
        setSprints(data);
        // Pre-select the sprint matching originalSprintName, or first available
        const match = data.find((s) => s.sprintId === originalSprintId);
        setSelectedSprintId(match?.sprintId ?? data[0]?.sprintId ?? "");
      })
      .catch((err) => console.warn("[split-picker] fetch sprints failed", err));
  }, [open, originalSprintId]);

  if (!open) return null;

  const handleConfirm = async () => {
    setError(null);
    setLoading(true);
    try {
      if (mode === "existing") {
        const key = existingKey.trim().toUpperCase();
        if (!key) {
          setError("Enter a ticket key");
          return;
        }
        await onConfirm(key, undefined, undefined, undefined);
      } else {
        await onConfirm(undefined, selectedSprintId || undefined, customTitle || undefined, selectedIssueType);
      }
    } catch {
      setError("Failed to activate split mode");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} aria-label="Split story">
      <div className="w-full max-w-md rounded-xl border border-border-strong bg-[var(--color-surface-elevated)] shadow-[var(--shadow-modal)] p-6">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-brand-500)]/10">
              <Scissors size={15} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
            </div>
            <div>
              <h2 className="font-[var(--font-display)] text-body-lg font-semibold text-text-primary">Split story</h2>
              <p className="text-label text-text-tertiary mt-0.5">Select or create the target story</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={<X size={15} strokeWidth={1.5} />}
            onClick={onClose}
            className="border-0 bg-transparent text-text-tertiary hover:text-text-secondary hover:bg-overlay-default"
          />
        </div>

        {/* Mode selector */}
        <div className="mb-4 flex gap-1 rounded-lg bg-overlay-subtle p-1">
          <button
            type="button"
            onClick={() => setMode("create")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-body-sm font-medium cursor-pointer transition-colors duration-150 ${
              mode === "create"
                ? "bg-[var(--color-surface-floating)] text-text-primary shadow-sm"
                : "text-text-tertiary hover:text-text-secondary"
            } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
          >
            <Plus size={12} strokeWidth={2} />
            Create new story
          </button>
          <button
            type="button"
            onClick={() => setMode("existing")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-body-sm font-medium cursor-pointer transition-colors duration-150 ${
              mode === "existing"
                ? "bg-[var(--color-surface-floating)] text-text-primary shadow-sm"
                : "text-text-tertiary hover:text-text-secondary"
            } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
          >
            <Link size={12} strokeWidth={2} />
            Use existing story
          </button>
        </div>

        {/* Create new */}
        {mode === "create" && (
          <div className="mb-5 space-y-3">
            <div>
              <label className="mb-1.5 block text-label font-medium text-text-tertiary">
                New story title
              </label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                className="w-full rounded-md border border-border-strong bg-[var(--color-surface-floating)] px-3 py-2 text-body-lg text-text-primary placeholder-text-muted focus:border-[var(--color-brand-500)]/40 focus:outline-none transition-colors duration-150"
                placeholder="Story title..."
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1.5 block text-label font-medium text-text-tertiary">
                  Issue type
                </label>
                <div className="relative">
                  <select
                    value={selectedIssueType}
                    onChange={(e) => setSelectedIssueType(e.target.value)}
                    className="w-full appearance-none rounded-md border border-border-strong bg-[var(--color-surface-floating)] px-3 py-2 pr-8 text-body-lg text-text-primary focus:border-[var(--color-brand-500)]/40 focus:outline-none transition-colors duration-150 cursor-pointer"
                  >
                    <option value="story">Story</option>
                    <option value="task">Task</option>
                    <option value="bug">Bug</option>
                    <option value="spike">Spike</option>
                  </select>
                  <ChevronDown size={13} strokeWidth={1.5} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
                </div>
              </div>
              <div className="flex-1">
                <label className="mb-1.5 block text-label font-medium text-text-tertiary">
                  Sprint
                </label>
                <div className="relative">
                  <select
                    value={selectedSprintId}
                    onChange={(e) => setSelectedSprintId(e.target.value)}
                    className="w-full appearance-none rounded-md border border-border-strong bg-[var(--color-surface-floating)] px-3 py-2 pr-8 text-body-lg text-text-primary focus:border-[var(--color-brand-500)]/40 focus:outline-none transition-colors duration-150 cursor-pointer"
                  >
                    {sprints.length === 0 && (
                      <option value="">No sprints configured</option>
                    )}
                    {sprints.map((s) => (
                      <option key={s.sprintId} value={s.sprintId}>
                        {s.sprintName}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={13} strokeWidth={1.5} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
                </div>
              </div>
            </div>
            <p className="text-label text-text-tertiary">
              A new story will be created on Jira and linked to the original.
            </p>
          </div>
        )}

        {/* Use existing */}
        {mode === "existing" && (
          <div className="mb-5">
            <label className="mb-1.5 block text-label font-medium text-text-tertiary">
              Ticket key
            </label>
            <input
              type="text"
              value={existingKey}
              onChange={(e) => setExistingKey(e.target.value.toUpperCase())}
              className="w-full rounded-md border border-border-strong bg-[var(--color-surface-floating)] px-3 py-2 font-mono text-body-lg text-text-primary placeholder-text-muted focus:border-[var(--color-brand-500)]/40 focus:outline-none transition-colors duration-150"
              placeholder="VPL-123"
            />
            <p className="mt-1.5 text-label text-text-tertiary">
              The existing story must be synced locally. It will be linked to the original.
            </p>
          </div>
        )}

        {error && (
          <p className="mb-4 rounded-md bg-red-500/[0.08] px-3 py-2 text-body-sm text-red-400/80">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="lg"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            icon={loading ? (
              <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-border-strong border-t-white/80 animate-spin" />
            ) : (
              <Scissors size={13} strokeWidth={2} />
            )}
            onClick={handleConfirm}
            disabled={loading}
          >
            {mode === "create" ? "Create & split" : "Link & split"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
