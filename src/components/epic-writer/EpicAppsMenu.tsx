"use client";

import { useRef, useState } from "react";
import { LayoutGrid, ChevronDown, Check, LayoutList, FileText } from "lucide-react";
import { MenuItem, MenuList } from "@/components/shared/MenuItem";
import { Button } from "@/components/ui/Button";
import { useOutsideClick } from "@/hooks/useOutsideClick";

export type EpicRightView = "breakdown" | "draft";

const VIEWS: Array<{ id: EpicRightView; label: string; icon: React.ReactNode }> = [
  { id: "breakdown", label: "Breakdown", icon: <LayoutList size={13} strokeWidth={1.5} /> },
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
}: {
  view: EpicRightView;
  onSelect: (v: EpicRightView) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => setOpen(false), { enabled: open });

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
          {VIEWS.map((v) => {
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
