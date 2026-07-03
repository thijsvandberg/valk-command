"use client";

import { type ReactNode } from "react";

// Shared card surface for a collapsible group (sprint board groups and the epic
// detail "By sprint" view). One base component so both surfaces stay visually in
// sync: elevated surface, subtle border, soft shadow.
// `overflow: clip` + a clip-margin still clips content to the rounded corners, but lets the
// row drag handle straddle the left border by a few px instead of being cut off (it would be
// with plain overflow-hidden). The margin is small so nothing else can visibly escape the card.
export const GROUP_CARD_CLASS =
  "overflow-clip [overflow-clip-margin:0.75rem] rounded-xl border border-border-subtle bg-surface-elevated shadow-sm";

interface GroupCardProps {
  /** The GroupStatBar (or equivalent) shown in the clickable header zone. */
  header: ReactNode;
  /** Optional content pinned to the right of the header (state chip, date range). */
  headerExtras?: ReactNode;
  /**
   * Optional action (e.g. a "+" create button) layered on top of the header's
   * right edge. Unlike `headerExtras` it reserves NO space: hidden until the row
   * is hovered/focused (or `floatingActionVisible` is set), it fades in over the
   * existing header content behind a short gradient that masks whatever sits
   * beneath it so nothing reads through the icon.
   */
  floatingAction?: ReactNode;
  /** Forces the floating action visible regardless of hover (e.g. its composer is open). */
  floatingActionVisible?: boolean;
  isCollapsed?: boolean;
  /** Omit to make the card non-collapsible: no chevron affordance, always expanded. */
  onToggleCollapse?: () => void;
  /** Registers the header zone as a DnD drop target (BRDG-452: dropping on an expanded
   *  sprint header moves the dragged batch to that sprint). */
  headerRef?: (el: HTMLElement | null) => void;
  /** Brand ring while a drag hovers the header drop target. */
  headerRing?: boolean;
  /** Card body (rows / table), rendered only while expanded. */
  children: ReactNode;
}

export function GroupCard({
  header,
  headerExtras,
  floatingAction,
  floatingActionVisible = false,
  isCollapsed = false,
  onToggleCollapse,
  headerRef,
  headerRing = false,
  children,
}: GroupCardProps) {
  const collapsible = onToggleCollapse !== undefined;
  const collapsed = collapsible && isCollapsed;
  return (
    <div className={GROUP_CARD_CLASS}>
      <div
        ref={headerRef}
        onClick={onToggleCollapse}
        className={`group/grouprow @container relative flex select-none items-center gap-3 bg-surface-chrome/30 px-3 py-[9px] [transition:background-color_.12s_ease,box-shadow_.12s_ease] ${
          collapsible ? "cursor-pointer hover:bg-surface-chrome/50" : ""
        } ${
          collapsed ? "rounded-xl" : "rounded-t-xl border-b border-border-subtle"
        } ${headerRing ? "shadow-[inset_0_0_0_2px_var(--color-brand-500)]" : ""}`}
      >
        <div className="min-w-0 flex-1">{header}</div>
        {headerExtras && <div className="flex shrink-0 items-center gap-3">{headerExtras}</div>}
        {floatingAction && (
          <div
            // Matches the header's hover background so the gradient masks the
            // content beneath the action; fades in with the action itself.
            className={`pointer-events-none absolute inset-y-0 right-0 flex items-center justify-end pl-12 pr-3 [transition:opacity_.12s_ease] group-hover/grouprow:opacity-100 group-focus-within/grouprow:opacity-100 ${
              collapsed ? "rounded-r-xl" : "rounded-tr-xl"
            } ${floatingActionVisible ? "opacity-100" : "opacity-0"}`}
            style={{
              background:
                "linear-gradient(to left, color-mix(in srgb, var(--color-surface-chrome) 50%, var(--color-surface-elevated)) 60%, transparent 100%)",
            }}
          >
            <div className="pointer-events-auto">{floatingAction}</div>
          </div>
        )}
      </div>
      {!collapsed && children}
    </div>
  );
}
