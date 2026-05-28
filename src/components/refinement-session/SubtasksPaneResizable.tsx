"use client";

import { useState, useEffect, useRef } from "react";

const MIN_PANE_WIDTH = 320;
const MAX_PANE_WIDTH_RATIO = 0.5;

export function SubtasksPaneResizable({ children, width, onWidthChange }: { children: React.ReactNode; width: number; onWidthChange: (w: number) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const paneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDragging) return;
    function handleMouseMove(e: MouseEvent) {
      if (!paneRef.current) return;
      const rect = paneRef.current.getBoundingClientRect();
      const maxW = window.innerWidth * MAX_PANE_WIDTH_RATIO;
      const newW = Math.max(MIN_PANE_WIDTH, Math.min(maxW, rect.right - e.clientX));
      onWidthChange(newW);
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
  }, [isDragging, onWidthChange]);

  return (
    <div
      ref={paneRef}
      className="group/pane relative shrink-0 overflow-y-auto border-l border-border-subtle bg-[var(--color-surface-elevated)] px-6 pt-4 pb-6"
      style={{
        width,
        animation: isDragging ? undefined : "fadeInUp 0.15s ease",
        transition: isDragging ? "none" : "width 200ms cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={(e) => { e.preventDefault(); setIsDragging(true); }}
        className="absolute top-0 left-0 z-20 h-full w-1 cursor-col-resize hover:bg-[var(--color-brand-500)]/30 active:bg-[var(--color-brand-500)]/50"
        style={isDragging ? { backgroundColor: "var(--color-drag-active)" } : {}}
      />
      {children}
    </div>
  );
}
