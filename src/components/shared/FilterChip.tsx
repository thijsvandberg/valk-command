import type { ReactNode } from "react";

interface FilterChipProps {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}

// Toggleable filter pill used for multi-select facets.
export function FilterChip({ active = false, onClick, children }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`cursor-pointer rounded-md border px-2.5 py-1 text-label font-[var(--font-body)] transition-[color,background-color,border-color,transform] duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] ${
        active
          ? "border-[var(--color-brand-400)]/30 bg-[var(--color-brand-400)]/10 text-[var(--color-brand-400)]"
          : "border-border-default bg-transparent text-text-tertiary hover:border-border-strong hover:text-text-secondary"
      }`}
    >
      {children}
    </button>
  );
}
