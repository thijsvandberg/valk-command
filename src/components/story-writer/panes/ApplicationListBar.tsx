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
  Info,
} from "lucide-react";
import { usePaneContext, type PaneAppId } from "./PaneContext";
import { useWriterContext } from "./WriterContext";
import { BarContainer } from "@/components/shared/BarContainer";

const APP_DEFS: Array<{
  id: PaneAppId;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: "chat", label: "Chat", icon: <MessageSquare size={12} strokeWidth={1.5} /> },
  { id: "editor", label: "Editor", icon: <FileText size={12} strokeWidth={1.5} /> },
  { id: "diff", label: "Diff", icon: <GitCompare size={12} strokeWidth={1.5} /> },
  { id: "history", label: "History", icon: <History size={12} strokeWidth={1.5} /> },
  { id: "draft-preview", label: "Draft preview", icon: <Eye size={12} strokeWidth={1.5} /> },
  { id: "related", label: "Related", icon: <Network size={12} strokeWidth={1.5} /> },
  { id: "story-preview", label: "Story preview", icon: <BookOpen size={12} strokeWidth={1.5} /> },
  { id: "meta", label: "Meta", icon: <Info size={12} strokeWidth={1.5} /> },
];

export function ApplicationListBar() {
  const pane = usePaneContext();
  const writer = useWriterContext();

  const visibleApps: Array<{ id: PaneAppId; label: string; icon: React.ReactNode }> = [
    ...APP_DEFS,
    ...(writer.targetTicketKey
      ? [{ id: "split-target" as PaneAppId, label: writer.targetTicketKey, icon: <Scissors size={12} strokeWidth={1.5} /> }]
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
    e.dataTransfer.setData("text/plain", appId);
    pane.setDraggedApp(appId);
  };

  const handleDragEnd = () => {
    pane.setDraggedApp(null);
  };

  return (
    <BarContainer padding="compact" className="gap-1 bg-[var(--color-surface-toolbar)]">
      {/* App list */}
      <div className="flex min-w-0 flex-1 items-center gap-1 xl:gap-2">
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
                className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium cursor-pointer select-none ${
                  isActive
                    ? "bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)]"
                    : "text-text-tertiary hover:text-text-secondary hover:bg-overlay-subtle"
                }`}
                style={{ transition: "color 120ms, background-color 120ms" }}
              >
                <span className={isActive ? "text-[var(--color-brand-400)]" : "text-text-muted"}>
                  {app.icon}
                </span>
                {app.label}
              </button>
            </div>
          );
        })}
      </div>

    </BarContainer>
  );
}
