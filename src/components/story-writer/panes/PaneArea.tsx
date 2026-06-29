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
import { MetaApp } from "./apps/MetaApp";

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
    case "meta": return <MetaApp />;
  }
}

interface PaneDividerProps {
  leftIdx: number;
  rightIdx: number;
  onResize: (leftIdx: number, rightIdx: number, deltaX: number) => void;
}

function PaneDivider({ leftIdx, rightIdx, onResize }: PaneDividerProps) {
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
      onResize(leftIdx, rightIdx, delta);
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
  }, [leftIdx, rightIdx, onResize]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className="group relative z-10 flex w-1 shrink-0 cursor-col-resize items-center justify-center transition-colors duration-150 hover:bg-[var(--color-brand-500)]/20"
    >
      <div className="h-8 w-0.5 rounded-full bg-overlay-strong transition-colors duration-150 group-hover:bg-[var(--color-brand-500)]/40" />
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
  useEffect(() => { paneWidthsRef.current = pane.paneWidths; }, [pane.paneWidths]);

  const handleResize = useCallback(
    (leftIdx: number, rightIdx: number, deltaX: number) => {
      if (!containerRef.current) return;
      const totalWidth = containerRef.current.getBoundingClientRect().width;
      if (totalWidth === 0) return;

      const deltaPct = (deltaX / totalWidth) * 100;
      const prev = paneWidthsRef.current;
      const next: [number, number, number] = [...prev] as [number, number, number];
      next[leftIdx] += deltaPct;
      next[rightIdx] -= deltaPct;
      pane.setPaneWidths(next);
    },
    [pane],
  );

  // Reset hovered expand slot when any drag ends
  useEffect(() => {
    const handler = () => setHoveredSlot(null);
    document.addEventListener("dragend", handler);
    return () => document.removeEventListener("dragend", handler);
  }, []);

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

  // Only apps in a visible pane slot are rendered (and thus mounted).
  // Hidden apps unmount, freeing their DOM tree, event listeners, and component state.
  // Content-bearing state (editor drafts, titles) is auto-saved to the DB so nothing is lost.
  const visibleApps: PaneAppId[] = ([0, 1, 2] as const)
    .filter((i) => pane.paneVisible[i] && pane.paneApps[i] !== null)
    .map((i) => pane.paneApps[i]!);
  const visiblePaneIndices = ([0, 1, 2] as const).filter((i) => pane.paneVisible[i]);

  // Inactive pane slots shown as drop zones during drag
  const expandSlots: (0 | 1 | 2)[] = pane.draggedApp !== null
    ? ([0, 1, 2] as const).filter((i) => !pane.paneVisible[i])
    : [];
  const totalExtraW = expandSlots.length * EXPAND_SLOT_W;

  // Cumulative left offsets for each pane slot. Non-visible panes have paneWidths = 0,
  // so this formula works correctly for non-consecutive visibility layouts.
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
        {visiblePaneIndices.map((paneIdx, visPos) => {
          const activeApp = pane.paneApps[paneIdx] ?? null;
          const isDragging = pane.draggedApp !== null;

          // Shrink existing panes proportionally to make room for expand slots
          const widthStyle = totalExtraW > 0
            ? `calc(${pane.paneWidths[paneIdx]}% - ${(pane.paneWidths[paneIdx] / 100) * totalExtraW}px)`
            : `${pane.paneWidths[paneIdx]}%`;

          return (
            <Fragment key={paneIdx}>
              {visPos > 0 && (
                <PaneDivider
                  leftIdx={visiblePaneIndices[visPos - 1]}
                  rightIdx={paneIdx}
                  onResize={handleResize}
                />
              )}
              <div
                className={`relative flex flex-none flex-col overflow-hidden transition-colors duration-100 ${
                  isDragging ? "ring-1 ring-inset ring-[var(--color-brand-500)]/25" : ""
                }`}
                style={{ width: widthStyle }}
                onDrop={(e) => handleDrop(e, paneIdx)}
                onDragOver={handleDragOver}
              >
                {!activeApp && (
                  <div className="flex h-full items-center justify-center text-body-sm text-text-muted">
                    Drop an app here
                  </div>
                )}
              </div>
            </Fragment>
          );
        })}

        {/* Inactive pane drop slots: strips with a divider matching PaneDivider width */}
        {expandSlots.map((slotIdx) => {
          const isHovered = hoveredSlot === slotIdx;
          return (
            <div key={`expand-${slotIdx}`} className="flex shrink-0" style={{ width: EXPAND_SLOT_W }}>
              {/* w-1 matches PaneDivider width for visual continuity */}
              <div className="w-1 shrink-0 flex items-center justify-center">
                <div className="h-8 w-0.5 rounded-full bg-overlay-strong" />
              </div>
              <div
                className={`flex flex-1 flex-col items-center justify-center transition-colors duration-150 ${
                  isHovered
                    ? "bg-[var(--color-brand-500)]/[0.15]"
                    : "bg-[var(--color-brand-500)]/[0.05]"
                }`}
                onDrop={(e) => handleDrop(e, slotIdx)}
                onDragOver={handleDragOver}
                onDragEnter={() => setHoveredSlot(slotIdx)}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setHoveredSlot(null);
                }}
              >
                <span className={`text-caption font-medium whitespace-nowrap transition-colors duration-150 ${
                  isHovered ? "text-[var(--color-brand-400)]" : "text-[var(--color-brand-400)]/60"
                }`}>
                  {isHovered ? "Drop here" : `+ Pane ${slotIdx + 1}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* App layer: only visible apps are mounted. Closing/hiding unmounts the component,
         freeing memory. Content state is persisted to the DB so nothing is lost on remount. */}
      {visibleApps.map((appId) => {
        const paneIdx = pane.paneApps.indexOf(appId);
        const showDropOverlay = pane.draggedApp !== null && appId !== pane.draggedApp;

        return (
          <div
            key={appId}
            className="absolute flex flex-col overflow-hidden"
            style={{
              top: 0,
              bottom: 0,
              left: `${paneLefts[paneIdx]}%`,
              width: `${pane.paneWidths[paneIdx]}%`,
              // During drag, pass pointer events through to the pane column drop zones below
              pointerEvents: pane.draggedApp ? "none" : "auto",
            }}
          >
            {/* Drop overlay rendered above app content so it's visible during drag */}
            {showDropOverlay && (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-surface-base/75 backdrop-blur-sm">
                <span className="rounded-lg border border-[var(--color-brand-500)]/40 bg-[var(--color-brand-500)]/15 px-4 py-2 text-label font-medium text-[var(--color-brand-400)] shadow-lg shadow-black/20">
                  Drop here
                </span>
              </div>
            )}
            <AppComponent appId={appId} />
          </div>
        );
      })}
    </div>
  );
}
