"use client";

import { useRef, useState } from "react";
import { LayoutGrid, ChevronDown, Check, LayoutList, FileText, PenLine, CalendarRange, MessageSquare } from "lucide-react";
import { MenuItem, MenuList } from "@/components/shared/MenuItem";
import { Button } from "@/components/ui/Button";
import { useOutsideClick } from "@/hooks/useOutsideClick";

export type EpicRightView = "breakdown" | "sprints" | "draft" | "child";

// Sprints sits next to Breakdown: the two are the decomposition/planning pair the
// PO moves between (BRDG-486), with Draft as the reference document after them.
const BASE_VIEWS: Array<{ id: EpicRightView; label: string; icon: React.ReactNode }> = [
  { id: "breakdown", label: "Breakdown", icon: <LayoutList size={13} strokeWidth={1.5} /> },
  { id: "sprints", label: "Sprints", icon: <CalendarRange size={13} strokeWidth={1.5} /> },
  { id: "draft", label: "Draft", icon: <FileText size={13} strokeWidth={1.5} /> },
];

/**
 * The Epic Writer's content-view switcher (BRDG-484). Mirrors the Story Writer's
 * AppsMenu affordance (grid button + dropdown of checkable views) using the same
 * shared menu primitives, but the epic has a single content region, so the views
 * are mutually exclusive (pick one). It intentionally does not reuse the Story
 * Writer's AppsMenu component, which is bound to the full multi-pane system and a
 * hardcoded list of story-writer apps.
 */
export function EpicAppsMenu({
  view,
  onSelect,
  childKey,
  chatVisible,
  onToggleChat,
}: {
  view: EpicRightView;
  onSelect: (v: EpicRightView) => void;
  /** When a child story is open in-place (BRDG-485), it is listed as a third view. */
  childKey?: string | null;
  /** Whether the chat pane is currently shown (BRDG-487 #3). */
  chatVisible?: boolean;
  /** Toggle the chat pane on/off. When provided, "Chat" is listed as a toggleable app. */
  onToggleChat?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => setOpen(false), { enabled: open });

  const views = childKey
    ? [...BASE_VIEWS, { id: "child" as EpicRightView, label: childKey, icon: <PenLine size={13} strokeWidth={1.5} /> }]
    : BASE_VIEWS;

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
        <MenuList className="absolute right-0 top-full z-30 mt-1.5 w-56" aria-label="Views">
          {/* Chat is a toggleable pane (BRDG-487 #3), not one of the mutually
              exclusive right-region views: it stays open on toggle so the PO can
              flip it and watch the layout change, and sits above a divider. */}
          {onToggleChat && (
            <>
              <MenuItem
                icon={<MessageSquare size={13} strokeWidth={1.5} />}
                active={!!chatVisible}
                onClick={onToggleChat}
              >
                <span className="min-w-0 flex-1 truncate text-left">Chat</span>
                {chatVisible && (
                  <Check size={13} strokeWidth={2} className="shrink-0 text-[var(--color-brand-400)]" />
                )}
              </MenuItem>
              <div className="my-1 h-px bg-overlay-default" aria-hidden />
            </>
          )}
          {views.map((v) => {
            const active = view === v.id;
            return (
              <MenuItem
                key={v.id}
                icon={v.icon}
                active={active}
                onClick={() => {
                  onSelect(v.id);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1 truncate text-left">{v.label}</span>
                {active && (
                  <Check size={13} strokeWidth={2} className="shrink-0 text-[var(--color-brand-400)]" />
                )}
              </MenuItem>
            );
          })}
        </MenuList>
      )}
    </div>
  );
}
