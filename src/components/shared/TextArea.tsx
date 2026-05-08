import { forwardRef, type TextareaHTMLAttributes } from "react";

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  function TextArea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={`w-full rounded-lg border border-border-strong bg-overlay-subtle px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-[var(--color-brand-500)]/40 transition-colors duration-150 leading-[1.6]${className ? ` ${className}` : ""}`}
        {...rest}
      />
    );
  },
);
