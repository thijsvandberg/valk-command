"use client";

import { Fragment, useState, useRef, useCallback, useEffect } from "react";
import { usePaneContext, type PaneAppId } from "./PaneContext";
import { ChatApp } from "./apps/ChatApp";
import { EditorApp } from "./apps/EditorApp";
import { DiffApp } from "./apps/DiffApp";
import { HistoryApp } from "./apps/HistoryApp";
import { DraftPreviewApp } from "./apps/DraftPreviewApp";
import { RelatedApp } from "./apps/RelatedApp";
import { StoryPreviewApp } from "./apps/StoryPreviewApp";
import { SplitTargetApp } from "./apps/SplitTargetApp";

function AppComponent({ appId }: { appId: PaneAppId }) {
  switch (appId) {
    case "chat": return <ChatApp />;
    case "editor": return <EditorApp />;
    case "diff": return <DiffApp />;
    case "history": return <HistoryApp />;
    case "draft-preview": return <DraftPreviewApp />;
    case "related": return <RelatedApp />;
    case "story-preview": return <StoryPreviewApp />;
    case "split-target": return <SplitTargetApp />;
  }
}

interface PaneDividerProps {
  paneIndex: number;
  onResize: (paneIndex: number, deltaX: number) => void;
}

function PaneDivider({ paneIndex, onResize }: PaneDividerProps) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    lastX.current = e.clientX;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = e.clientX - lastX.current;
      lastX.current = e.clientX;
      onResize(paneIndex, delta);
    };

    const handleUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [paneIndex, onResize]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className="group relative z-10 flex w-1 shrink-0 cursor-col-resize items-center justify-center transition-colors duration-150 hover:bg-[var(--color-brand-500)]/20"
    >
      <div className="h-8 w-0.5 rounded-full bg-white/[0.08] transition-colors duration-150 group-hover:bg-[var(--color-brand-500)]/40" />
    </div>
  );
}

// Must match EXPAND_SLOT_W in AppToolbar so columns align
const EXPAND_SLOT_W = 72;

