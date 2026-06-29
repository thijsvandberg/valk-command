"use client";

import Link from "next/link";
import { BarContainer } from "./BarContainer";

const baseClass =
  "relative flex items-center gap-1.5 px-3 py-2 text-body-sm font-medium cursor-pointer transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]";

const activeClass =
  "text-text-primary after:absolute after:bottom-0 after:inset-x-0 after:h-0.5 after:bg-[var(--color-brand-400)] after:rounded-full";

const inactiveClass =
  "text-text-tertiary hover:text-text-secondary hover:bg-overlay-subtle active:text-text-secondary";

export function TabBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <BarContainer role="tablist" className={`items-stretch gap-0 ${className ?? ""}`}>
      {children}
    </BarContainer>
  );
}

interface TabProps {
  active: boolean;
  icon?: React.ReactNode;
  label: string;
  badge?: number;
  /** Highlight the badge in brand color (e.g. unread count) */
  badgeHighlight?: boolean;
}

interface TabButtonProps extends TabProps {
  onClick: () => void;
}

interface TabLinkProps extends TabProps {
  href: string;
}

export function Tab({ active, onClick, icon, label, badge, badgeHighlight }: TabButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`${baseClass} ${active ? activeClass : inactiveClass}`}
    >
      {icon}
      {label}
      {badge !== undefined && (
        <TabBadge active={active} badge={badge} highlight={badgeHighlight} />
      )}
    </button>
  );
}

export function TabLink({ active, href, icon, label, badge, badgeHighlight }: TabLinkProps) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={`${baseClass} ${active ? activeClass : inactiveClass}`}
    >
      {icon}
      {label}
      {badge !== undefined && (
        <TabBadge active={active} badge={badge} highlight={badgeHighlight} />
      )}
    </Link>
  );
}

function TabBadge({ active, badge, highlight }: { active: boolean; badge: number; highlight?: boolean }) {
  const cls = highlight
    ? "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)]"
    : active
      ? "bg-overlay-strong text-text-secondary"
      : "bg-overlay-default text-text-tertiary";

  return (
    <span className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-caption tabular-nums ${cls}`}>
      {badge}
    </span>
  );
}
