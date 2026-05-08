"use client";

import type { ReactNode } from "react";
import { Modal } from "./Modal";
import { Button } from "@/components/ui/Button";
import type { ButtonVariant } from "@/components/ui/Button";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  confirmVariant?: ButtonVariant;
  confirmClassName?: string;
  onConfirm: () => void;
  cancelLabel?: string;
  /** Extra content rendered between description and action buttons */
  extra?: ReactNode;
  /** Extra action buttons rendered to the left of cancel/confirm in the action row */
  extraActions?: ReactNode;
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel = "Confirm",
  confirmVariant = "destructive",
  confirmClassName,
  onConfirm,
  cancelLabel = "Cancel",
  extra,
  extraActions,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-border-strong bg-[var(--color-surface-elevated)] p-6 shadow-[0_32px_80px_rgba(0,0,0,0.65),0_8px_24px_rgba(0,0,0,0.4)]">
        <h3 className="font-[var(--font-display)] text-sm font-semibold text-text-primary">
          {title}
        </h3>
        <p className="mt-2 text-xs leading-[1.7] text-text-secondary">{description}</p>
        {extra && <div className="mt-3">{extra}</div>}
        <div className="mt-5 flex items-center justify-end gap-2">
          {extraActions}
          <Button variant="ghost" size="md" onClick={onClose} className="border-0">
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            size="md"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={confirmClassName}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
