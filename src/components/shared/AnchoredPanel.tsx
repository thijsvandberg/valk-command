"use client";

// The one anchored-floating-panel primitive (BRDG-429). Owns anchor/cursor
// positioning (floating-ui), portal-vs-inline rendering, Escape + outside-click
// dismissal, and viewport collision (flip/clamp + optional fit-to-viewport max
// height). Popover, BasePicker, AnchoredMenu/CursorMenu and FilterDropdown all
// route through this instead of hand-rolling the same logic.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  computePosition,
  autoUpdate,
  offset,
  flip,
  shift,
  size,
} from "@floating-ui/dom";
import { useOutsideClick } from "@/hooks/useOutsideClick";

export type AnchoredPlacement =
  | "bottom-start"
  | "bottom-end"
  | "top-start"
  | "top-end";

export interface AnchoredPoint {
  x: number;
  y: number;
}

interface UseAnchoredPositionOptions {
  /** Anchor element (trigger). Ignored when `point` is set. */
  anchorRef?: RefObject<HTMLElement | null>;
  /** Cursor-position mode (context menus): fixed viewport coordinates. */
  point?: AnchoredPoint | null;
  placement?: AnchoredPlacement;
  /** Pixel gap between anchor and panel. */
  gap?: number;
  /** Viewport clamp margin for shift()/size(). Pickers keep the historical 4. */
  shiftPadding?: number;
  /** Report the collision-aware available height (for scrollable menus). */
  fitViewport?: boolean;
  enabled: boolean;
}

export interface UseAnchoredPositionReturn {
  panelRef: RefObject<HTMLDivElement | null>;
  /** Collision-corrected fixed-strategy coordinates; null until computed. */
  pos: AnchoredPoint | null;
  /** Available height in px when fitViewport is on; null otherwise. */
  maxHeight: number | null;
  /**
   * Seed a provisional position from the anchor before opening, for callers
   * that gate rendering on `pos` (the panel must mount before floating-ui can
   * measure it). Call it in the open handler, before flipping `enabled`.
   */
  seed: () => void;
}

export function useAnchoredPosition({
  anchorRef,
  point,
  placement = "bottom-start",
  gap = 4,
  shiftPadding = 8,
  fitViewport = false,
  enabled,
}: UseAnchoredPositionOptions): UseAnchoredPositionReturn {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<AnchoredPoint | null>(null);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  // True once the anchor has been measured with a real layout box. A trigger
  // inside a hover-reveal slot collapses to 0x0 when its row loses :hover -
  // which happens the moment the cursor moves onto the open panel. Positioning
  // against a 0x0 box snaps the panel to the corner, so once measured we hold
  // the last good position while collapsed (BRDG-303).
  const hasMeasuredRef = useRef(false);

  const getReference = useCallback(() => {
    if (point) {
      const { x, y } = point;
      // floating-ui virtual element: a 0-size rect at the cursor point.
      return {
        getBoundingClientRect: () => ({
          x,
          y,
          top: y,
          left: x,
          right: x,
          bottom: y,
          width: 0,
          height: 0,
        }),
      };
    }
    return anchorRef?.current ?? null;
  }, [point, anchorRef]);

  const updatePosition = useCallback(() => {
    const reference = getReference();
    const panel = panelRef.current;
    if (!reference || !panel) return;
    if (!point && anchorRef?.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      const collapsed = rect.width === 0 && rect.height === 0;
      if (collapsed && hasMeasuredRef.current) return;
      if (!collapsed) hasMeasuredRef.current = true;
    }
    void computePosition(reference, panel, {
      strategy: "fixed",
      placement,
      middleware: [
        offset(gap),
        flip(),
        shift({ padding: shiftPadding }),
        ...(fitViewport
          ? [
              size({
                padding: shiftPadding,
                apply({ availableHeight }) {
                  const next = Math.max(0, Math.round(availableHeight));
                  setMaxHeight((prev) => (prev === next ? prev : next));
                },
              }),
            ]
          : []),
      ],
    }).then(({ x, y }) => {
      // Ignore a resolution that lands after the panel has unmounted.
      if (panelRef.current) setPos({ x, y });
    });
  }, [getReference, placement, gap, shiftPadding, fitViewport, point, anchorRef]);

  const seed = useCallback(() => {
    if (point) {
      setPos({ x: point.x, y: point.y });
      return;
    }
    const el = anchorRef?.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(
      placement.startsWith("top")
        ? { x: r.left, y: Math.max(0, r.top - gap) }
        : { x: r.left, y: r.bottom + gap },
    );
  }, [point, anchorRef, gap, placement]);

  // Reset stale coordinates when the panel closes (adjust-state-during-render),
  // so a reopen doesn't flash the panel at its previous position.
  const [prevEnabled, setPrevEnabled] = useState(enabled);
  if (prevEnabled !== enabled) {
    setPrevEnabled(enabled);
    if (!enabled) {
      setPos(null);
      setMaxHeight(null);
    }
  }

  // Keep the panel anchored on scroll, resize, and anchor/panel resize.
  // autoUpdate fires the first measured pass immediately.
  useEffect(() => {
    if (!enabled) return;
    const reference = getReference();
    const panel = panelRef.current;
    if (!reference || !panel) return;
    const dispose = autoUpdate(reference, panel, updatePosition);
    return () => {
      dispose();
      hasMeasuredRef.current = false;
    };
  }, [enabled, getReference, updatePosition]);

  return { panelRef, pos, maxHeight, seed };
}

