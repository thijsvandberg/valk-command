"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import {
  MessageCircle,
  KanbanSquare,
  GitBranch,
  Gem,
  Zap,
  NotebookPen,
  Users,
  Trash2,
  LayoutGrid,
  ChevronRight,
  ChevronDown,
  LogOut,
  User,
} from "lucide-react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { SyncIndicator } from "@/components/sync/SyncIndicator";
import { useAccountMenuItems } from "@/components/sidebar/accountMenuItems";
import { useSidebarData, type SidebarCount, type SidebarHeroData } from "@/hooks/useSidebarData";

type Tier = "primary" | "common" | "rare";
type DataKey = "chat" | "storyWriter" | "refinement";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  tier: Tier;
  dataKey?: DataKey;
}

const ICON = "h-[18px] w-[18px]";

const NAV_ITEMS: NavItem[] = [
  { label: "Sprint Board", href: "/sprint-board", icon: <KanbanSquare className={ICON} strokeWidth={1.5} />, tier: "primary" },
  { label: "Chat", href: "/chat", icon: <MessageCircle className={ICON} strokeWidth={1.5} />, tier: "common", dataKey: "chat" },
  { label: "Story Writer", href: "/story-writer", icon: <NotebookPen className={ICON} strokeWidth={1.5} />, tier: "common", dataKey: "storyWriter" },
  { label: "Refinement", href: "/refinement", icon: <Gem className={ICON} strokeWidth={1.5} />, tier: "common", dataKey: "refinement" },
  { label: "Epics", href: "/epics", icon: <Zap className={ICON} strokeWidth={1.5} />, tier: "rare" },
  { label: "Pipelines", href: "/pipelines", icon: <GitBranch className={ICON} strokeWidth={1.5} />, tier: "rare" },
  { label: "Stakeholder", href: "/stakeholder", icon: <Users className={ICON} strokeWidth={1.5} />, tier: "rare" },
  { label: "Cleanup", href: "/cleanup", icon: <Trash2 className={ICON} strokeWidth={1.5} />, tier: "rare" },
];

const PRIMARY = NAV_ITEMS.find((n) => n.tier === "primary")!;
const COMMON = NAV_ITEMS.filter((n) => n.tier === "common");
const RARE = NAV_ITEMS.filter((n) => n.tier === "rare");

const PANEL_SHADOW =
  "shadow-[0_40px_90px_-24px_rgba(0,0,0,0.85),0_0_0_1px_var(--color-border-strong),inset_0_1px_0_rgba(255,255,255,0.06)]";

// Staggered reveal: each child eases in once `open`, ordered top-to-bottom.
// Limited to transform + opacity so it stays on the compositor (BRDG-317).
function revealStyle(open: boolean, i: number): React.CSSProperties {
  return {
    opacity: open ? 1 : 0,
    transform: open ? "translateY(0)" : "translateY(8px)",
    transition: "opacity 260ms ease, transform 260ms cubic-bezier(0.34,1.56,0.64,1)",
    transitionDelay: open ? `${60 + i * 45}ms` : "0ms",
  };
}

