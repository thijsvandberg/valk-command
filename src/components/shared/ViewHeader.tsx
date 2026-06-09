"use client";

import { useState, useLayoutEffect, useRef, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Minimize2, Menu } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { NavPanel } from "@/components/nav/NavPanel";
import { useFocusModeContext } from "@/contexts/FocusModeContext";
import { useOutsideClick } from "@/hooks/useOutsideClick";

interface ViewHeaderProps {
  icon?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
  hideNotifications?: boolean;
  /** Drops the separator between the bridge menu and the view context. */
  hideContextDivider?: boolean;
}

export function ViewHeader({ icon, children, actions, className, hideNotifications, hideContextDivider }: ViewHeaderProps) {
  const { toggleFocusMode } = useFocusModeContext();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // useLayoutEffect fires after DOM commit, before the browser paints, so there
  // is no visible flash. It is not called server-side, which means both server
  // and client start with null and there is no hydration mismatch.
  useLayoutEffect(() => {
    // Reading a DOM element after mount and syncing to state is the correct portal
    // pattern to avoid SSR hydration mismatches. The linter rule is overly broad here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTarget(document.getElementById("view-header-portal"));
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // The wrapper holds both the trigger and the dropdown, so clicks on either
  // count as "inside"; Esc and outside-mousedown close it (BRDG-320).
  useOutsideClick(menuRef, closeMenu, { enabled: menuOpen });

  if (!target) return null;

  return createPortal(
    <div className={`relative flex items-center justify-between border-b border-border-strong bg-[var(--color-surface-chrome)] px-5 py-3.5${className ? ` ${className}` : ""}`}>
      {/* Top accent gradient */}
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--color-brand-glow)] to-transparent" />
      {/* Left glow — anchors the command capsule to the brand */}
      <div className="pointer-events-none absolute left-0 top-0 h-full w-80 bg-[radial-gradient(ellipse_at_left_center,color-mix(in_srgb,var(--color-brand-500)_14%,transparent)_0%,transparent_70%)]" />
      {/* Right glow */}
      <div className="pointer-events-none absolute right-0 top-0 h-full w-48 bg-[radial-gradient(ellipse_at_right_center,color-mix(in_srgb,var(--color-brand-500)_5%,transparent)_0%,transparent_70%)]" />

      {/* Command capsule: the wordmark menu trigger + view context grouped into
          one brand-tinted console unit, distinct from the right-side tools. */}
      <div className="relative flex min-w-0 items-center gap-3 py-1.5 pl-2 pr-3.5">
        {/* Trigger + dropdown live in one wrapper so outside-click ignores both. */}
        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Open navigation"
            className="group flex items-center gap-2 rounded-lg px-1.5 py-1 cursor-pointer transition-colors duration-150 hover:bg-hover-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          >
            <Menu className="h-4 w-4 shrink-0 text-text-muted transition-colors duration-150 group-hover:text-[var(--color-brand-300)]" strokeWidth={2} />
            <span className="font-[family-name:var(--font-space-mono)] text-[19px] font-bold lowercase tracking-[-0.02em] text-text-primary">
              bridge<span className="bridge-caret text-[var(--color-brand-400)]">_</span>
            </span>
          </button>
          {/* Mounted only while open: keeps the nav's data hooks off every page
              that merely renders the header, and lets it animate in fresh. */}
          {menuOpen && <NavPanel open onClose={closeMenu} />}
        </div>

        {(icon || children) && !hideContextDivider && (
          <span className="h-5 w-px shrink-0 bg-gradient-to-b from-transparent via-border-strong to-transparent" aria-hidden />
        )}

        {/* View context: plain icon + title + meta (passed by each page) */}
        <div className="relative flex min-w-0 items-center gap-3">
          {icon && <span className="shrink-0 flex items-center text-text-tertiary">{icon}</span>}
          {children}
        </div>
      </div>

      <div className="relative flex shrink-0 items-center gap-2 pl-3">
        {actions}
        {/* Hovering the top-right corner (bell area) smoothly expands the focus-mode toggle into view */}
        <div className="group/corner flex items-center">
          {!hideNotifications && <NotificationBell />}
          <button
            onClick={toggleFocusMode}
            title="Focus mode"
            aria-label="Toggle focus mode"
            className="inline-flex h-7 w-0 ml-0 shrink-0 items-center justify-center overflow-hidden rounded-lg cursor-pointer text-text-tertiary bg-transparent border border-transparent opacity-0 group-hover/corner:w-7 group-hover/corner:ml-2 group-hover/corner:opacity-100 focus-visible:w-7 focus-visible:ml-2 focus-visible:opacity-100 hover:bg-hover-interactive hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.95] transition-[width,margin,opacity,background-color,color,transform] duration-200 ease-out"
          >
            <Minimize2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>,
    target,
  );
}

export function ViewHeaderTitle({ children }: { children: ReactNode }) {
  return (
    <span className="font-[var(--font-display)] text-heading-sm font-semibold tracking-tight text-text-primary">
      {children}
    </span>
  );
}

export function ViewHeaderDivider() {
  return <div className="h-6 w-px shrink-0 bg-gradient-to-b from-transparent via-border-strong to-transparent" />;
}