export function PaneArea() {
  const pane = usePaneContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);

  const paneWidthsRef = useRef(pane.paneWidths);
  const paneCountRef = useRef(pane.paneCount);
  useEffect(() => { paneWidthsRef.current = pane.paneWidths; }, [pane.paneWidths]);
  useEffect(() => { paneCountRef.current = pane.paneCount; }, [pane.paneCount]);

  const handleResize = useCallback(
    (leftPaneIndex: number, deltaX: number) => {
      if (!containerRef.current) return;
      const totalWidth = containerRef.current.getBoundingClientRect().width;
      if (totalWidth === 0) return;

      const deltaPct = (deltaX / totalWidth) * 100;
      const rightPaneIndex = leftPaneIndex + 1;
      if (rightPaneIndex >= paneCountRef.current) return;

      const prev = paneWidthsRef.current;
      const next: [number, number, number] = [...prev] as [number, number, number];
      next[leftPaneIndex] = next[leftPaneIndex] + deltaPct;
      next[rightPaneIndex] = next[rightPaneIndex] - deltaPct;
      pane.setPaneWidths(next);
    },
    [pane],
  );

  // Reset hovered expand slot when drag ends
  useEffect(() => {
    if (!pane.draggedApp) setHoveredSlot(null);
  }, [pane.draggedApp]);

  const handleDrop = (e: React.DragEvent, paneIdx: 0 | 1 | 2) => {
    e.preventDefault();
    setHoveredSlot(null);
    if (pane.draggedApp) {
      pane.moveApp(pane.draggedApp, paneIdx);
      pane.setDraggedApp(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const allMountedApps = Array.from(pane.mountedApps);

  // Inactive pane slots to show as drop zones during drag
  const expandSlots: (0 | 1 | 2)[] = pane.draggedApp !== null
    ? Array.from({ length: 3 - pane.paneCount }, (_, i) => (pane.paneCount + i) as 0 | 1 | 2)
    : [];
  const totalExtraW = expandSlots.length * EXPAND_SLOT_W;

  // Cumulative left offsets (as % of container) for each pane slot
  const paneLefts: [number, number, number] = [
    0,
    pane.paneWidths[0],
    pane.paneWidths[0] + pane.paneWidths[1],
  ];

  return (
    // relative + overflow-hidden establishes the positioning context for the app layer
    <div ref={containerRef} className="relative flex-1 overflow-hidden">
      {/* Pane column layer: provides dividers, drop zones, and empty-state placeholders */}
      <div className="absolute inset-0 flex">
        {Array.from({ length: pane.paneCount }, (_, paneIdx) => {
          const activeApp = pane.paneApps[paneIdx] ?? null;
          // Ring highlight on every pane during drag; overlay only where the source app isn't
          const isDragging = pane.draggedApp !== null;
          const showDropOverlay = isDragging && activeApp !== pane.draggedApp;

          // Shrink existing panes proportionally to make room for expand slots
          const widthStyle = totalExtraW > 0
            ? `calc(${pane.paneWidths[paneIdx]}% - ${(pane.paneWidths[paneIdx] / 100) * totalExtraW}px)`
            : `${pane.paneWidths[paneIdx]}%`;

          return (
            <Fragment key={paneIdx}>
              {paneIdx > 0 && (
                <PaneDivider paneIndex={paneIdx - 1} onResize={handleResize} />
              )}
              <div
                className={`relative flex flex-none flex-col overflow-hidden transition-colors duration-100 ${
                  isDragging ? "ring-1 ring-inset ring-[var(--color-brand-500)]/25" : ""
                }`}
                style={{ width: widthStyle }}
                onDrop={(e) => handleDrop(e, paneIdx as 0 | 1 | 2)}
                onDragOver={handleDragOver}
              >
                {showDropOverlay && (
                  <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[var(--color-brand-500)]/[0.12]">
                    <span className="rounded-lg border border-[var(--color-brand-500)]/40 bg-[var(--color-surface-base)] px-3 py-1.5 text-[11px] text-[var(--color-brand-400)] shadow-lg">
                      Drop here
                    </span>
                  </div>
                )}
                {!activeApp && (
                  <div className="flex h-full items-center justify-center text-xs text-white/15">
                    {allMountedApps.length === 0
                      ? "Open an app from the bar above"
                      : "Drop an app here"}
                  </div>
                )}
              </div>
            </Fragment>
          );
        })}

        {/* Inactive pane drop slots: thin strips that expand on hover to reveal the drop target */}
        {expandSlots.map((slotIdx) => {
          const isHovered = hoveredSlot === slotIdx;
          return (
            <div key={`expand-${slotIdx}`} className="flex shrink-0 transition-all duration-150" style={{ width: EXPAND_SLOT_W }}>
              <div className="w-px shrink-0 bg-[var(--color-brand-500)]/25" />
              <div
                className={`flex flex-1 flex-col items-center justify-center transition-colors duration-150 ${
                  isHovered
                    ? "bg-[var(--color-brand-500)]/[0.12]"
                    : "bg-[var(--color-brand-500)]/[0.04]"
                }`}
                onDrop={(e) => handleDrop(e, slotIdx)}
                onDragOver={handleDragOver}
                onDragEnter={() => setHoveredSlot(slotIdx)}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setHoveredSlot(null);
                }}
              >
                <span className={`text-[10px] whitespace-nowrap transition-colors duration-150 ${
                  isHovered ? "text-[var(--color-brand-400)]" : "text-[var(--color-brand-400)]/50"
                }`}>
                  {isHovered ? "Drop here" : `+ Pane ${slotIdx + 1}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/*
        App layer: each mounted app rendered ONCE and absolutely positioned over its pane.
        Apps never unmount — they are hidden (visibility: hidden, width: 0) when not in a
        visible pane, which preserves all component state including RichEditor content.
        Use top+bottom=0 instead of h-full so height is correctly resolved against the
        flex-determined container height (h-full = height:100% requires an explicit height
        on the containing block, which flex-1 does not provide).
      */}
      {allMountedApps.map((appId) => {
        const paneIdx = pane.paneApps.findIndex((a) => a === appId);
        const isVisible = paneIdx !== -1 && paneIdx < pane.paneCount;

        return (
          <div
            key={appId}
            className="absolute flex flex-col overflow-hidden"
            style={{
              top: 0,
              bottom: 0,
              left: isVisible ? `${paneLefts[paneIdx]}%` : 0,
              width: isVisible ? `${pane.paneWidths[paneIdx]}%` : 0,
              visibility: isVisible ? "visible" : "hidden",
              // During drag, pass pointer events through to the pane column drop zones below
              pointerEvents: isVisible && !pane.draggedApp ? "auto" : "none",
            }}
          >
            <AppComponent appId={appId} />
          </div>
        );
      })}
    </div>
  );
}
