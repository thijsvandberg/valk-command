"use client";

import { useRef, useCallback, useEffect } from "react";
import { usePaneContext, type PaneAppId } from "./PaneContext";
import { ChatApp } from "./apps/ChatApp";
import { EditorApp } from "./apps/EditorApp";
import { DiffApp } from "./apps/DiffApp";
import { HistoryApp } from "./apps/HistoryApp";
import { DraftPreviewApp } from "./apps/DraftPreviewApp";
import { RelatedApp } from "./apps/RelatedApp";
import { StoryPreviewApp } from "./apps/StoryPreviewApp";

function AppComponent({ appId }: { appId: PaneAppId }) {
  switch (appId) {
    case "chat": return <ChatApp />;
    case "editor": return <EditorApp />;
    case "diff": return <DiffApp />;
    case "history": return <HistoryApp />;
    case "draft-preview": return <DraftPreviewApp />;
    case "related": return <RelatedApp />;
    case "story-preview": return <StoryPreviewApp />;
  }
}

interface PaneDividerProps {
  paneIndex: number; // index of the pane to the LEFT of this divider
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
      className="group relative flex w-1 shrink-0 cursor-col-resize items-center justify-center hover:bg-[var(--color-brand-500)]/20 transition-colors duration-150 z-10"
    >
      <div className="h-8 w-0.5 rounded-full bg-white/[0.08] group-hover:bg-[var(--color-brand-500)]/40 transition-colors duration-150" />
    </div>
  );
}

export function PaneArea() {
  const pane = usePaneContext();
  const containerRef = useRef<HTMLDivElement>(null);

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

  const handleDrop = (e: React.DragEvent, paneIdx: 0 | 1 | 2) => {
    e.preventDefault();
    if (pane.draggedApp) {
      pane.moveApp(pane.draggedApp, paneIdx);
      pane.setDraggedApp(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  // All mounted apps are rendered; hidden via CSS when not active in any visible pane
  const allMountedApps = Array.from(pane.mountedApps);

  return (
    <div ref={containerRef} className="flex flex-1 overflow-hidden">
      {Array.from({ length: pane.paneCount }, (_, paneIdx) => {
        const activeApp = pane.paneApps[paneIdx] ?? null;
        const isDragTarget = pane.draggedApp !== null && pane.draggedApp !== activeApp;

        return (
          <div key={paneIdx} className="flex flex-1 min-w-0 overflow-hidden">
            {/* Divider before each pane except the first */}
            {paneIdx > 0 && (
              <PaneDivider paneIndex={paneIdx - 1} onResize={handleResize} />
            )}

            {/* Pane container */}
            <div
              className={`relative flex flex-col overflow-hidden transition-colors duration-100 ${
                isDragTarget ? "ring-1 ring-inset ring-[var(--color-brand-500)]/20" : ""
              }`}
              style={{
                width: `${pane.paneWidths[paneIdx]}%`,
                flex: "none",
              }}
              onDrop={(e) => handleDrop(e, paneIdx as 0 | 1 | 2)}
              onDragOver={handleDragOver}
            >
              {/* Drop overlay when dragging */}
              {isDragTarget && (
                <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[var(--color-brand-500)]/[0.04]">
                  <span className="rounded-lg border border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/10 px-3 py-1.5 text-[11px] text-[var(--color-brand-400)]">
                    Drop here
                  </span>
                </div>
              )}

              {/* App content — each active app rendered, others CSS-hidden */}
              {allMountedApps.map((appId) => (
                <div
                  key={appId}
                  className="flex h-full flex-col overflow-hidden"
                  style={{
                    visibility: activeApp === appId ? "visible" : "hidden",
                    pointerEvents: activeApp === appId ? "auto" : "none",
                    position: activeApp === appId ? "relative" : "absolute",
                    inset: activeApp === appId ? undefined : 0,
                  }}
                >
                  <AppComponent appId={appId} />
                </div>
              ))}

              {/* Empty pane placeholder */}
              {!activeApp && allMountedApps.length === 0 && (
                <div className="flex h-full items-center justify-center text-xs text-white/15">
                  Open an app from the bar above
                </div>
              )}
              {!activeApp && allMountedApps.length > 0 && (
                <div className="flex h-full items-center justify-center text-xs text-white/15">
                  Drop an app here
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
