"use client";

import { usePaneContext, type PaneAppId } from "./PaneContext";

export function AppToolbar() {
  const pane = usePaneContext();

  const visiblePanes = Array.from({ length: pane.paneCount }, (_, i) => i);

  const handleDragStart = (e: React.DragEvent, appId: PaneAppId) => {
    e.dataTransfer.effectAllowed = "move";
    pane.setDraggedApp(appId);
  };

  const handleDragEnd = () => {
    pane.setDraggedApp(null);
  };

  const handleDrop = (e: React.DragEvent, paneIndex: 0 | 1 | 2) => {
    e.preventDefault();
    if (pane.draggedApp) {
      pane.moveApp(pane.draggedApp, paneIndex);
      pane.setDraggedApp(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  // When dragging, show a drop zone for the next unopened pane slot (paneCount 1→2 or 2→3)
  const showExpandSlot = pane.draggedApp !== null && pane.paneCount < 3;
  const expandSlotIndex = pane.paneCount as 0 | 1 | 2;

  return (
    <div className="flex h-[42px] shrink-0 border-b border-white/[0.06] bg-[var(--color-surface-base)]">
      {visiblePanes.map((paneIdx, i) => {
        const activeApp = pane.paneApps[paneIdx] ?? null;
        const toolbar = activeApp ? pane.toolbars[activeApp] : null;
        const isDragTarget = pane.draggedApp !== null;

        return (
          <div
            key={paneIdx}
            className="flex min-w-0 shrink-0 overflow-hidden"
            style={{ width: `${pane.paneWidths[paneIdx]}%` }}
          >
            {/* Divider between panes */}
            {i > 0 && (
              <div className="w-px shrink-0 bg-white/[0.06]" />
            )}

            <div
              className={`flex min-w-0 flex-1 items-center gap-2 px-3 transition-colors duration-100 ${
                isDragTarget ? "bg-[var(--color-brand-500)]/[0.06]" : ""
              }`}
              onDrop={(e) => handleDrop(e, paneIdx as 0 | 1 | 2)}
              onDragOver={handleDragOver}
            >
              {activeApp && toolbar ? (
                <>
                  {/* App label — acts as drag source for active apps */}
                  <div
                    draggable
                    onDragStart={(e) => handleDragStart(e, activeApp)}
                    onDragEnd={handleDragEnd}
                    className="flex shrink-0 cursor-grab items-center gap-1.5 active:cursor-grabbing"
                    title="Drag to move to another pane"
                  >
                    <span className="text-[11px] font-semibold text-white/70">
                      {toolbar.label}
                    </span>
                    {toolbar.contextLabel && (
                      <>
                        <span className="text-white/20 text-[10px]">·</span>
                        <span className="min-w-0 truncate text-[11px] text-white/35">
                          {toolbar.contextLabel}
                        </span>
                      </>
                    )}
                  </div>

                  {/* App-specific actions */}
                  {toolbar.actions && (
                    <div className="flex items-center gap-1">
                      {toolbar.actions}
                    </div>
                  )}
                </>
              ) : (
                <span className="text-[10px] text-white/15">
                  {isDragTarget ? "Drop here" : `Pane ${paneIdx + 1}`}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* Extra drop zone: drop here to open a new pane */}
      {showExpandSlot && (
        <div className="flex w-36 shrink-0">
          <div className="w-px shrink-0 bg-white/[0.06]" />
          <div
            className="flex flex-1 items-center justify-center px-3 bg-[var(--color-brand-500)]/[0.06] transition-colors duration-100"
            onDrop={(e) => handleDrop(e, expandSlotIndex)}
            onDragOver={handleDragOver}
          >
            <span className="text-[10px] text-[var(--color-brand-400)]/70">
              + Open in new pane
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
