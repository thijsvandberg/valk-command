"use client";

import {
  MessageSquare,
  FileText,
  GitCompare,
  History,
  Eye,
  Network,
  BookOpen,
  Scissors,
} from "lucide-react";
import { usePaneContext, type PaneAppId } from "./PaneContext";
import { useWriterContext } from "./WriterContext";

const APP_DEFS: Array<{
  id: PaneAppId;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: "chat", label: "Chat", icon: <MessageSquare size={11} strokeWidth={1.5} /> },
  { id: "editor", label: "Editor", icon: <FileText size={11} strokeWidth={1.5} /> },
  { id: "diff", label: "Diff", icon: <GitCompare size={11} strokeWidth={1.5} /> },
  { id: "history", label: "History", icon: <History size={11} strokeWidth={1.5} /> },
  { id: "draft-preview", label: "Draft preview", icon: <Eye size={11} strokeWidth={1.5} /> },
  { id: "related", label: "Related", icon: <Network size={11} strokeWidth={1.5} /> },
  { id: "story-preview", label: "Story preview", icon: <BookOpen size={11} strokeWidth={1.5} /> },
];

const PANE_COUNTS: (1 | 2 | 3)[] = [1, 2, 3];

export function ApplicationListBar() {
  const pane = usePaneContext();
  const writer = useWriterContext();

  const visibleApps: Array<{ id: PaneAppId; label: string; icon: React.ReactNode }> = [
    ...APP_DEFS,
    ...(writer.targetTicketKey
      ? [{ id: "split-target" as PaneAppId, label: writer.targetTicketKey, icon: <Scissors size={11} strokeWidth={1.5} /> }]
      : []),
  ];

  const getAppState = (appId: PaneAppId): { paneIndex: number | null } => {
    const idx = pane.paneApps.indexOf(appId);
    if (idx < 0 || !pane.paneVisible[idx as 0 | 1 | 2]) return { paneIndex: null };
    return { paneIndex: idx };
  };

  const handleAppClick = (appId: PaneAppId) => {
    const { paneIndex } = getAppState(appId);
    if (paneIndex !== null) {
      pane.closeApp(appId);
    } else {
      pane.openApp(appId);
    }
  };

  const handleDragStart = (e: React.DragEvent, appId: PaneAppId) => {
    e.dataTransfer.effectAllowed = "move";
    pane.setDraggedApp(appId);
  };

  const handleDragEnd = () => {
    pane.setDraggedApp(null);
  };

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-white/[0.06] bg-[var(--color-surface-base)] px-3">
      {/* App list */}
      <div className="flex min-w-0 flex-1 items-center gap-0.5">
        {visibleApps.map((app) => {
          const { paneIndex } = getAppState(app.id);
          const isActive = paneIndex !== null;

          return (
            <div
              key={app.id}
              draggable
              onDragStart={(e) => handleDragStart(e, app.id)}
              onDragEnd={handleDragEnd}
              className="group relative"
            >
              <button
                type="button"
                onClick={() => handleAppClick(app.id)}
                className={`flex h-7 items-center gap-1.5 rounded px-2 text-[10px] font-medium cursor-pointer select-none transition-colors duration-100 ${
                  isActive
                    ? "bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/20"
                    : "text-white/35 hover:text-white/60 hover:bg-white/[0.04]"
                }`}
              >
                <span className={isActive ? "text-[var(--color-brand-400)]" : "text-white/25"}>
                  {app.icon}
                </span>
                {app.label}
                {isActive && (
                  <span className="ml-0.5 text-[9px] text-[var(--color-brand-400)]/60 tabular-nums">
                    {paneIndex! + 1}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Divider */}
      <div className="mx-1 h-4 w-px bg-white/[0.08]" />

      {/* Pane count toggle */}
      <div className="flex items-center gap-0.5">
        <span className="mr-1 text-[9px] text-white/20 uppercase tracking-wider">Panes</span>
        {PANE_COUNTS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => pane.setPaneCount(n)}
            className={`flex h-6 w-6 items-center justify-center rounded text-[11px] font-medium cursor-pointer transition-colors duration-100 ${
              pane.paneCount === n
                ? "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/25"
                : "text-white/30 hover:text-white/55 hover:bg-white/[0.04]"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
