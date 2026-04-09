"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore, useCallback } from "react";
import {
  LayoutGrid,
  MessageCircle,
  KanbanSquare,
  FlaskConical,
  SlidersHorizontal,
  Clock,
  Users,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { SyncIndicator } from "@/components/sync/SyncIndicator";
import { Button } from "@/components/ui/Button";

const navItems = [
  {
    label: "Dashboard",
    href: "/",
    icon: <LayoutGrid className="h-5 w-5" strokeWidth={1.5} />,
  },
  {
    label: "Chat",
    href: "/chat",
    icon: <MessageCircle className="h-5 w-5" strokeWidth={1.5} />,
  },
  {
    label: "Sprint Board",
    href: "/sprint-board",
    icon: <KanbanSquare className="h-5 w-5" strokeWidth={1.5} />,
  },
  {
    label: "Test Center",
    href: "/test-center",
    icon: <FlaskConical className="h-5 w-5" strokeWidth={1.5} />,
  },
  {
    label: "Refinement",
    href: "/refinement",
    icon: <SlidersHorizontal className="h-5 w-5" strokeWidth={1.5} />,
  },
  {
    label: "Jobs",
    href: "/jobs",
    icon: <Clock className="h-5 w-5" strokeWidth={1.5} />,
  },
  {
    label: "Stakeholder",
    href: "/stakeholder",
    icon: <Users className="h-5 w-5" strokeWidth={1.5} />,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: <Settings className="h-5 w-5" strokeWidth={1.5} />,
  },
];

const STORAGE_KEY = "sidebar-collapsed";

function subscribeToStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getCollapsedSnapshot(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function getCollapsedServerSnapshot(): boolean {
  return false;
}

export default function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const collapsed = useSyncExternalStore(
    subscribeToStorage,
    getCollapsedSnapshot,
    getCollapsedServerSnapshot,
  );

  const toggleCollapsed = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(!collapsed));
      // Dispatch storage event so useSyncExternalStore picks up the change
      window.dispatchEvent(new Event("storage"));
    } catch { /* noop */ }
  }, [collapsed]);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    if (href === "/sprint-board") return pathname.startsWith("/sprint-board") || pathname.startsWith("/tickets/");
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* Mobile toggle button */}
      <Button
        variant="ghost"
        iconOnly
        icon={<Menu className="h-5 w-5 text-white/70" strokeWidth={1.5} />}
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 h-10 w-10 rounded-lg bg-[var(--color-surface-elevated)] border-white/[0.06] lg:hidden hover:bg-[var(--color-surface-floating)]"
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
        className={`fixed top-0 left-0 z-50 flex h-full flex-col bg-[var(--color-surface-elevated)] border-r border-white/[0.06] lg:border-r-0 transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] lg:relative lg:translate-x-0 ${
          collapsed ? "w-[52px]" : "w-64"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Header */}
        <div className={`flex items-center border-b border-white/[0.06] py-3.5 ${collapsed ? "justify-center px-2" : "gap-3 px-5"}`}>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden lg:flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-600)] shadow-[0_2px_10px_rgba(46,145,73,0.35),inset_0_1px_0_rgba(255,255,255,0.15)] cursor-pointer hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-95 transition-all duration-150"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <span className="font-[var(--font-display)] text-[13px] font-black tracking-tighter text-white">
              vc
            </span>
          </button>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-600)] shadow-[0_2px_10px_rgba(46,145,73,0.35),inset_0_1px_0_rgba(255,255,255,0.15)] lg:hidden">
            <span className="font-[var(--font-display)] text-[13px] font-black tracking-tighter text-white">
              vc
            </span>
          </div>
          {!collapsed && (
            <span className="font-[var(--font-display)] text-[15px] font-semibold tracking-tight text-white/90">
              valk-command
            </span>
          )}

          {/* Mobile close button */}
          <Button
            variant="ghost"
            iconOnly
            icon={<X className="h-4 w-4 text-white/50" strokeWidth={1.5} />}
            onClick={() => setMobileOpen(false)}
            className="ml-auto h-8 w-8 rounded-lg lg:hidden border-transparent hover:bg-white/[0.06]"
            aria-label="Close sidebar"
          />
        </div>

        {/* Navigation */}
        <nav className={`flex-1 overflow-y-auto ${collapsed ? "px-1.5" : "px-3"}`} aria-label="Main navigation">
          <ul className="flex flex-col gap-1 pt-2">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`group flex items-center ${collapsed ? "justify-center" : "gap-3"} rounded-lg ${collapsed ? "px-0 py-2.5" : "px-3 py-2.5"} text-sm font-medium transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                      active
                        ? "bg-[var(--color-brand-600)]/12 text-[var(--color-brand-300)]"
                        : "text-white/50 hover:bg-white/[0.04] hover:text-white/80 active:bg-white/[0.06]"
                    }`}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                  >
                    <span className={`shrink-0 ${active ? "text-[var(--color-brand-400)]" : "text-white/30 group-hover:text-white/50"}`}>
                      {item.icon}
                    </span>
                    {!collapsed && (
                      <span className="font-[var(--font-body)]">{item.label}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Sync status */}
        <div className={`${collapsed ? "px-1.5 flex justify-center" : "px-3"} pb-2`}>
          <SyncIndicator collapsed={collapsed} />
        </div>

        {/* Sidebar right edge accent */}
        <div className="hidden lg:block absolute top-0 right-0 h-full w-px bg-white/[0.06]" />
      </aside>
    </>
  );
}
