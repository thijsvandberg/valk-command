import { forwardRef, type SelectHTMLAttributes, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  selectSize?: "sm" | "md";
  children: ReactNode;
}

/**
 * Canonical form select (BRDG-420). Shares the TextInput/TextArea recipe — one
 * border, one surface, one radius, the same subtle focus border (no ring) — so
 * selects stop being hand-rolled per form. A native <select> keeps it accessible;
 * the chevron is decorative.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ selectSize = "md", className, children, ...rest }, ref) {
    const sizeClass =
      selectSize === "sm"
        ? "h-7 pl-2.5 pr-8 py-1 text-body-sm"
        : "pl-3 pr-9 py-1.5 text-body-lg";

    return (
      <div className="relative">
        <select
          ref={ref}
          className={`w-full appearance-none rounded-lg border border-border-strong bg-overlay-subtle text-text-primary focus:outline-none focus:border-[var(--color-brand-500)]/40 disabled:cursor-not-allowed disabled:opacity-50 transition-colors duration-150 ${sizeClass}${className ? ` ${className}` : ""}`}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          size={14}
          strokeWidth={1.75}
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
        />
      </div>
    );
  },
);
