"use client";

// Portal-positioned menu surfaces (AnchoredMenu, CursorMenu) plus the hover-flyout
// primitive and the quick-move icons, split out of ticket-action-menu.tsx (BRDG-415).
// The composer and the row-action consumers import these from here.

import { useState, useRef, useLayoutEffect, type ReactNode, type RefObject } from "react";
import type { QuickMoveOption } from "@/lib/quick-moves";
import { ArrowRight, Inbox, ChevronRight } from "lucide-react";
import { AnchoredPanel } from "@/components/shared/AnchoredPanel";
import { Card } from "@/components/shared/Card";
import { MenuItem } from "@/components/shared/MenuItem";

/**
 * Trigger-anchored portal menu. Positioning/collision comes from the shared
 * AnchoredPanel primitive (BRDG-429); dismissal stays with the caller, which
 * owns the open state and outside-click via the passed `menuRef`.
 */
export function AnchoredMenu({
  anchorRef,
  menuRef,
  width,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
  width: string;
  children: ReactNode;
}) {
  return (
    <AnchoredPanel
      open
      anchorRef={anchorRef}
      placement="bottom-start"
      gap={6}
      fitViewport
      dismissable={false}
      panelRef={menuRef}
      role="menu"
      unstyled
    >
      {({ maxHeight }) => (
        <Card variant="floating" className={`${width} overflow-visible py-1`} style={{ maxHeight: maxHeight ?? undefined }}>
          {children}
        </Card>
      )}
    </AnchoredPanel>
  );
}

// ---------------------------------------------------------------------------
// Cursor-positioned portal menu (for right-click context menus)
// ---------------------------------------------------------------------------

/**
 * Renders menu content in a portal at a fixed cursor position. Viewport
 * clamping/flip and dismissal (outside mousedown + Escape) come from the
 * shared AnchoredPanel primitive. Same floating-card styling as AnchoredMenu
 * so both menu surfaces look identical.
 */
export function CursorMenu({
  x,
  y,
  width = "w-[320px]",
  onClose,
  children,
}: {
  x: number;
  y: number;
  width?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <AnchoredPanel
      open
      onClose={onClose}
      point={{ x, y }}
      placement="bottom-start"
      gap={0}
      fitViewport
      role="menu"
      unstyled
    >
      {({ maxHeight }) => (
        <Card variant="floating" className={`${width} overflow-visible py-1`} style={{ maxHeight: maxHeight ?? undefined }}>
          {children}
        </Card>
      )}
    </AnchoredPanel>
  );
}

// ---------------------------------------------------------------------------
// Dropdown menu item — now the shared primitive (BRDG-421) so the context menu,
// the bulk-action bar and every other menu share one row recipe (incl. the
// focus-visible ring). Re-exported so existing importers (e.g. BulkActionBar)
// keep resolving it from here.
// ---------------------------------------------------------------------------

export { MenuItem };

// Floating-card styling shared by the hover flyouts and the menu surfaces.
const FLYOUT_PANEL = "rounded-xl border border-border-default bg-surface-floating shadow-lg";

// Per-destination icons for the inline quick-moves (BRDG-374): active = a dot, next =
// arrow-right, backlog = inbox. "More sprints" uses the move (arrow-left-right) icon.
export const QUICK_MOVE_ICON: Record<QuickMoveOption["id"], ReactNode> = {
  // Solid green dot, matching the "active sprint" indicator on the board (GroupStatBar).
  active: <span className="h-2 w-2 rounded-full bg-[var(--color-status-success)]" />,
  next: <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />,
  backlog: <Inbox className="h-3.5 w-3.5" strokeWidth={1.5} />,
};

/**
 * A menu row whose sub-content opens to the SIDE on hover (BRDG-374), matching the
 * /dev/exploration prototype - no click, no Back. Nesting works because
 * `group-hover/fly` targets the nearest `group/fly` ancestor and hovering any
 * descendant keeps every ancestor hovered; the `pl-1` gap bridges trigger -> panel.
 */
// Each flyout owns its open state rather than relying on CSS `group-hover`: nested
// flyouts reused the same `group/fly` name, so a child's `group-hover/fly` also matched
// the parent's hover and every sub-panel opened at once. Tracking hover per instance
// (onPointerEnter/Leave) keeps each level independent.
//
// `nested` flyouts hold other flyouts (e.g. Update), so their panel must NOT clip:
// overflow-y-auto computes overflow-x to auto too, which would cut off a child flyout
// that opens beside it. Leaf flyouts keep overflow-y-auto so a long picker can scroll.
export function Flyout({ icon, label, width = "w-[240px]", nested = false, children }: { icon?: ReactNode; label: ReactNode; width?: string; nested?: boolean; children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"right" | "left">("right");
  // How far to shift the panel UP from its trigger-aligned position so it never runs off
  // the bottom of the viewport (the panel opens downward; a low trigger would clip it).
  const [topShift, setTopShift] = useState(0);
  // Keep the rendered panel inside the viewport: flip horizontally when it overruns the
  // right/left edge, and shift up when it overruns the bottom. Measured from the actual
  // panel + trigger, so it is robust however deep the flyout is nested.
  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const outer = outerRef.current;
    if (!panel || !outer) return;
    const margin = 8;
    const rect = panel.getBoundingClientRect();
    if (side === "right" && rect.right > window.innerWidth - margin) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSide("left");
    } else if (side === "left" && rect.left < margin) {
       
      setSide("right");
    }
    // Vertical: the panel's top sits at `outerTop + topShift`; compute the shift that keeps
    // its bottom on-screen without pushing its top above the margin. Absolute (not
    // incremental), so it settles in one correction.
    const outerTop = outer.getBoundingClientRect().top;
    const height = panel.offsetHeight;
    let nextShift = 0;
    if (outerTop + height > window.innerHeight - margin) {
      nextShift = window.innerHeight - margin - height - outerTop;
      if (outerTop + nextShift < margin) nextShift = margin - outerTop;
    }
     
    if (nextShift !== topShift) setTopShift(nextShift);
  }, [open, side, topShift]);
  return (
    <div ref={outerRef} className="relative" onPointerEnter={() => setOpen(true)} onPointerLeave={() => { setOpen(false); setTopShift(0); }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-list-item focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${open ? "bg-hover-list-item" : ""}`}
      >
        {icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center text-text-tertiary">{icon}</span>}
        {label}
        <ChevronRight className="ml-auto h-3.5 w-3.5 text-text-muted" strokeWidth={1.5} />
      </button>
      {/* Panel stays mounted (so it can be measured/queried) but is only shown for this
          flyout's own hover. */}
      <div
        style={{ top: topShift }}
        className={`absolute z-20 transition-opacity duration-100 ${open ? "visible opacity-100" : "invisible opacity-0"} ${side === "left" ? "right-full pr-1" : "left-full pl-1"}`}
      >
        <div ref={panelRef} role="menu" className={`${FLYOUT_PANEL} ${width} ${nested ? "overflow-visible" : "max-h-[min(70vh,440px)] overflow-y-auto"} py-1`}>{children}</div>
      </div>
    </div>
  );
}
