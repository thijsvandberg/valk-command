import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ModalHeaderProps {
  /** Pre-styled lucide icon element, rendered inside the brand-tinted badge. */
  icon: ReactNode;
  title: string;
  /** Optional second line (sprint name, ticket pill + title, "to KEY · ..."); it
   *  carries its own top margin so each modal keeps its exact spacing. */
  subtitle?: ReactNode;
  /** Controls placed left of the close button (e.g. a queue-position chip). */
  trailing?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
}

/**
 * Shared modal header: the brand-tinted icon badge + title/subtitle stack + a
 * ghost close button, on a bottom-bordered row. Extracted from the three
 * hand-rolled copies in TestDocReviewModal, SprintTestDocsModal and
 * AddSubtasksModal so the icon-badge modals share one rhythm.
 */
export function ModalHeader({
  icon,
  title,
  subtitle,
  trailing,
  onClose,
  closeLabel = "Close",
}: ModalHeaderProps) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand-500)]/12 ring-1 ring-[var(--color-brand-500)]/20 shadow-[0_2px_8px_color-mix(in_srgb,var(--color-brand-600)_15%,transparent)]">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-body font-semibold leading-tight text-text-primary">{title}</p>
          {subtitle}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {trailing}
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon={<X size={14} strokeWidth={1.5} />}
          onClick={onClose}
          className="shrink-0 text-text-muted"
          aria-label={closeLabel}
        />
      </div>
    </div>
  );
}