// ---------------------------------------------------------------------------
// AnchoredPanel component
// ---------------------------------------------------------------------------

const PANEL_SKIN =
  "overflow-hidden rounded-xl border border-border-strong bg-surface-floating shadow-popover";

interface AnchoredPanelProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children" | "role" | "className" | "style"> {
  open: boolean;
  onClose?: () => void;
  /** Anchor element for portal positioning; ignored in inline mode and when `point` is set. */
  anchorRef?: RefObject<HTMLElement | null>;
  /** Cursor-position mode (context menus). Portal only. */
  point?: AnchoredPoint | null;
  placement?: AnchoredPlacement;
  gap?: number;
  /** Portal to document.body with floating-ui positioning (default). Inline
   *  mode renders `absolute top-full` inside the trigger's relative container. */
  portal?: boolean;
  /** Constrain panel height to the available viewport space (menus). The
   *  render-prop children receive the computed maxHeight. */
  fitViewport?: boolean;
  role?: string;
  /** Close on Escape / outside mousedown (default true). Callers that own
   *  dismissal themselves (AnchoredMenu) turn this off. */
  dismissable?: boolean;
  /** Refs treated as inside for outside-click (e.g. the trigger button), so a
   *  trigger click toggles closed instead of close-then-reopen. */
  insideRefs?: RefObject<HTMLElement | null>[];
  /** Exposes the panel element to callers that own outside-click. */
  panelRef?: RefObject<HTMLDivElement | null>;
  /** Inline mode: horizontal alignment against the relative container. */
  align?: "left" | "right";
  /** Inline mode: offset class between trigger and panel. */
  offsetClass?: string;
  /** Skip the default panel skin (border/surface/shadow/rounding). */
  unstyled?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode | ((ctx: { maxHeight: number | null }) => ReactNode);
}

export function AnchoredPanel({
  open,
  onClose,
  anchorRef,
  point,
  placement = "bottom-start",
  gap = 4,
  portal = true,
  fitViewport = false,
  role,
  dismissable = true,
  insideRefs,
  panelRef: externalPanelRef,
  align = "right",
  offsetClass = "mt-1.5",
  unstyled = false,
  className,
  style,
  children,
  ...rest
}: AnchoredPanelProps) {
  const { panelRef, pos, maxHeight } = useAnchoredPosition({
    anchorRef,
    point,
    placement,
    gap,
    fitViewport,
    enabled: open && portal,
  });

  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      panelRef.current = el;
      if (externalPanelRef) externalPanelRef.current = el;
    },
    [panelRef, externalPanelRef],
  );

  useOutsideClick([panelRef, ...(insideRefs ?? [])], () => onClose?.(), {
    enabled: open && dismissable,
  });

  if (!open) return null;

  const content =
    typeof children === "function" ? children({ maxHeight }) : children;
  const skin = unstyled ? "" : ` ${PANEL_SKIN}`;

  if (!portal) {
    const alignClass = align === "left" ? "left-0" : "right-0";
    return (
      <div
        ref={setRefs}
        role={role}
        className={`absolute top-full z-dropdown ${alignClass} ${offsetClass}${skin}${className ? ` ${className}` : ""}`}
        style={style}
        {...rest}
      >
        {content}
      </div>
    );
  }

  if (typeof document === "undefined") return null;

  // Mount at the raw anchor/cursor point first (invisible) so floating-ui can
  // measure the panel's real size, then reveal at the collision-aware position.
  const fallback = point ?? { x: 0, y: 0 };
  return createPortal(
    <div
      ref={setRefs}
      role={role}
      className={`fixed z-popover${skin}${className ? ` ${className}` : ""}`}
      style={{
        left: pos?.x ?? fallback.x,
        top: pos?.y ?? fallback.y,
        visibility: pos ? "visible" : "hidden",
        ...style,
      }}
      {...rest}
    >
      {content}
    </div>,
    document.body,
  );
}
