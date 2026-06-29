"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { mutate } from "swr";
import { Modal } from "@/components/shared/Modal";
import { DateTimePicker, formatDateTimeLabel } from "@/components/shared/DateTimePicker";
import { Button } from "@/components/ui/Button";
import { jira } from "@/lib/api-client";
import { sprintEndFromStart, sprintDurationDays, toIsoDateTime, toInputDateTime } from "@/lib/sprint-dates";
import { Calendar, Target, Type, X, AlertTriangle, CornerDownRight } from "lucide-react";

/** The sprint as returned by POST /api/jira/sprints (jira.createSprint). */
export interface CreatedSprint {
  id: number;
  name: string;
  state: string;
  startDate: string | null;
  endDate: string | null;
  goal: string | null;
}

interface CreateSprintModalProps {
  onClose: () => void;
  // Receives the full created sprint so callers can re-group / navigate without
  // waiting on a sprint-list refetch (the dev cache invalidation is unreliable).
  onCreated: (sprint: CreatedSprint) => void;
  showToast: (msg: string) => void;
  // Editable defaults derived from the regular sprint series (BRDG-305).
  suggestedName?: string;
  suggestedStartDate?: string;
  // The regular sprint this one follows, for context (BRDG-305 follow-up).
  previousSprintName?: string;
  previousSprintEndIso?: string | null;
}

export function CreateSprintModal({
  onClose,
  onCreated,
  showToast,
  suggestedName = "",
  suggestedStartDate = "",
  previousSprintName,
  previousSprintEndIso,
}: CreateSprintModalProps) {
  const [name, setName] = useState(suggestedName);
  const [startDate, setStartDate] = useState(suggestedStartDate);
  // Prefill the conventional end so the PO can create in one click; empty when
  // there is no suggested start to derive it from.
  const [endDate, setEndDate] = useState(suggestedStartDate ? sprintEndFromStart(suggestedStartDate) : "");
  const [goal, setGoal] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus after Modal's own focus trap runs (which uses rAF)
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        nameRef.current?.focus();
        // Prefilled name is a suggestion; select it so the PO can overwrite in one keystroke.
        nameRef.current?.select();
      });
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
      onCreated(result);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create sprint";
      setError(msg);
    } finally {
      setCreating(false);
    }
  }, [name, startDate, endDate, goal, onClose, onCreated, showToast]);

  const suggestedEnd = sprintEndFromStart(startDate);
  // Date-only label for the previous sprint's end (drop the stored 17:00).
  const previousEndLabel = previousSprintEndIso
    ? formatDateTimeLabel(toInputDateTime(previousSprintEndIso).split("T")[0])
    : null;
  const durationDays = sprintDurationDays(startDate, endDate);

  return (
    <Modal open onClose={onClose} aria-label="Create sprint">
      <div className="w-full max-w-md rounded-xl border border-border-strong bg-surface-floating shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-default px-5 py-3.5">
          <h2 className="font-[var(--font-display)] text-body-lg font-semibold text-text-primary">
            Create Sprint
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
              className="w-full rounded-lg border border-border-default bg-surface-elevated px-3 py-2 text-body-sm text-text-primary
                placeholder:text-text-muted
                focus:border-[var(--color-brand-500)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]/30
                transition-colors duration-100"
            />
          </label>

          {/* Context: the regular sprint this one follows (BRDG-305 follow-up) */}
          {previousSprintName && (
            <p className="-mt-2 flex items-center gap-1.5 text-label text-text-muted">
              <CornerDownRight size={11} strokeWidth={1.5} className="shrink-0" />
              <span>
                Follows <span className="font-semibold text-text-secondary">{previousSprintName}</span>
                {previousEndLabel && <>, which ends <span className="font-semibold text-text-secondary">{previousEndLabel}</span></>}
              </span>
            </p>
          )}

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

          {/* Sprint length + the conventional end suggestion when the end diverges */}
          {(durationDays !== null || (startDate && suggestedEnd !== endDate)) && (
            <div className="-mt-2 flex flex-col items-end gap-1">
              {startDate && suggestedEnd !== endDate && (
                <button
                  type="button"
                  onClick={() => setEndDate(suggestedEnd)}
                  title="Set end date to the conventional sprint end"
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-label font-medium cursor-pointer
                    text-[var(--color-brand-400)]
                    hover:bg-[var(--color-brand-500)]/10
                    active:bg-[var(--color-brand-500)]/15
                    transition-colors duration-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                >
                  <CornerDownRight size={11} strokeWidth={1.5} />
                  End on {formatDateTimeLabel(suggestedEnd)}
                </button>
              )}
              {durationDays !== null && (
                <span className="px-2 text-label text-text-muted">
                  This sprint runs for{" "}
                  <span className="font-semibold text-text-secondary">{durationDays}</span>{" "}
                  {durationDays === 1 ? "day" : "days"}
                </span>
              )}
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
            disabled={creating || !name.trim()}
          >
            {creating ? "Creating..." : "Create"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
