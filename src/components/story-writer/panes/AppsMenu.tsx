"use client";

import { useRef, useState } from "react";
import {
  MessageSquare,
  FileText,
  GitCompare,
  History,
  Eye,
  Network,
  BookOpen,
  Info,
  Scissors,
  LayoutGrid,
  ChevronDown,
  Check,
} from "lucide-react";
import { usePaneContext, type PaneAppId } from "./PaneContext";
import { useWriterContext } from "./WriterContext";
import { MenuItem, MenuList } from "@/components/shared/MenuItem";
import { Button } from "@/components/ui/Button";
import { useOutsideClick } from "@/hooks/useOutsideClick";

const APP_DEFS: Array<{
  id: PaneAppId;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: "chat", label: "Chat", icon: <MessageSquare size={13} strokeWidth={1.5} /> },
  { id: "editor", label: "Editor", icon: <FileText size={13} strokeWidth={1.5} /> },
  { id: "diff", label: "Diff", icon: <GitCompare size={13} strokeWidth={1.5} /> },
  { id: "history", label: "History", icon: <History size={13} strokeWidth={1.5} /> },
  { id: "draft-preview", label: "Draft preview", icon: <Eye size={13} strokeWidth={1.5} /> },
  { id: "related", label: "Related", icon: <Network size={13} strokeWidth={1.5} /> },
  { id: "story-preview", label: "Story preview", icon: <BookOpen size={13} strokeWidth={1.5} /> },
  { id: "meta", label: "Meta", icon: <Info size={13} strokeWidth={1.5} /> },
];

/**
 * Header dropdown that opens/closes pane apps (BRDG-460). Replaces the old
 * ApplicationListBar toggle bar; the per-app AppToolbar below stays. Rows keep
 * the menu open so several panes can be switched in one visit.
 */
export function AppsMenu() {
  const pane = usePaneContext();
  const writer = useWriterContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => setOpen(false), { enabled: open });

  const entries: Array<{ id: PaneAppId; label: string; icon: React.ReactNode }> = [
    ...APP_DEFS,
    ...(writer.targetTicketKey
      ? [
          {
            id: "split-target" as PaneAppId,
            label: writer.targetTicketKey,
            icon: <Scissors size={13} strokeWidth={1.5} />,
          },
        ]
      : []),
  ];

  const isAppOpen = (appId: PaneAppId): boolean => {
    const idx = pane.paneApps.indexOf(appId);
    return idx >= 0 && pane.paneVisible[idx as 0 | 1 | 2];
  };

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="md"
        icon={<LayoutGrid size={13} strokeWidth={1.5} />}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        Apps
        <ChevronDown
          size={11}
          strokeWidth={1.75}
          className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </Button>

      {open && (
        <MenuList className="absolute right-0 top-full z-30 mt-1.5 w-56" aria-label="Apps">
          {entries.map((app) => {
            const active = isAppOpen(app.id);
            return (
              <MenuItem
                key={app.id}
                icon={app.icon}
                active={active}
                onClick={() => (active ? pane.closeApp(app.id) : pane.openApp(app.id))}
              >
                <span className="min-w-0 flex-1 truncate text-left">{app.label}</span>
                {active && (
                  <Check
                    size={13}
                    strokeWidth={2}
                    className="shrink-0 text-[var(--color-brand-400)]"
                  />
                )}
              </MenuItem>
            );
          })}
        </MenuList>
      )}
    </div>
  );
}
