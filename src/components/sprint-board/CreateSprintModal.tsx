"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { mutate } from "swr";
import { Modal } from "@/components/shared/Modal";
import { DateTimePicker, formatDateTimeLabel } from "@/components/shared/DateTimePicker";
import { Button } from "@/components/ui/Button";
import { jira } from "@/lib/api-client";
import { sprintEndFromStart } from "@/lib/sprint-dates";
import { Calendar, Target, Type, X, AlertTriangle, CornerDownRight } from "lucide-react";

interface CreateSprintModalProps {
  onClose: () => void;
  onCreated: (sprintId: string) => void;
  showToast: (msg: string) => void;
}

function toIsoDateTime(input: string): string {
  if (!input) return "";
  return new Date(input).toISOString();
}

export function CreateSprintModal({ onClose, onCreated, showToast }: CreateSprintModalProps) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [goal, setGoal] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus after Modal's own focus trap runs (which uses rAF)
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => nameRef.current?.focus());
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const handleCreate = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setCreating(true);
    setError(null);
    try {
      const result = await jira.createSprint({
        name: trimmed,
        ...(startDate ? { startDate: toIsoDateTime(startDate) } : {}),
        ...(endDate ? { endDate: toIsoDateTime(endDate) } : {}),
        ...(goal.trim() ? { goal: goal.trim() } : {}),
      });

      await mutate("/api/jira/sprints");
      showToast("Sprint created");
      onCreated(String(result.id));
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create sprint";
      setError(msg);
    } finally {
      setCreating(false);
    }
  }, [name, startDate, endDate, goal, onClose, onCreated, showToast]);

  const suggestedEnd = sprintEndFromStart(startDate);

  return (
    <Modal open onClose={onClose} aria-label="Create sprint">
      <div className="w-full max-w-md rounded-xl border border-border-strong bg-[var(--color-surface-floating)] shadow-[var(--shadow-xl)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-default px-5 py-3.5">
          <h2 className="font-[var(--font-display)] text-body-lg font-semibold text-text-primary">
            Create Sprint
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-text-muted cursor-pointer hover:text-text-secondary hover:bg-overlay-default transition-colors duration-100"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-3.5 px-5 py-4">
          {/* Sprint name */}
          <label className="block space-y-1">
            <span className="flex items-center gap-1.5 text-body-sm font-medium text-text-secondary">
              <Type size={11} strokeWidth={1.5} className="shrink-0 text-text-muted" />
              Sprint name
            </span>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim() && !creating) handleCreate(); }}
              placeholder="e.g. Sprint 42"
              className="w-full rounded-lg border border-border-default bg-[var(--color-surface-elevated)] px-3 py-2 text-body-sm text-text-primary
                placeholder:text-text-muted
                focus:border-[var(--color-brand-500)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]/30
                transition-colors duration-100"
            />
          </label>

          {/* Date fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="flex items-center gap-1.5 text-body-sm font-medium text-text-secondary">
                <Calendar size={11} strokeWidth={1.5} className="shrink-0 text-text-muted" />
                Start date
              </span>
              <DateTimePicker
                value={startDate}
                onChange={setStartDate}
                ariaLabel="Start date"
                placeholder="Pick a date"
                closeOnSelect
              />
            </div>
            <div className="space-y-1">
              <span className="flex items-center gap-1.5 text-body-sm font-medium text-text-secondary">
                <Calendar size={11} strokeWidth={1.5} className="shrink-0 text-text-muted" />
                End date
              </span>
              <DateTimePicker
                value={endDate}
                onChange={setEndDate}
                ariaLabel="End date"
                placeholder="Pick a date"
              />
            </div>
          </div>

          {/* Conventional sprint-end suggestion (first Thursday after +1 week, 17:00) */}
          {startDate && suggestedEnd !== endDate && (
            <div className="-mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setEndDate(suggestedEnd)}
                title="Set end date to the conventional sprint end"
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium cursor-pointer
                  text-[var(--color-brand-400)]
                  hover:bg-[var(--color-brand-500)]/10
                  active:bg-[var(--color-brand-500)]/15
                  transition-colors duration-100"
              >
                <CornerDownRight size={11} strokeWidth={1.5} />
                End on {formatDateTimeLabel(suggestedEnd)}
              </button>
            </div>
          )}

          {/* Goal field */}
          <label className="block space-y-1">
            <span className="flex items-center gap-1.5 text-body-sm font-medium text-text-secondary">
              <Target size={11} strokeWidth={1.5} className="shrink-0 text-text-muted" />
              Sprint goal
            </span>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Describe the sprint's primary objective..."
              rows={3}
              className="w-full rounded-lg border border-border-default bg-[var(--color-surface-elevated)] px-3 py-2 text-body-sm leading-relaxed text-text-primary
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
            disabled={creating || !name.trim()}
          >
            {creating ? "Creating..." : "Create"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
