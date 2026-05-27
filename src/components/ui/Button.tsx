import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "soft"
  | "ghost"
  | "destructive"
  | "dashed";

export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconOnly?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--color-brand-600)] text-white hover:bg-[var(--color-brand-500)] focus-visible:outline-[var(--color-brand-400)] shadow-[0_2px_8px_rgba(14,142,136,0.30)]",
  secondary:
    "bg-overlay-subtle text-text-secondary border border-border-default hover:bg-hover-interactive hover:text-text-secondary focus-visible:outline-[var(--color-brand-400)]",
  soft:
    "bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/25 hover:bg-[var(--color-brand-500)]/20 focus-visible:outline-[var(--color-brand-400)]",
  ghost:
    "bg-overlay-subtle text-text-secondary border border-border-default hover:bg-hover-interactive hover:text-text-secondary focus-visible:outline-[var(--color-brand-400)]",
  destructive:
    "text-red-400/80 hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-red-400",
  dashed:
    "border border-dashed border-border-strong text-text-tertiary hover:text-text-secondary hover:border-border-strong focus-visible:outline-[var(--color-brand-400)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-6 gap-1 px-2 text-label rounded-md",
  md: "h-7 gap-1.5 px-2.5 text-body-sm rounded-lg",
  lg: "h-9 gap-2 px-4 text-body-lg rounded-lg",
};

const iconOnlySizeClasses: Record<ButtonSize, string> = {
  sm: "h-6 w-6 rounded-md",
  md: "h-7 w-7 rounded-lg",
  lg: "h-9 w-9 rounded-lg",
};

const base =
  "inline-flex items-center justify-center font-medium cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "ghost", size = "md", icon, iconOnly, className, children, ...rest }, ref) => {
    const classes = [
      base,
      variantClasses[variant],
      iconOnly ? iconOnlySizeClasses[size] : sizeClasses[size],
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button ref={ref} className={classes} {...rest}>
        {icon}
        {!iconOnly && children}
      </button>
    );
  },
);

Button.displayName = "Button";
