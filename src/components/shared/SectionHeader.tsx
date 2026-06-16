"use client";

import { ChevronDown } from "lucide-react";
import { useSectionCollapsed } from "@/hooks/useSectionCollapsed";

export function SectionHeader({
  title,
  count,
  countLabel,
  actions,
  sectionKey,
  defaultCollapsed = false,
  collapsed: collapsedProp,
  onToggle,
  children,
}: {
  title: string;
  count?: number;
  countLabel?: string;
  actions?: React.ReactNode;
  // When set, the heading becomes collapsible and its collapse state is shared
  // globally (per key) across every surface via the section-collapse store.
  sectionKey?: string;
  // Collapse state to assume until the user toggles this section. Lets a section
  // start collapsed (e.g. an empty list) while still honouring an explicit toggle.
  defaultCollapsed?: boolean;
  // Controlled mode: when `collapsed`/`onToggle` are supplied the heading uses
  // them instead of the shared store. Used for ephemeral, per-instance collapse
  // (e.g. an empty Linked Issues section) that must not persist across tickets.
  collapsed?: boolean;
  onToggle?: () => void;
  // Body rendered below the header when expanded. Simple sections pass their
  // body here; complex list sections gate their own body instead.
  children?: React.ReactNode;
}) {
  const { isCollapsed, toggle } = useSectionCollapsed();
  const controlled = collapsedProp !== undefined;
  const collapsible = controlled || sectionKey !== undefined;
  const collapsed = controlled
    ? collapsedProp
    : sectionKey !== undefined
      ? isCollapsed(sectionKey, defaultCollapsed)
      : false;
  const handleToggle = controlled
    ? onToggle
    : sectionKey !== undefined
      ? () => toggle(sectionKey, defaultCollapsed)
      : undefined;

  const badge = countLabel ? (
    <span className="flex h-5 items-center rounded-full bg-overlay-default px-1.5 text-caption font-medium tabular-nums text-text-tertiary">
      {countLabel}
    </span>
  ) : count !== undefined && count > 0 ? (
    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-overlay-default px-1.5 text-caption font-medium tabular-nums text-text-tertiary">
      {count}
    </span>
  ) : null;

  const heading = (
    <h3 className="font-[var(--font-display)] text-body-lg font-semibold text-text-primary">{title}</h3>
  );

  if (!collapsible) {
    return (
      <div className="flex items-center gap-2 border-b border-border-default pb-2">
        {heading}
        {badge}
        {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border-default pb-2">
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={!collapsed}
          className="group/section flex min-w-0 items-center gap-2 rounded-sm border-0 bg-transparent p-0 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:opacity-80"
        >
          <ChevronDown
            size={14}
            strokeWidth={1.5}
            className={`shrink-0 text-text-muted group-hover/section:text-text-secondary ${collapsed ? "-rotate-90" : ""}`}
            style={{ transition: "transform 0.2s ease, color 0.15s ease" }}
          />
          {heading}
          {badge}
        </button>
        {actions && !collapsed && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
      </div>
      {!collapsed && children}
    </>
  );
}
