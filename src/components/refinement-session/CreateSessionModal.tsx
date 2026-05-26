"use client";

import { useState, useRef, useEffect } from "react";
import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/Button";

function defaultSessionName(): string {
  return `Refinement ${new Date().toISOString().slice(0, 10)}`;
}

interface CreateSessionModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}

export function CreateSessionModal({ open, onClose, onCreate }: CreateSessionModalProps) {
  return (
    <Modal open={open} onClose={onClose} aria-label="Create refinement session">
      {open && (
        <CreateSessionForm onClose={onClose} onCreate={onCreate} />
      )}
    </Modal>
  );
}

function CreateSessionForm({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState(defaultSessionName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    onClose();
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-border-strong bg-[var(--color-surface-elevated)] p-6 shadow-[var(--shadow-2xl)]">
      <h3 className="font-[var(--font-display)] text-sm font-semibold text-text-primary">
        New refinement session
      </h3>
      <p className="mt-1.5 text-xs leading-relaxed text-text-tertiary">
        Give this session a name to keep things organized.
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
        placeholder="Session name"
        className="mt-4 w-full rounded-lg border border-border-default bg-overlay-subtle px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-[var(--color-brand-500)] focus:ring-1 focus:ring-[var(--color-brand-500)]/30"
        style={{ transition: "border-color 0.15s ease, box-shadow 0.15s ease" }}
        data-testid="create-session-name-input"
      />

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button variant="ghost" size="md" onClick={onClose} className="border-0">
          Cancel
        </Button>
        <Button
          variant="primary"
          size="md"
          onClick={handleSubmit}
          disabled={!name.trim()}
        >
          Create
        </Button>
      </div>
    </div>
  );
}
