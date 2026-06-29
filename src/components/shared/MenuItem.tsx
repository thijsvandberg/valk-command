import {
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

// One canonical dropdown-menu row (BRDG-421). Every overflow / context / popover
// menu renders its rows through this so they share padding, hover/active tokens
// and — critically — a keyboard focus-visible ring that the hand-rolled copies
// lacked. Renders an <a> when `href` is set, otherwise a <button>.
//
// Widget roles (role="menuitem") are intentionally NOT defaulted here; they are
// added deliberately per BRDG-425. Callers that already pass `role` keep it via
// the spread.

const base =
  "flex w-full items-center gap-2.5 px-3 py-1.5 text-body-sm cursor-pointer transition-colors duration-150 hover:bg-hover-list-item active:bg-overlay-default focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)] disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none";

const toneClasses = {
  default: "text-text-secondary hover:text-text-primary",
  brand:
    "text-[var(--color-brand-400)] hover:bg-[var(--color-brand-500)]/10 hover:text-[var(--color-brand-300)]",
  warning:
    "text-[var(--color-status-warning)] hover:bg-[var(--color-status-warning-subtle)]",
  danger:
    "text-[var(--color-status-error)] hover:bg-[var(--color-status-error)]/10 hover:text-[var(--color-status-error)]",
} as const;

// The leading icon is dimmed (tertiary) on default rows for the established muted
// look, but inherits the row's tone color on toned rows (a danger row's icon reads
// red, a brand row's reads brand) so the icon matches the label.
const iconToneClass: Record<keyof typeof toneClasses, string> = {
  default: "text-text-tertiary",
  brand: "",
  warning: "",
  danger: "",
};

export type MenuItemTone = keyof typeof toneClasses;

interface MenuItemOwnProps {
  /** Leading icon, wrapped in a fixed-size slot so rows align. */
  icon?: ReactNode;
  tone?: MenuItemTone;
  /** Selected/current row: brighter, medium-weight label. */
  active?: boolean;
  children: ReactNode;
}

type ButtonMenuItemProps = MenuItemOwnProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type AnchorMenuItemProps = MenuItemOwnProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export type MenuItemProps = ButtonMenuItemProps | AnchorMenuItemProps;

export function MenuItem(props: MenuItemProps) {
  const { icon, tone = "default", active, className, children, ...rest } = props;
  const classes = [
    base,
    toneClasses[tone],
    active ? "font-medium text-text-primary" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {icon != null && (
        <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${iconToneClass[tone]}`}>
          {icon}
        </span>
      )}
      {children}
    </>
  );

  if (rest.href !== undefined) {
    return (
      <a className={classes} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {content}
      </a>
    );
  }

  const { type = "button", ...buttonRest } =
    rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type={type} className={classes} {...buttonRest}>
      {content}
    </button>
  );
}

// The floating panel that holds MenuItem rows. Provides only the inner frame
// (radius, border, surface, padding, popover shadow); the caller still owns
// positioning + the z-index layer (unified separately in BRDG-422).
interface MenuListProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function MenuList({ className, children, ...rest }: MenuListProps) {
  const classes = [
    "min-w-[180px] rounded-lg border border-border-default bg-surface-floating py-1 shadow-popover",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
