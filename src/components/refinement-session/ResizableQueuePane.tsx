"use client";

import { useState, useRef, useEffect } from "react";

const DEFAULT_QUEUE_WIDTH = 380;
const MIN_QUEUE_WIDTH = 260;
const MAX_QUEUE_WIDTH_RATIO = 0.45;

export function ResizableQueuePane({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState(DEFAULT_QUEUE_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const paneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDragging) return;
    function handleMouseMove(e: MouseEvent) {
      if (!paneRef.current) return;
      const rect = paneRef.current.getBoundingClientRect();
      const maxW = window.innerWidth * MAX_QUEUE_WIDTH_RATIO;
      const newW = Math.max(MIN_QUEUE_WIDTH, Math.min(maxW, rect.right - e.clientX));
      setWidth(newW);
    }
    function handleMouseUp() { setIsDragging(false); }
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div
      ref={paneRef}
      className="relative shrink-0"
      style={{ width }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={(e) => { e.preventDefault(); setIsDragging(true); }}
        className="absolute top-0 z-20 h-full cursor-col-resize"
        style={{ left: -16, width: 8 }}
      >
        <div
          className="mx-auto h-full w-0.5 hover:bg-[var(--color-brand-500)]/30 active:bg-[var(--color-brand-500)]/50"
          style={isDragging ? { backgroundColor: "rgba(46, 145, 73, 0.5)" } : {}}
        />
      </div>
      {children}
    </div>
  );
}
