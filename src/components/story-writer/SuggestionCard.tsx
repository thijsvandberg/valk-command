"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Card shell                                                         */
/* ------------------------------------------------------------------ */

export function SuggestionCard({
  icon,
  title,
  headerRight,
  children,
  className = "",
  defaultCollapsed = false,
  storageKey,
}: {
  icon: ReactNode;
  title: string;
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
  defaultCollapsed?: boolean;
  // When set, the user's collapse toggle is persisted under this key so it
  // survives reopening the story writer; otherwise falls back to defaultCollapsed.
  storageKey?: string;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    if (storageKey && typeof window !== "undefined") {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === "1") return true;
      if (stored === "0") return false;
    }
    return defaultCollapsed;
  });

  const toggle = () => {
    setCollapsed((v) => {
      const next = !v;
      if (storageKey && typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, next ? "1" : "0");
      }
      return next;
    });
  };

  return (
    <div className={`mt-3 rounded-lg border border-border-default overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={toggle}
        className="flex min-h-8 w-full items-center gap-1.5 px-3 py-1.5 bg-overlay-subtle border-b border-border-default cursor-pointer hover:bg-overlay-default transition-colors duration-150"
      >
        {icon}
        <span className="text-caption font-medium uppercase tracking-[0.06em] text-text-tertiary">
          {title}
        </span>
        {headerRight && <span className="ml-auto flex items-center mr-1.5">{headerRight}</span>}
        <ChevronDown
          size={12}
          strokeWidth={1.5}
          className={`${headerRight ? "" : "ml-auto "}shrink-0 text-text-muted transition-transform duration-150 ${collapsed ? "-rotate-90" : ""}`}
        />
      </button>
      {!collapsed && <div className="divide-y divide-border-subtle">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Applied badge (card header)                                        */
/* ------------------------------------------------------------------ */

export function AppliedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-caption font-medium uppercase tracking-[0.06em] text-text-muted">
      <Check size={11} strokeWidth={2} className="shrink-0" />
      Applied
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Row                                                                */
/* ------------------------------------------------------------------ */

export function SuggestionRow({
  active,
  align = "center",
  className = "",
  children,
}: {
  active: boolean;
  align?: "center" | "start";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex gap-2 px-3 transition-colors duration-150 ${
        align === "start" ? "items-start py-2.5" : "items-center py-1.5"
      } ${active ? "bg-[var(--color-brand-500)]/[0.04]" : "hover:bg-overlay-subtle"} ${className}`}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Score badge                                                        */
/* ------------------------------------------------------------------ */

export function ScoreBadge({ score }: { score: number }) {
  if (score < 0) {
    return <span className="size-5 shrink-0" />;
  }

  const color = score >= 80
    ? "bg-[var(--color-status-success)]/15 text-[var(--color-status-success)]"
    : score >= 60
      ? "bg-[var(--color-status-warning)]/15 text-[var(--color-status-warning)]"
      : "bg-overlay-default text-text-tertiary";

  return (
    <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums leading-none ${color}`}>
      {score}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Link / Linked / Retry button                                       */
/* ------------------------------------------------------------------ */

export function LinkButton({
  linked,
  loading,
  error,
  onLink,
  onUnlink,
}: {
  linked: boolean;
  loading: boolean;
  error?: boolean;
  onLink: () => void;
  onUnlink?: () => void;
}) {
  if (error) {
    return (
      <button
        type="button"
        onClick={onLink}
        className="shrink-0 text-caption font-medium text-[var(--color-status-error)] cursor-pointer hover:text-[var(--color-status-error)] transition-colors duration-150"
      >
        Retry
      </button>
    );
  }

  if (linked) {
    if (onUnlink) {
      return (
        <button
          type="button"
          onClick={onUnlink}
          disabled={loading}
          className="shrink-0 rounded-md px-2.5 py-1 text-caption font-medium bg-[var(--color-brand-500)]/[0.1] text-[var(--color-brand-500)] cursor-pointer hover:bg-[var(--color-status-error)]/10 hover:text-[var(--color-status-error)] transition-colors duration-150 disabled:opacity-50"
        >
          {loading && <Loader2 size={10} className="inline animate-spin mr-1" />}
          Linked
        </button>
      );
    }
    return (
      <span className="shrink-0 rounded-md px-2.5 py-1 text-caption font-medium bg-[var(--color-brand-500)]/[0.1] text-[var(--color-brand-500)]">
        Linked
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onLink}
      disabled={loading}
      className="shrink-0 rounded-md px-2.5 py-1 text-caption font-medium text-text-muted border border-border-default cursor-pointer hover:border-[var(--color-brand-500)]/25 hover:text-[var(--color-brand-500)] hover:bg-[var(--color-brand-500)]/[0.04] active:bg-[var(--color-brand-500)]/[0.08] transition-colors duration-150 disabled:opacity-50"
    >
      {loading ? <Loader2 size={10} className="animate-spin" /> : "Link"}
    </button>
  );
}
