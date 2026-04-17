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
        ? "h-7 px-2.5 py-1 text-xs"
        : "px-3 py-1.5 text-sm";

    return (
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/25">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          className={`w-full rounded-lg border border-border-strong bg-white/[0.03] text-white/80 placeholder-white/25 focus:outline-none focus:border-[var(--color-brand-500)]/40 transition-colors duration-150 ${sizeClass}${icon ? " pl-8" : ""}${className ? ` ${className}` : ""}`}
          {...rest}
        />
      </div>
    );
  },
);
