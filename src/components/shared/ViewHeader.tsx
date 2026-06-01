"use client";

import { useState, useLayoutEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Minimize2 } from "lucide-react";
import { BridgeMark } from "@/components/shared/BridgeMark";
import { NotificationBell } from "@/components/NotificationBell";
import { useFocusModeContext } from "@/contexts/FocusModeContext";

interface ViewHeaderProps {
  icon?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
  hideNotifications?: boolean;
}

export function ViewHeader({ icon, children, actions, className, hideNotifications }: ViewHeaderProps) {
  const { toggleFocusMode } = useFocusModeContext();
  const [target, setTarget] = useState<HTMLElement | null>(null);

  // useLayoutEffect fires after DOM commit, before the browser paints, so there
  // is no visible flash. It is not called server-side, which means both server
  // and client start with null and there is no hydration mismatch.
  useLayoutEffect(() => {
    // Reading a DOM element after mount and syncing to state is the correct portal
    // pattern to avoid SSR hydration mismatches. The linter rule is overly broad here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTarget(document.getElementById("view-header-portal"));
  }, []);

  if (!target) return null;

  return createPortal(
    <div className={`relative flex items-center justify-between border-b border-border-strong bg-[var(--color-surface-chrome)] px-5 py-3.5${className ? ` ${className}` : ""}`}>
      {/* Top accent gradient */}
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--color-brand-glow)] to-transparent" />
      {/* Left glow */}
      <div className="pointer-events-none absolute left-0 top-0 h-full w-72 bg-[radial-gradient(ellipse_at_left_center,color-mix(in_srgb,var(--color-brand-500)_10%,transparent)_0%,transparent_70%)]" />
      {/* Right glow */}
      <div className="pointer-events-none absolute right-0 top-0 h-full w-48 bg-[radial-gradient(ellipse_at_right_center,color-mix(in_srgb,var(--color-brand-500)_5%,transparent)_0%,transparent_70%)]" />

      {/* Brand: mark + wordmark */}
      <div className="relative flex shrink-0 items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-600)] text-white shadow-[0_2px_10px_var(--color-brand-glow),inset_0_1px_0_var(--color-text-muted)]">
          <BridgeMark size={22} />
        </div>
        <span className="font-[var(--font-display)] text-heading-sm font-extrabold tracking-[-0.04em] text-text-primary">
          Bridge
        </span>
      </div>

      {/* Divider between brand and view context */}
      <div className="relative mx-4 h-6 w-px shrink-0 bg-gradient-to-b from-transparent via-border-strong to-transparent" />

      {/* View context: plain icon + title + meta */}
      <div className="relative flex min-w-0 flex-1 items-center gap-3">
        {icon && (
          <span className="shrink-0 flex items-center text-text-tertiary">{icon}</span>
        )}
        {children}
      </div>

      <div className="relative flex items-center gap-2">
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
