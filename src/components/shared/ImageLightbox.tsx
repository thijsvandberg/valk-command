"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

export interface GalleryImage {
  src: string;
  alt?: string;
}

interface ImageLightboxProps {
  src: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  loading?: "lazy" | "eager";
  children?: React.ReactNode;
  /**
   * Optional ordered list of sibling images. When supplied, the open modal gains
   * prev/next navigation, arrow-key support and a counter. When absent, the
   * lightbox shows the single `src` exactly as before.
   */
  gallery?: GalleryImage[];
  /** Position of this trigger's image within `gallery`. */
  galleryIndex?: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_CLICK_SCALE = 2.5;
// Wheel delta is large (~100 per notch); this keeps a notch to a gentle zoom step.
const WHEEL_INTENSITY = 0.0015;
// Spring-style ease-out so zoom settles without a flat linear feel; transform only.
const TRANSFORM_TRANSITION = "transform 0.18s cubic-bezier(0.22, 1, 0.36, 1)";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Wraps an image (or custom children) so clicking it opens a fullscreen lightbox.
 * If `children` is provided, it is rendered as the trigger; otherwise a plain <img> is used.
 */
export function ImageLightbox({
  src,
  alt,
  className,
  style,
  loading,
  children,
  gallery,
  galleryIndex,
}: ImageLightboxProps) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(galleryIndex ?? 0);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const draggingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });

  const galleryLen = gallery?.length ?? 0;
  const canPrev = !!gallery && current > 0;
  const canNext = !!gallery && current < galleryLen - 1;

  const activeImage = gallery?.[current];
  const activeSrc = activeImage ? activeImage.src : src;
  const activeAlt = activeImage ? activeImage.alt : alt;

  const resetView = useCallback(() => setView({ scale: 1, x: 0, y: 0 }), []);

  const openLightbox = useCallback(() => {
    setCurrent(galleryIndex ?? 0);
    resetView();
    setOpen(true);
  }, [galleryIndex, resetView]);

  const close = useCallback(() => {
    setOpen(false);
    resetView();
  }, [resetView]);

  // Reset zoom/pan whenever the active image changes (gallery navigation).
  const goTo = useCallback(
    (i: number) => {
      setCurrent(i);
      resetView();
    },
    [resetView],
  );

  // Pan bounds depend on the rendered image; skip when unmeasured (e.g. jsdom).
  const clampOffset = useCallback((off: { x: number; y: number }, scale: number) => {
    const img = imgRef.current;
    if (!img || (!img.offsetWidth && !img.offsetHeight)) return off;
    const maxX = (img.offsetWidth * scale) / 2;
    const maxY = (img.offsetHeight * scale) / 2;
    return { x: clamp(off.x, -maxX, maxX), y: clamp(off.y, -maxY, maxY) };
  }, []);

  // Zoom toward a screen point so the pixel under the cursor stays put.
  const zoomAtPoint = useCallback(
    (computeScale: (s: number) => number, clientX?: number, clientY?: number) => {
      setView((prev) => {
        const next = clamp(computeScale(prev.scale), MIN_SCALE, MAX_SCALE);
        if (next <= MIN_SCALE) return { scale: MIN_SCALE, x: 0, y: 0 };
        let cx = 0;
        let cy = 0;
        const overlay = viewportRef.current;
        if (overlay && clientX !== undefined && clientY !== undefined) {
          const r = overlay.getBoundingClientRect();
          cx = clientX - (r.left + r.width / 2);
          cy = clientY - (r.top + r.height / 2);
        }
        const k = next / prev.scale;
        const raw = { x: cx - k * (cx - prev.x), y: cy - k * (cy - prev.y) };
        const clamped = clampOffset(raw, next);
        return { scale: next, x: clamped.x, y: clamped.y };
      });
    },
    [clampOffset],
  );

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        return;
      }
      if (gallery) {
        if (e.key === "ArrowLeft" && current > 0) {
          e.preventDefault();
          goTo(current - 1);
          return;
        }
        if (e.key === "ArrowRight" && current < galleryLen - 1) {
          e.preventDefault();
          goTo(current + 1);
          return;
        }
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomAtPoint((s) => s + 0.5);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomAtPoint((s) => s - 0.5);
      } else if (e.key === "0") {
        e.preventDefault();
        resetView();
      }
    }
    document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true });
  }, [open, current, galleryLen, gallery, close, goTo, zoomAtPoint, resetView]);

  // Native (non-passive) wheel listener so we can preventDefault page scroll;
  // React's synthetic onWheel is passive and cannot.
  useEffect(() => {
    if (!open) return;
    const el = viewportRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * WHEEL_INTENSITY);
      zoomAtPoint((s) => s * factor, e.clientX, e.clientY);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open, zoomAtPoint]);

  // Prevent body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const onDoubleClick = (e: React.MouseEvent) => {
    zoomAtPoint((s) => (s > MIN_SCALE ? MIN_SCALE : DOUBLE_CLICK_SCALE), e.clientX, e.clientY);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLImageElement>) => {
    if (view.scale <= MIN_SCALE) return;
    draggingRef.current = true;
    setDragging(true);
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    if (e.currentTarget.setPointerCapture) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // jsdom / unsupported: panning still works via move deltas.
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLImageElement>) => {
    if (!draggingRef.current) return;
    const last = lastPointerRef.current;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    setView((prev) => {
      if (prev.scale <= MIN_SCALE) return prev;
      const clamped = clampOffset({ x: prev.x + dx, y: prev.y + dy }, prev.scale);
      return { ...prev, x: clamped.x, y: clamped.y };
    });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLImageElement>) => {
    draggingRef.current = false;
    setDragging(false);
    if (e.currentTarget.releasePointerCapture) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // no-op
      }
    }
  };

  const cursor = view.scale > MIN_SCALE ? (dragging ? "grabbing" : "grab") : "zoom-in";

  const navButtonClass =
    "absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-white/10";
  const buttonTransition = { transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" };

  return (
    <>
      <button
        type="button"
        onClick={openLightbox}
        className="inline cursor-zoom-in border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        aria-label={alt ? `View ${alt} fullscreen` : "View image fullscreen"}
      >
        {children ?? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt ?? ""} className={className} style={style} loading={loading} />
        )}
      </button>

      {open && createPortal(
        <div
          ref={viewportRef}
          className="fixed inset-0 z-modal flex items-center justify-center overflow-hidden bg-black/80 backdrop-blur-sm"
          onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
          role="dialog"
          aria-modal="true"
          aria-label={activeAlt ? `Lightbox: ${activeAlt}` : "Image lightbox"}
        >
          <button
            type="button"
            onClick={close}
            className="absolute top-4 right-4 z-10 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
            style={buttonTransition}
            aria-label="Close lightbox"
          >
            <X size={20} strokeWidth={1.5} />
          </button>

          {gallery && (
            <>
              <button
                type="button"
                onClick={() => canPrev && goTo(current - 1)}
                disabled={!canPrev}
                className={`${navButtonClass} left-4`}
                style={buttonTransition}
                aria-label="Previous image"
              >
                <ChevronLeft size={24} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={() => canNext && goTo(current + 1)}
                disabled={!canNext}
                className={`${navButtonClass} right-4`}
                style={buttonTransition}
                aria-label="Next image"
              >
                <ChevronRight size={24} strokeWidth={1.5} />
              </button>
            </>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={activeSrc}
            alt={activeAlt ?? ""}
            draggable={false}
            onDoubleClick={onDoubleClick}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain select-none"
            style={{
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
              transition: dragging ? "none" : TRANSFORM_TRANSITION,
              cursor,
              touchAction: "none",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
          />

          {(activeAlt || gallery) && (
            <div className="absolute bottom-4 left-1/2 z-10 flex max-w-[90vw] -translate-x-1/2 items-center gap-2">
              {activeAlt && (
                <span className="max-w-[70vw] truncate rounded-full bg-white/10 px-3 py-1.5 text-body-sm text-white/85 backdrop-blur-sm">
                  {activeAlt}
                </span>
              )}
              {gallery && (
                <span className="rounded-full bg-white/10 px-3 py-1.5 text-body-sm font-medium tabular-nums text-white/85 backdrop-blur-sm">
                  {current + 1} / {galleryLen}
                </span>
              )}
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
