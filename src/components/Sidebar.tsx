"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef } from "react";
import {
  MessageCircle,
  KanbanSquare,
  GitBranch,
  Gem,
  Layers,
  NotebookPen,
  Users,
  Menu,
  X,
} from "lucide-react";
import { SyncIndicator } from "@/components/sync/SyncIndicator";
import { Button } from "@/components/ui/Button";
import { UserAvatar } from "@/components/sidebar/UserAvatar";
import { UserProfilePopover } from "@/components/sidebar/UserProfilePopover";

const navItems = [
  {
    label: "Sprint Board",
    href: "/sprint-board",
    icon: <KanbanSquare className="h-5 w-5" strokeWidth={1.5} />,
  },
  {
    label: "Epics",
    href: "/epics",
    icon: <Layers className="h-5 w-5" strokeWidth={1.5} />,
  },
  {
    label: "Chat",
    href: "/chat",
    icon: <MessageCircle className="h-5 w-5" strokeWidth={1.5} />,
  },
  {
    label: "Story Writer",
    href: "/story-writer",
    icon: <NotebookPen className="h-5 w-5" strokeWidth={1.5} />,
  },
  {
    label: "Pipelines",
    href: "/pipelines",
    icon: <GitBranch className="h-5 w-5" strokeWidth={1.5} />,
  },
  {
    label: "Refinement",
    href: "/refinement",
    icon: <Gem className="h-5 w-5" strokeWidth={1.5} />,
  },
  {
    label: "Stakeholder",
    href: "/stakeholder",
    icon: <Users className="h-5 w-5" strokeWidth={1.5} />,
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileTriggerRef = useRef<HTMLButtonElement>(null);

  function isActive(href: string) {
    if (href === "/sprint-board") return pathname === "/" || pathname.startsWith("/sprint-board");
    if (href === "/story-writer") return pathname.startsWith("/story-writer") || pathname.endsWith("/write");
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* Mobile toggle button */}
      <Button
        variant="ghost"
        iconOnly
        icon={<Menu className="h-5 w-5 text-text-secondary" strokeWidth={1.5} />}
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 h-10 w-10 rounded-lg bg-[var(--color-surface-elevated)] border-border-default lg:hidden hover:bg-[var(--color-surface-floating)]"
        aria-label="Open sidebar"
      />

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        data-testid="sidebar"
        className={`fixed top-0 left-0 z-50 flex h-full w-[52px] flex-col bg-[var(--color-surface-chrome)] border-r border-border-default lg:border-r-0 transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] lg:relative lg:z-auto lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Mobile header */}
        <div className="flex items-center justify-end py-2.5 px-3 lg:hidden">
          <Button
            variant="ghost"
            iconOnly
            icon={<X className="h-4 w-4 text-text-secondary" strokeWidth={1.5} />}
            onClick={() => setMobileOpen(false)}
            className="h-8 w-8 rounded-lg border-transparent hover:bg-hover-interactive"
            aria-label="Close sidebar"
          />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-1.5" aria-label="Main navigation">
          <ul className="flex flex-col gap-1 pt-3">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    prefetch={true}
                    onClick={() => setMobileOpen(false)}
                    className={`group flex items-center justify-center rounded-lg px-0 py-2.5 text-body-lg font-medium transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                      active
                        ? "bg-[var(--color-brand-600)]/12 text-[var(--color-brand-300)]"
                        : "text-text-secondary hover:bg-hover-list-item hover:text-text-primary active:bg-overlay-default"
                    }`}
                    aria-current={active ? "page" : undefined}
                    title={item.label}
                  >
                    <span className={`shrink-0 ${active ? "text-[var(--color-brand-400)]" : "text-text-tertiary group-hover:text-text-secondary"}`}>
                      {item.icon}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Bottom: sync + profile */}
        <div className="flex flex-col border-t border-border-subtle pt-2 pb-3 gap-2 px-1.5">
          <div className="flex items-center flex-col gap-2">
            <SyncIndicator collapsed={true} />
          </div>
          <UserAvatar
            ref={profileTriggerRef}
            collapsed={true}
            onClick={() => setProfileOpen((prev) => !prev)}
            open={profileOpen}
          />
        </div>

        <UserProfilePopover
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
          triggerRef={profileTriggerRef}
          onNavigate={() => setMobileOpen(false)}
        />

        {/* Sidebar right edge accent */}
        <div className="hidden lg:block absolute top-0 right-0 h-full w-px bg-overlay-default" />
      </aside>
    </>
  );
}
