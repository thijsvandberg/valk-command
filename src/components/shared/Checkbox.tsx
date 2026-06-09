/**
 * The single, canonical checkbox visual for the app: a 14px subtle brand-tinted
 * square with a brand checkmark. This is presentational only (the box) - the
 * clickable wrapper / label / hidden input lives at each call site, since the
 * surrounding markup varies (table row, menu item, form field).
 *
 * Use this everywhere instead of hand-rolling a checkbox span, so the look stays
 * consistent. `indeterminate` renders the partial-state dot for "select all".
 */
interface CheckboxProps {
  checked: boolean;
  /** Partial state (some-but-not-all selected); ignored when `checked` is true. */
  indeterminate?: boolean;
  /** Extra classes for the box, e.g. row-level opacity / hover transitions. */
  className?: string;
}

export function Checkbox({ checked, indeterminate = false, className = "" }: CheckboxProps) {
  const active = checked || indeterminate;
  return (
    <span
      aria-hidden
      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition-[opacity,background-color] duration-150 ease-in-out ${
        active
          ? "border-[var(--color-brand-500)]/50 bg-[var(--color-brand-500)]/20"
          : "border-border-default bg-overlay-subtle"
      } ${className}`}
    >
      {checked ? (
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path
            d="M1.5 4L3 5.5L6.5 2"
            stroke="var(--color-brand-400)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : indeterminate ? (
        <span className="h-1.5 w-1.5 rounded-sm bg-[var(--color-brand-400)]" />
      ) : null}
    </span>
  );
}
