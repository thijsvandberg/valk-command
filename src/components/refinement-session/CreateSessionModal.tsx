"use client";

import { useState, useRef, useEffect } from "react";
import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/Button";
import { DateTimePicker, todayLocalDate } from "@/components/shared/DateTimePicker";

export interface CreateSessionInput {
  name?: string;
  scheduledFor?: string;
}

interface CreateSessionModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: CreateSessionInput) => void;
  /** Dates that already have sessions: "YYYY-MM-DD" -> session labels (calendar markers). */
  scheduledDates?: Record<string, string[]>;
}

export function CreateSessionModal({ open, onClose, onCreate, scheduledDates }: CreateSessionModalProps) {
  return (
    <Modal open={open} onClose={onClose} aria-label="Create refinement session">
      {open && (
        <CreateSessionForm onClose={onClose} onCreate={onCreate} scheduledDates={scheduledDates} />
      )}
    </Modal>
  );
}

function CreateSessionForm({
  onClose,
  onCreate,
  scheduledDates,
}: {
  onClose: () => void;
  onCreate: (data: CreateSessionInput) => void;
  scheduledDates?: Record<string, string[]>;
}) {
  const [name, setName] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  const canSubmit = name.trim() !== "" || scheduledFor !== "";

  function handleSubmit() {
    if (!canSubmit) return;
    onCreate({
      name: name.trim() || undefined,
      scheduledFor: scheduledFor || undefined,
    });
    onClose();
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-border-strong bg-[var(--color-surface-elevated)] p-6 shadow-[var(--shadow-2xl)]">
      <h3 className="font-[var(--font-display)] text-body-lg font-semibold text-text-primary">
        New refinement session
      </h3>
      <p className="mt-1.5 text-body-sm leading-relaxed text-text-tertiary">
        Give it a name, pick a date, or both.
      </p>

      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder="Name (optional)"
        className="mt-4 w-full rounded-lg border border-border-default bg-overlay-subtle px-3 py-2 text-body-lg text-text-primary placeholder:text-text-muted outline-none focus:border-[var(--color-brand-500)] focus:ring-1 focus:ring-[var(--color-brand-500)]/30"
        style={{ transition: "border-color 0.15s ease, box-shadow 0.15s ease" }}
        data-testid="create-session-name-input"
      />

      <div className="mt-3" data-testid="create-session-date-picker">
        <DateTimePicker
          value={scheduledFor}
          onChange={setScheduledFor}
          ariaLabel="Session date"
          placeholder="Date (optional)"
          closeOnSelect
          hideTime
          minDate={todayLocalDate()}
          markers={scheduledDates}
        />
      </div>

      <div className="mt-5 flex items-center justify-between gap-2">
        <span
          aria-live="polite"
          className={`text-[11px] text-text-muted ${canSubmit ? "invisible" : ""}`}
        >
          Give it a name or pick a date
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="md" onClick={onClose} className="border-0">
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            Create
          </Button>
        </div>
      </div>
    </div>
  );
}
