/**
 * Shared bar primitives for consistent 44px header rows across the app.
 * See BRDG-130 for rationale.
 */

interface BarContainerProps {
  children: React.ReactNode;
  /** Horizontal padding: "default" = px-4, "compact" = px-3 */
  padding?: "default" | "compact";
  /** Show border. Default true. */
  border?: boolean;
  /** Border position. Default "bottom". */
  borderPosition?: "bottom" | "top";
  className?: string;
}

export function BarContainer({
  children,
  padding = "default",
  border = true,
  borderPosition = "bottom",
  className,
}: BarContainerProps) {
  const borderClass = border
    ? borderPosition === "top"
      ? "border-t border-border-default"
      : "border-b border-border-default"
    : "";
  const paddingClass = padding === "compact" ? "px-3" : "px-4";

  return (
    <div className={`flex h-11 shrink-0 items-center ${paddingClass} ${borderClass} ${className ?? ""}`}>
      {children}
    </div>
  );
}

export function BarDivider({ className }: { className?: string } = {}) {
  return <div className={`h-4 w-px shrink-0 bg-white/[0.08] ${className ?? ""}`} />;
}
