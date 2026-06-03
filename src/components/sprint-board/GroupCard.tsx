"use client";

import { type ReactNode } from "react";

// Shared card surface for a collapsible group (sprint board groups and the epic
// detail "By sprint" view). One base component so both surfaces stay visually in
// sync: elevated surface, subtle border, soft shadow.
export const GROUP_CARD_CLASS =
  "overflow-hidden rounded-xl border border-border-subtle bg-[var(--color-surface-elevated)] shadow-[var(--shadow-sm)]";

interface GroupCardProps {
  /** The GroupStatBar (or equivalent) shown in the clickable header zone. */
  header: ReactNode;
  /** Optional content pinned to the right of the header (state chip, date range). */
  headerExtras?: ReactNode;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  /** Card body (rows / table), rendered only while expanded. */
  children: ReactNode;
}

export function GroupCard({ header, headerExtras, isCollapsed, onToggleCollapse, children }: GroupCardProps) {
  return (
    <div className={GROUP_CARD_CLASS}>
      <div
        onClick={onToggleCollapse}
        className={`group/grouprow flex cursor-pointer select-none items-center gap-3 bg-[var(--color-surface-chrome)]/30 px-3 py-2.5 hover:bg-[var(--color-surface-chrome)]/50 [transition:background-color_.12s_ease] ${
          isCollapsed ? "" : "border-b border-border-subtle"
        }`}
      >
        <div className="min-w-0 flex-1">{header}</div>
        {headerExtras && <div className="flex shrink-0 items-center gap-3">{headerExtras}</div>}
      </div>
      {!isCollapsed && children}
    </div>
  );
}
