"use client";

import { usePaneContext, type PaneAppId } from "./PaneContext";
import { useFocusModeContext } from "@/contexts/FocusModeContext";

// Width (px) of each inactive-pane drop slot shown during drag
const EXPAND_SLOT_W = 72;

export function AppToolbar() {
  const pane = usePaneContext();
  const { focusMode } = useFocusModeContext();

  if (focusMode) return null;

  const visiblePaneIndices = ([0, 1, 2] as const).filter((i) => pane.paneVisible[i]);

  // All inactive pane positions (beyond current visibility)
  const expandSlots: (0 | 1 | 2)[] = pane.draggedApp !== null
    ? ([0, 1, 2] as const).filter((i) => !pane.paneVisible[i])
    : [];

  const handleDragStart = (e: React.DragEvent, appId: PaneAppId) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", appId);
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

  // Shrink existing pane sections to make room for expand slots
  const totalExtraW = expandSlots.length * EXPAND_SLOT_W;

  return (
    <div className="relative z-10 flex h-[44px] shrink-0 border-b border-border-default bg-[var(--color-surface-toolbar)]">
      {visiblePaneIndices.map((paneIdx, visPos) => {
        const activeApp = pane.paneApps[paneIdx] ?? null;
        const toolbar = activeApp ? pane.toolbars[activeApp] : null;
        const isDragTarget = pane.draggedApp !== null;

        // Shrink proportionally to accommodate expand slots
        const widthStyle = totalExtraW > 0
          ? `calc(${pane.paneWidths[paneIdx]}% - ${(pane.paneWidths[paneIdx] / 100) * totalExtraW}px)`
          : `${pane.paneWidths[paneIdx]}%`;

        return (
          <div
            key={paneIdx}
            className="flex min-w-0 shrink-0 overflow-x-clip"
            style={{ width: widthStyle }}
          >
            {/* Divider between panes */}
            {visPos > 0 && (
              <div className="w-px shrink-0 bg-overlay-default" />
            )}

            <div
              className={`flex min-w-0 flex-1 items-center gap-2 px-3 transition-colors duration-100 ${
                isDragTarget ? "bg-[var(--color-brand-500)]/[0.06]" : ""
              }`}
              onDrop={(e) => handleDrop(e, paneIdx)}
              onDragOver={handleDragOver}
            >
              {activeApp && toolbar ? (
                <>
                  {/* App label — acts as drag source for active apps */}
                  <div
                    draggable
                    onDragStart={(e) => handleDragStart(e, activeApp)}
                    onDragEnd={handleDragEnd}
                    className="flex shrink-0 select-none cursor-grab items-center gap-1.5 active:cursor-grabbing"
                    title="Drag to move to another pane"
                  >
                    <span className="text-label font-semibold text-text-secondary">
                      {toolbar.label}
                    </span>
                    {toolbar.contextLabel && (
                      <>
                        <span className="text-text-muted text-caption">·</span>
                        <span className="min-w-0 truncate text-label text-text-tertiary">
                          {toolbar.contextLabel}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Left actions — rendered after the label */}
                  {toolbar.actions && (
                    <div className="flex items-center gap-1">
                      {toolbar.actions}
                    </div>
                  )}

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Right actions + close button */}
                  <div className="flex items-center gap-1">
                    {toolbar.rightActions}
                    <button
                      type="button"
                      onClick={() => pane.closeApp(activeApp)}
                      className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-text-tertiary transition-colors duration-100 hover:bg-hover-interactive hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:text-text-tertiary"
                      title={`Close ${toolbar.label}`}
                      aria-label={`Close ${toolbar.label}`}
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M2 2l6 6M8 2l-6 6" />
                      </svg>
                    </button>
                  </div>
                </>
              ) : (
                <span className="text-caption text-text-muted">
                  {isDragTarget ? "Drop here" : `Pane ${paneIdx + 1}`}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* Inactive pane drop slots — one per inactive position */}
      {expandSlots.map((slotIdx) => (
        <div key={slotIdx} className="flex shrink-0" style={{ width: EXPAND_SLOT_W }}>
          <div className="w-px shrink-0 bg-[var(--color-brand-500)]/25" />
          <div
            className="flex flex-1 items-center justify-center bg-[var(--color-brand-500)]/[0.06]"
            onDrop={(e) => handleDrop(e, slotIdx)}
            onDragOver={handleDragOver}
          >
            <span className="text-caption text-[var(--color-brand-400)]/70 whitespace-nowrap">
              + Pane {slotIdx + 1}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
