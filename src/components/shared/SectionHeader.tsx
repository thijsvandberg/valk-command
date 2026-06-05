"use client";

import { ChevronDown } from "lucide-react";
import { useSectionCollapsed } from "@/hooks/useSectionCollapsed";

export function SectionHeader({
  title,
  count,
  countLabel,
  actions,
  sectionKey,
  children,
}: {
  title: string;
  count?: number;
  countLabel?: string;
  actions?: React.ReactNode;
  // When set, the heading becomes collapsible and its collapse state is shared
  // globally (per key) across every surface via the section-collapse store.
  sectionKey?: string;
  // Body rendered below the header when expanded. Simple sections pass their
  // body here; complex list sections gate their own body instead.
  children?: React.ReactNode;
}) {
  const { isCollapsed, toggle } = useSectionCollapsed();
  const collapsible = sectionKey !== undefined;
  const collapsed = collapsible ? isCollapsed(sectionKey) : false;

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
          onClick={() => toggle(sectionKey)}
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
