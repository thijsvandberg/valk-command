/**
 * Shared bar primitives for consistent 44px header rows across the app.
 * See BRDG-130 for rationale.
 */

interface BarContainerProps {
  children: React.ReactNode;
  /** Horizontal padding: "default" = px-4, "compact" = px-3, "none" = px-0 (the
   *  caller supplies its own gutter, e.g. to align an inner capped row). */
  padding?: "default" | "compact" | "none";
  /** Show border. Default true. */
  border?: boolean;
  /** Border position. Default "bottom". */
  borderPosition?: "bottom" | "top";
  className?: string;
  /** ARIA role for the bar (e.g. "tablist" from TabBar). Default none. */
  role?: string;
  "aria-label"?: string;
}

export function BarContainer({
  children,
  padding = "default",
  border = true,
  borderPosition = "bottom",
  className,
  role,
  "aria-label": ariaLabel,
}: BarContainerProps) {
  const borderClass = border
    ? borderPosition === "top"
      ? "border-t border-border-default"
      : "border-b border-border-default"
    : "";
  const paddingClass = padding === "none" ? "px-0" : padding === "compact" ? "px-3" : "px-4";

  return (
    <div role={role} aria-label={ariaLabel} className={`flex h-[44px] shrink-0 items-center ${paddingClass} ${borderClass} ${className ?? ""}`}>
      {children}
    </div>
  );
}

export function BarDivider({ className }: { className?: string } = {}) {
  return <div className={`h-4 w-px shrink-0 bg-overlay-strong ${className ?? ""}`} />;
}
