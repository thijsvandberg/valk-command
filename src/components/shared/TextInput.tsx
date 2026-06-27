import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

interface TextInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  inputSize?: "sm" | "md";
  icon?: ReactNode;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  function TextInput({ inputSize = "md", icon, className, ...rest }, ref) {
    const sizeClass =
      inputSize === "sm"
        ? "h-7 px-2.5 py-1 text-body-sm"
        : "px-3 py-1.5 text-body-lg";

    return (
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          className={`w-full rounded-lg border border-border-strong bg-overlay-subtle text-text-primary placeholder:text-text-muted focus:outline-none focus:border-[var(--color-brand-500)] focus:ring-1 focus:ring-[var(--color-brand-500)]/30 disabled:cursor-not-allowed disabled:opacity-50 transition-[color,background-color,border-color,box-shadow] duration-150 ${sizeClass}${icon ? " pl-8" : ""}${className ? ` ${className}` : ""}`}
          {...rest}
        />
      </div>
    );
  },
);