function HeaderAvatar({ size = 34 }: { size?: number }) {
  const { user } = useUser();
  const initials = user
    ? `${(user.firstName?.[0] ?? "").toUpperCase()}${(user.lastName?.[0] ?? "").toUpperCase()}`
    : "";
  const hasImage = !!user?.imageUrl;

  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-full"
      style={{
        height: size,
        width: size,
        backgroundColor: hasImage ? "transparent" : "color-mix(in srgb, var(--color-brand-500) 18%, transparent)",
        border: hasImage ? "none" : "1px solid color-mix(in srgb, var(--color-brand-500) 25%, transparent)",
        boxShadow: "0 2px 8px var(--color-brand-glow)",
      }}
    >
      {hasImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user!.imageUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : initials ? (
        <span className="text-[11px] font-semibold tracking-wide text-[var(--color-brand-300)]">{initials}</span>
      ) : (
        <User className="h-4 w-4 text-[var(--color-brand-300)]" strokeWidth={1.5} />
      )}
    </span>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  const data = useSidebarData();

  const close = useCallback(() => {
    setOpen(false);
    setAccountOpen(false);
  }, []);

  useOutsideClick([launcherRef, panelRef], close, { enabled: open });

  const { menuItems, signOutItem } = useAccountMenuItems({
    onClose: close,
    iconClass: "h-[18px] w-[18px] shrink-0",
  });

  function isActive(href: string) {
    if (href === "/sprint-board") return pathname === "/" || pathname.startsWith("/sprint-board");
    if (href === "/story-writer") return pathname.startsWith("/story-writer") || pathname.endsWith("/write");
    return pathname.startsWith(href);
  }

  const heroActive = isActive(PRIMARY.href);

  return (
    // Outer wrapper exists so globals.css `div:has(> [data-testid="sidebar"])`
    // can hide the whole launcher during refinement sessions without touching main.
    <div>
      <div data-testid="sidebar">
        {/* Backdrop dims the board while the panel is open. */}
        <div
          aria-hidden="true"
          onClick={close}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity duration-200"
          style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
        />

        {/* Collapsed launcher */}
        <button
          ref={launcherRef}
          type="button"
          onClick={() => { setAccountOpen(false); setOpen((v) => !v); }}
          aria-label="Open navigation"
          aria-expanded={open}
          className="fixed bottom-6 left-6 z-50 grid h-11 w-11 cursor-pointer place-items-center rounded-2xl bg-[var(--color-surface-floating)]/90 text-[var(--color-brand-300)] shadow-[0_10px_30px_-6px_rgba(0,0,0,0.6),0_0_0_1px_var(--color-border-strong)] ring-1 ring-border-strong backdrop-blur-xl transition-[transform,opacity,color] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-[1.06] hover:text-[var(--color-brand-200)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-95"
          style={{ transform: open ? "scale(0.85)" : "scale(1)", opacity: open ? 0.5 : 1 }}
        >
          <LayoutGrid className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>

        {/* Floating editorial panel */}
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Navigation"
          data-testid="sidebar-panel"
          aria-hidden={!open}
          className={`fixed bottom-6 left-6 z-50 w-[380px] max-w-[calc(100vw-3rem)] origin-bottom-left overflow-hidden rounded-[26px] bg-[var(--color-surface-floating)]/95 ${PANEL_SHADOW} backdrop-blur-2xl transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]`}
          style={{
            opacity: open ? 1 : 0,
            transform: open ? "scale(1) translateY(0)" : "scale(0.9) translateY(16px)",
            pointerEvents: open ? "auto" : "none",
          }}
        >
          {/* Soft brand glow */}
          <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-[var(--color-brand-500)]/20 blur-3xl" />

          <div className="relative p-3">
            {/* Header: avatar + name/email + sync line, flips to the account view */}
            <button
              type="button"
              onClick={() => setAccountOpen((v) => !v)}
              aria-expanded={accountOpen}
              style={revealStyle(open, 0)}
              className={`mb-3 flex w-full items-center gap-3 rounded-2xl px-1.5 py-1.5 text-left transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${accountOpen ? "bg-overlay-default" : "hover:bg-hover-list-item"}`}
            >
              <HeaderAvatar />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-body-sm font-medium text-text-primary">
                  {user?.fullName ?? "User"}
                </p>
                <p className="truncate text-[11px] text-text-tertiary">
                  {user?.primaryEmailAddress?.emailAddress ?? ""}
                </p>
                <span className="mt-0.5 block">
                  <SyncIndicator variant="header-line" />
                </span>
              </div>
              <ChevronDown
                className={`ml-auto h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-200 ${accountOpen ? "rotate-180" : ""}`}
                strokeWidth={1.5}
              />
            </button>

            {accountOpen ? (
              <AccountView open={open} menuItems={menuItems} signOutItem={signOutItem} />
            ) : (
              <NavigationView
                open={open}
                heroActive={heroActive}
                hero={data.hero}
                isActive={isActive}
                onNavigate={close}
                counts={{ chat: data.chat, storyWriter: data.storyWriter, refinement: data.refinement }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NavigationView({
  open,
  heroActive,
  hero,
  isActive,
  onNavigate,
  counts,
}: {
  open: boolean;
  heroActive: boolean;
  hero: SidebarHeroData | null;
  isActive: (href: string) => boolean;
  onNavigate: () => void;
  counts: Record<DataKey, SidebarCount>;
}) {
  return (
    <>
      {/* Sprint Board hero */}
      <Link
        href={PRIMARY.href}
        prefetch
        onClick={onNavigate}
        aria-current={heroActive ? "page" : undefined}
        style={revealStyle(open, 1)}
        className={`group mb-1 flex w-full items-center gap-3.5 rounded-2xl px-2 py-2.5 text-left transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${heroActive ? "bg-[var(--color-brand-600)]/15" : "hover:bg-hover-list-item"}`}
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--color-brand-500)] text-white shadow-[0_6px_20px_var(--color-brand-glow)]">
          <KanbanSquare className="h-[22px] w-[22px]" strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="font-display text-[18px] font-semibold tracking-[-0.02em] text-text-primary">Sprint Board</p>
            {hero?.sprintKey && <span className="font-mono text-[10px] text-text-muted">{hero.sprintKey}</span>}
          </div>
          {hero ? (
            <p className="mt-0.5 text-[11px] text-text-tertiary">
              {hero.todo} to do &middot; {hero.inProgress} in progress &middot; {hero.done} done
              {hero.dayX != null && hero.dayY != null && (
                <span className="text-text-muted"> &middot; day {hero.dayX}/{hero.dayY}</span>
              )}
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-text-muted">View the active sprint</p>
          )}
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-text-muted transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={1.5} />
      </Link>

      {/* Progress bar */}
      <div className="mx-2 mb-1 h-1 overflow-hidden rounded-full bg-overlay-default" style={revealStyle(open, 2)}>
        <div
          className="h-full rounded-full bg-[var(--color-brand-400)] transition-[width] duration-300"
          style={{ width: `${hero?.progress != null ? Math.round(hero.progress * 100) : 0}%` }}
        />
      </div>

      {/* Common views as hairline rows */}
      <div className="flex flex-col px-1" style={revealStyle(open, 3)}>
        {COMMON.map((item) => {
          const on = isActive(item.href);
          const info = item.dataKey ? counts[item.dataKey] : undefined;
          const hasCount = info != null && info.count != null;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              onClick={onNavigate}
              aria-current={on ? "page" : undefined}
              className="group flex items-center gap-3 border-t border-border-subtle py-3 text-left transition-colors duration-150 cursor-pointer first:border-t-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              <span className={`shrink-0 transition-colors ${on ? "text-[var(--color-brand-300)]" : "text-text-tertiary group-hover:text-text-secondary"}`}>
                {item.icon}
              </span>
              <span className={`flex-1 text-body-sm transition-colors ${on ? "font-medium text-text-primary" : "text-text-secondary group-hover:text-text-primary"}`}>
                {item.label}
              </span>
              {hasCount && (
                <>
                  <span className="font-display text-[15px] font-semibold tabular-nums text-text-secondary">{info!.count}</span>
                  <span className="w-20 text-right text-[11px] text-text-muted">{info!.note}</span>
                </>
              )}
            </Link>
          );
        })}
      </div>

      {/* Rare views as a faint "More" footer */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-subtle px-1 pt-3" style={revealStyle(open, 4)}>
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">More</span>
        {RARE.map((item) => {
          const on = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              onClick={onNavigate}
              aria-current={on ? "page" : undefined}
              className={`rounded text-[11px] transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${on ? "font-medium text-[var(--color-brand-300)]" : "text-text-muted hover:text-text-secondary"}`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </>
  );
}

function AccountView({
  open,
  menuItems,
  signOutItem,
}: {
  open: boolean;
  menuItems: ReturnType<typeof useAccountMenuItems>["menuItems"];
  signOutItem: ReturnType<typeof useAccountMenuItems>["signOutItem"];
}) {
  return (
    <div className="flex flex-col gap-0.5" role="menu">
      {menuItems.map((item, i) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          onClick={item.action}
          style={revealStyle(open, 1 + i)}
          className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-body-sm text-text-secondary transition-colors duration-150 cursor-pointer hover:bg-hover-list-item hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        >
          <span className="text-text-tertiary">{item.icon}</span>
          <span className="flex-1 text-left">{item.label}</span>
          {item.secondaryLabel && <span className="text-[12px] text-text-muted">{item.secondaryLabel}</span>}
        </button>
      ))}
      <div className="my-1 h-px bg-border-subtle" />
      <button
        type="button"
        role="menuitem"
        onClick={signOutItem.action}
        style={revealStyle(open, 1 + menuItems.length)}
        className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-body-sm text-[var(--color-status-error)] transition-colors duration-150 cursor-pointer hover:bg-[var(--color-status-error-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
      >
        <LogOut className="h-[18px] w-[18px]" strokeWidth={1.5} />
        {signOutItem.label}
      </button>
    </div>
  );
}
