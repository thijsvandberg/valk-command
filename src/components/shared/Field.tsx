import type { ReactNode } from "react";

interface FieldProps {
  label: ReactNode;
  /** Small leading icon rendered muted next to the label text. */
  icon?: ReactNode;
  /** Muted suffix after the label, e.g. "(optional)". */
  hint?: ReactNode;
  /**
   * Right-aligned action in the label row (e.g. an AI-suggest button).
   * Forces the div container: interactive content inside a <label> misfires
   * the label's activation behaviour on click.
   */
  labelEnd?: ReactNode;
  error?: ReactNode;
  disabled?: boolean;
  /**
   * "div" for controls that are buttons themselves (e.g. DateTimePicker):
   * wrapping a button in a <label> would make the label text a click target
   * for it, changing behaviour the caller may not want.
   */
  as?: "label" | "div";
  className?: string;
  children: ReactNode;
}

/**
 * Canonical label + control + error scaffold for form fields (BRDG-427), so
 * forms stop hand-rolling the label row. The control itself mutes on
 * disabled; Field only mutes the label row to avoid double-stacked opacity.
 */
export function Field({
  label,
  icon,
  hint,
  labelEnd,
  error,
  disabled,
  as = "label",
  className,
  children,
}: FieldProps) {
  const Tag = labelEnd ? "div" : as;
  return (
    <Tag className={`block space-y-1${className ? ` ${className}` : ""}`}>
      <span
        className={`flex items-center gap-1.5 text-body-sm font-medium text-text-secondary${disabled ? " opacity-50" : ""}`}
      >
        {icon && <span className="shrink-0 text-text-muted">{icon}</span>}
        {label}
        {hint && <span className="font-normal text-text-muted">{hint}</span>}
        {labelEnd && <span className="ml-auto">{labelEnd}</span>}
      </span>
      {children}
      {error && (
        <p role="alert" className="text-body-sm text-[var(--color-status-error)]">
          {error}
        </p>
      )}
    </Tag>
  );
}
