"use client";

import { useState, useCallback } from "react";
import { mutate } from "swr";
import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/Button";
import { jira } from "@/lib/api-client";
import { Calendar, Target, Type, X } from "lucide-react";

interface CreateSprintModalProps {
  onClose: () => void;
  onCreated: (sprintId: string) => void;
  showToast: (msg: string) => void;
}

function toIsoDateTime(input: string): string {
  if (!input) return "";
  return new Date(input).toISOString();
}

function fmtWeekday(input: string): string {
  if (!input) return "";
  const d = new Date(input);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export function CreateSprintModal({ onClose, onCreated, showToast }: CreateSprintModalProps) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [goal, setGoal] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setCreating(true);
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
      showToast(msg);
    } finally {
      setCreating(false);
    }
  }, [name, startDate, endDate, goal, onClose, onCreated, showToast]);

  return (
    <Modal open onClose={onClose} aria-label="Create sprint">
      <div className="w-full max-w-md rounded-xl border border-border-strong bg-[var(--color-surface-floating)] shadow-[var(--shadow-xl)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-default px-5 py-3.5">
          <h2 className="font-[var(--font-display)] text-sm font-semibold text-text-primary">
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
        <div className="space-y-4 px-5 py-4">
          {/* Sprint name */}
          <label className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
              <Type size={11} strokeWidth={1.5} className="text-text-muted" />
              Sprint name
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sprint 42"
              autoFocus
              className="w-full rounded-lg border border-border-default bg-[var(--color-surface-elevated)] px-3 py-2 text-xs text-text-primary
                placeholder:text-text-muted
                focus:border-[var(--color-brand-500)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]/30
                transition-colors duration-100"
            />
          </label>

          {/* Date fields */}
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                  <Calendar size={11} strokeWidth={1.5} className="text-text-muted" />
                  Start date
                </span>
                {startDate && (
                  <span className="text-[10px] text-text-muted">{fmtWeekday(startDate)}</span>
                )}
              </div>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-[var(--color-surface-elevated)] px-3 py-2 text-xs text-text-primary
                  placeholder:text-text-muted
                  focus:border-[var(--color-brand-500)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]/30
                  transition-colors duration-100
                  [color-scheme:dark]"
              />
            </label>
            <label className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                  <Calendar size={11} strokeWidth={1.5} className="text-text-muted" />
                  End date
                </span>
                {endDate && (
                  <span className="text-[10px] text-text-muted">{fmtWeekday(endDate)}</span>
                )}
              </div>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-[var(--color-surface-elevated)] px-3 py-2 text-xs text-text-primary
                  placeholder:text-text-muted
                  focus:border-[var(--color-brand-500)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]/30
                  transition-colors duration-100
                  [color-scheme:dark]"
              />
            </label>
          </div>

          {/* Goal field */}
          <label className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
              <Target size={11} strokeWidth={1.5} className="text-text-muted" />
              Sprint goal
            </span>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Describe the sprint's primary objective..."
              rows={3}
              className="w-full rounded-lg border border-border-default bg-[var(--color-surface-elevated)] px-3 py-2 text-xs leading-relaxed text-text-primary
                placeholder:text-text-muted resize-none
                focus:border-[var(--color-brand-500)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]/30
                transition-colors duration-100"
            />
          </label>
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
