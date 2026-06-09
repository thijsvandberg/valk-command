/**
 * The single, canonical radio visual, matching the shared Checkbox exactly:
 * a 14px subtle brand-tinted circle with a brand dot when selected. Use this for
 * single-choice rows so radios and checkboxes read as one family.
 *
 * Presentational only (the dot) - the clickable wrapper / role="radio" lives at
 * the call site, since the surrounding markup varies.
 */
interface RadioProps {
  checked: boolean;
  /** Extra classes for the circle, e.g. row-level layout tweaks. */
  className?: string;
}

export function Radio({ checked, className = "" }: RadioProps) {
  return (
    <span
      aria-hidden
      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-[opacity,background-color] duration-150 ease-in-out ${
        checked
          ? "border-[var(--color-brand-500)]/50 bg-[var(--color-brand-500)]/20"
          : "border-border-default bg-overlay-subtle"
      } ${className}`}
    >
      {checked && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)]" />}
    </span>
  );
}
