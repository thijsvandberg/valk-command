"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ImageLightboxProps {
  src: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  loading?: "lazy" | "eager";
  children?: React.ReactNode;
}

/**
 * Wraps an image (or custom children) so clicking it opens a fullscreen lightbox.
 * If `children` is provided, it is rendered as the trigger; otherwise a plain <img> is used.
 */
export function ImageLightbox({ src, alt, className, style, loading, children }: ImageLightboxProps) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true });
  }, [open, close]);

  // Prevent body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
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
          className="fixed inset-0 z-modal flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
          role="dialog"
          aria-modal="true"
          aria-label={alt ? `Lightbox: ${alt}` : "Image lightbox"}
        >
          <button
            type="button"
            onClick={close}
            className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
            style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
            aria-label="Close lightbox"
          >
            <X size={20} strokeWidth={1.5} />
          </button>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt ?? ""}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            style={{
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
          />
        </div>,
        document.body,
      )}
    </>
  );
}
