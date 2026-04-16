"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BridgeMark } from "@/components/shared/BridgeMark";
import { NotificationBell } from "@/components/NotificationBell";

interface ViewHeaderProps {
  icon?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function ViewHeader({ icon, children, actions, className }: ViewHeaderProps) {
  // Lazy init runs synchronously on first client render; portal target is always
  // present in the layout HTML so this resolves without a deferred re-render.
  const [target] = useState<HTMLElement | null>(() => {
    if (typeof document === "undefined") return null;
    return document.getElementById("view-header-portal");
  });

  if (!target) return null;

  return createPortal(
    <div className={`relative flex items-center justify-between border-b border-white/[0.09] bg-[var(--color-surface-elevated)]/95 px-5 py-3.5${className ? ` ${className}` : ""}`}>
      {/* Top accent gradient */}
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[rgba(26,111,194,0.35)] to-transparent" />
      {/* Left glow */}
      <div className="pointer-events-none absolute left-0 top-0 h-full w-72 bg-[radial-gradient(ellipse_at_left_center,rgba(26,111,194,0.10)_0%,transparent_70%)]" />
      {/* Right glow */}
      <div className="pointer-events-none absolute right-0 top-0 h-full w-48 bg-[radial-gradient(ellipse_at_right_center,rgba(26,111,194,0.05)_0%,transparent_70%)]" />

      {/* Brand: mark + wordmark */}
      <div className="relative flex shrink-0 items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-600)] text-white shadow-[0_2px_10px_rgba(26,111,194,0.35),inset_0_1px_0_rgba(255,255,255,0.15)]">
          <BridgeMark size={22} />
        </div>
        <span className="font-[var(--font-display)] text-[16px] font-extrabold tracking-[-0.04em] text-white/90">
          Bridge
        </span>
      </div>

      {/* Divider between brand and view context */}
      <div className="relative mx-4 h-6 w-px shrink-0 bg-gradient-to-b from-transparent via-white/[0.10] to-transparent" />

      {/* View context: plain icon + title + meta */}
      <div className="relative flex min-w-0 flex-1 items-center gap-3">
        {icon && (
          <span className="shrink-0 flex items-center text-white/30">{icon}</span>
        )}
        {children}
      </div>

      <div className="relative flex items-center gap-2">
        {actions}
        <NotificationBell />
      </div>
    </div>,
    target,
  );
}

export function ViewHeaderTitle({ children }: { children: ReactNode }) {
  return (
    <span className="font-[var(--font-display)] text-[15px] font-semibold tracking-tight text-white/90">
      {children}
    </span>
  );
}

export function ViewHeaderDivider() {
  return <div className="h-6 w-px shrink-0 bg-gradient-to-b from-transparent via-white/[0.12] to-transparent" />;
}
