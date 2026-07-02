"use client";

/**
 * Throwaway prototype: reclaiming chat space in the Story Writer.
 *
 * Two space-eaters explored over faithful mocks:
 *  1. The pane chrome — today TWO stacked 44px bars (app toggle list + active-app
 *     toolbar) sit above the panes. Directions: A merged single bar, B collapsible
 *     bars, C icon toggles folded into the view header, D per-pane tab strips.
 *  2. The quick-prompt chips above the composer — today an always-on row capped at
 *     5 that wraps to two rows at pane width. Directions: 1 empty-conversation-only,
 *     2 single scrollable row, 3 slim label-only chips, 4 menu-only with a "/" hint.
 *
 * Not linked from app nav; reachable from /dev/exploration.
 */

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
  Plus,
  Check,
  LayoutGrid,
  ChevronUp,
  ChevronDown,
  SendHorizontal,
  MessageSquareQuote,
  MoreHorizontal,
  Search,
  Star,
  Zap,
  Sparkles,
  Code,
  ListChecks,
  PenLine,
  type LucideIcon,
} from "lucide-react";
import { useOutsideClick } from "@/hooks/useOutsideClick";

/* ------------------------------------------------------------------ */
/* Shared mock data                                                    */
/* ------------------------------------------------------------------ */

type AppId =
  | "chat"
  | "editor"
  | "diff"
  | "history"
  | "draft-preview"
  | "related"
  | "story-preview"
  | "meta";

const APP_DEFS: Array<{ id: AppId; label: string; Icon: LucideIcon }> = [
  { id: "chat", label: "Chat", Icon: MessageSquare },
  { id: "editor", label: "Editor", Icon: FileText },
  { id: "diff", label: "Diff", Icon: GitCompare },
  { id: "history", label: "History", Icon: History },
  { id: "draft-preview", label: "Draft preview", Icon: Eye },
  { id: "related", label: "Related", Icon: Network },
  { id: "story-preview", label: "Story preview", Icon: BookOpen },
  { id: "meta", label: "Meta", Icon: Info },
];

const appDef = (id: AppId) => APP_DEFS.find((a) => a.id === id)!;

const CHIP_LABELS = [
  "Improve story",
  "Investigate",
  "Make more concise",
  "Add test scenarios",
  "Technical analysis",
];

const MENU_ACTIONS: Array<{ label: string; Icon: LucideIcon }> = [
  { label: "Find Related", Icon: Search },
  { label: "Review Story", Icon: Star },
  { label: "Match Epic", Icon: Zap },
  { label: "Improve story", Icon: Sparkles },
  { label: "Investigate", Icon: Code },
  { label: "Make more concise", Icon: Sparkles },
  { label: "Add test scenarios", Icon: ListChecks },
  { label: "Technical analysis", Icon: Code },
  { label: "Suggest title", Icon: PenLine },
];

/* ------------------------------------------------------------------ */
/* Tiny building blocks                                                */
/* ------------------------------------------------------------------ */

function PxBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-overlay-default px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-text-tertiary">
      {children}
    </span>
  );
}

function CloseX({ label }: { label: string }) {
  return (
    <span
      className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-text-tertiary transition-colors duration-100 hover:bg-hover-interactive hover:text-text-secondary"
      title={`Close ${label}`}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M2 2l6 6M8 2l-6 6" />
      </svg>
    </span>
  );
}

function MockViewHeader({ trailing }: { trailing?: React.ReactNode }) {
  return (
    <div className="flex h-[44px] shrink-0 items-center gap-2.5 border-b border-border-default bg-surface-toolbar px-4">
      <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-sky-400">
        In progress
      </span>
      <span className="font-mono text-[11px] text-text-tertiary">VPL-46337</span>
      <span className="min-w-0 truncate text-body-sm font-medium text-text-primary">
        Show strikethrough price on product cards
      </span>
      <span className="text-caption text-text-muted">Saved</span>
      <div className="flex-1" />
      {trailing}
      <span className="flex h-7 cursor-pointer items-center rounded-md bg-[var(--color-brand-500)]/90 px-2.5 text-body-sm font-medium text-white">
        Wrap up
      </span>
      <MoreHorizontal size={14} className="text-text-tertiary" />
    </div>
  );
}

/** Popover listing apps not currently open, styled after QuickActionsPopover. */
function AddAppMenu({
  openApps,
  onAdd,
  onClose,
  align = "left",
}: {
  openApps: AppId[];
  onAdd: (id: AppId) => void;
  onClose: () => void;
  align?: "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, onClose, { enabled: true });
  const remaining = APP_DEFS.filter((a) => !openApps.includes(a.id));
  return (
    <div
      ref={ref}
      className={`absolute top-full z-20 mt-1.5 w-52 rounded-lg border border-border-strong bg-surface-floating py-1 shadow-xl shadow-black/30 ${
        align === "right" ? "right-0" : "left-0"
      }`}
    >
      {remaining.length === 0 && (
        <div className="px-3 py-2 text-caption text-text-muted">All apps are open</div>
      )}
      {remaining.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => {
            onAdd(a.id);
            onClose();
          }}
          className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary transition-colors duration-150 hover:bg-hover-interactive hover:text-text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        >
          <a.Icon size={14} strokeWidth={1.5} className="shrink-0" />
          {a.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chrome variants (section 1)                                         */
/* ------------------------------------------------------------------ */

/** Today: the full 8-button toggle list, verbatim from ApplicationListBar. */
function TodayAppListBar({ openApps, onToggle }: { openApps: AppId[]; onToggle: (id: AppId) => void }) {
  return (
    <div className="flex h-[44px] shrink-0 items-center gap-1 border-b border-border-default bg-surface-toolbar px-3 xl:gap-2">
      {APP_DEFS.map((a) => {
        const isActive = openApps.includes(a.id);
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onToggle(a.id)}
            className={`flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-md px-2 text-body-sm font-medium ${
              isActive
                ? "bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)]"
                : "text-text-tertiary hover:bg-overlay-subtle hover:text-text-secondary"
            } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
            style={{ transition: "color 120ms, background-color 120ms" }}
          >
            <span className={isActive ? "text-[var(--color-brand-400)]" : "text-text-muted"}>
              <a.Icon size={12} strokeWidth={1.5} />
            </span>
            {a.label}
          </button>
        );
      })}
    </div>
  );
}

/** Today: the second bar with the active-app labels + close, after AppToolbar. */
function TodayAppToolbar({ openApps }: { openApps: AppId[] }) {
  const panes = [openApps.filter((a) => a === "chat"), openApps.filter((a) => a !== "chat")].filter(
    (p) => p.length > 0
  );
  return (
    <div className="flex h-[44px] shrink-0 border-b border-border-default bg-surface-toolbar">
      {panes.map((paneApps, i) => (
        <div key={i} className="flex min-w-0 flex-1 items-center gap-2 px-3">
          {i > 0 && <div className="-ml-3 mr-1 h-full w-px shrink-0 bg-overlay-default" />}
          <span className="text-label font-semibold text-text-secondary">
            {appDef(paneApps[paneApps.length - 1]).label}
          </span>
          <div className="flex-1" />
          <CloseX label={appDef(paneApps[paneApps.length - 1]).label} />
        </div>
      ))}
      {panes.length === 0 && <span className="px-3 text-caption text-text-muted">Pane 1</span>}
    </div>
  );
}

/** Direction A: one bar — active apps as tabs, everything else behind a "+". */
function MergedBar({
  openApps,
  onToggle,
  onAdd,
}: {
  openApps: AppId[];
  onToggle: (id: AppId) => void;
  onAdd: (id: AppId) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="flex h-[44px] shrink-0 items-center gap-1.5 border-b border-border-default bg-surface-toolbar px-3">
      {openApps.map((id) => {
        const a = appDef(id);
        return (
          <span
            key={id}
            className="flex h-7 items-center gap-1.5 rounded-md bg-[var(--color-brand-500)]/10 pl-2 pr-1 text-body-sm font-medium text-[var(--color-brand-400)]"
          >
            <a.Icon size={12} strokeWidth={1.5} />
            {a.label}
            <button
              type="button"
              onClick={() => onToggle(id)}
              className="flex h-4 w-4 cursor-pointer items-center justify-center rounded text-[var(--color-brand-400)]/60 transition-colors duration-100 hover:bg-[var(--color-brand-500)]/20 hover:text-[var(--color-brand-300)]"
              title={`Close ${a.label}`}
            >
              <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M2 2l6 6M8 2l-6 6" />
              </svg>
            </button>
          </span>
        );
      })}
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-body-sm font-medium text-text-tertiary transition-colors duration-100 hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          title="Open another app"
        >
          <Plus size={12} strokeWidth={2} />
          <span className="hidden sm:inline">Add</span>
        </button>
        {menuOpen && <AddAppMenu openApps={openApps} onAdd={onAdd} onClose={() => setMenuOpen(false)} />}
      </div>
    </div>
  );
}

/** Direction C2: one header button opening a toggle dropdown for all apps. */
function HeaderAppsMenu({ openApps, onToggle }: { openApps: AppId[]; onToggle: (id: AppId) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => setOpen(false), { enabled: open });
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-body-sm font-medium ${
          open
            ? "bg-overlay-default text-text-primary"
            : "text-text-tertiary hover:bg-overlay-subtle hover:text-text-secondary"
        } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
        style={{ transition: "color 120ms, background-color 120ms" }}
        title="Open or close apps"
      >
        <LayoutGrid size={13} strokeWidth={1.5} />
        Apps
        <ChevronDown size={11} strokeWidth={1.75} className={open ? "rotate-180" : ""} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-52 rounded-lg border border-border-strong bg-surface-floating py-1 shadow-xl shadow-black/30">
          {APP_DEFS.map((a) => {
            const isOpen = openApps.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onToggle(a.id)}
                className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm transition-colors duration-150 hover:bg-hover-interactive hover:text-text-primary ${
                  isOpen ? "text-text-primary" : "text-text-secondary"
                } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
              >
                <a.Icon
                  size={14}
                  strokeWidth={1.5}
                  className={`shrink-0 ${isOpen ? "text-[var(--color-brand-400)]" : ""}`}
                />
                <span className="flex-1 text-left">{a.label}</span>
                {isOpen && <Check size={13} strokeWidth={2} className="text-[var(--color-brand-400)]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Direction C: icon-only toggles that live inside the view header. */
function HeaderIconToggles({ openApps, onToggle }: { openApps: AppId[]; onToggle: (id: AppId) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-overlay-subtle p-0.5">
      {APP_DEFS.map((a) => {
        const isActive = openApps.includes(a.id);
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onToggle(a.id)}
            className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded-md ${
              isActive
                ? "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)]"
                : "text-text-muted hover:bg-overlay-default hover:text-text-secondary"
            } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
            style={{ transition: "color 120ms, background-color 120ms" }}
            title={a.label}
          >
            <a.Icon size={13} strokeWidth={1.5} />
          </button>
        );
      })}
    </div>
  );
}

/** Direction D: a tab strip owned by a single pane. */
function PaneTabStrip({
  tabs,
  active,
  onActivate,
  openApps,
  onAdd,
}: {
  tabs: AppId[];
  active: AppId | null;
  onActivate: (id: AppId) => void;
  openApps: AppId[];
  onAdd: (id: AppId) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border-default bg-surface-toolbar px-2">
      {tabs.map((id) => {
        const a = appDef(id);
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onActivate(id)}
            className={`flex h-6 cursor-pointer items-center gap-1.5 rounded-md px-2 text-label font-medium ${
              isActive
                ? "bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)]"
                : "text-text-tertiary hover:bg-overlay-subtle hover:text-text-secondary"
            } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
            style={{ transition: "color 120ms, background-color 120ms" }}
          >
            <a.Icon size={11} strokeWidth={1.5} />
            {a.label}
          </button>
        );
      })}
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors duration-100 hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          title="Open another app in this pane"
        >
          <Plus size={11} strokeWidth={2} />
        </button>
        {menuOpen && <AddAppMenu openApps={openApps} onAdd={onAdd} onClose={() => setMenuOpen(false)} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chat + editor pane mocks                                            */
/* ------------------------------------------------------------------ */

/** Mock quick-actions popover, opening upward from the composer footer. */
function QuickMenuMock({ onClose, highlight }: { onClose: () => void; highlight?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, onClose, { enabled: true });
  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 z-20 mb-1.5 w-52 rounded-lg border border-border-strong bg-surface-floating py-1 shadow-xl shadow-black/30"
    >
      {MENU_ACTIONS.map((a) => {
        const hl =
          highlight && a.label.toLowerCase().startsWith(highlight.toLowerCase()) && highlight.length > 0;
        return (
          <button
            key={a.label}
            type="button"
            onClick={onClose}
            className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-body-sm transition-colors duration-150 hover:bg-hover-interactive hover:text-text-primary ${
              hl ? "bg-[var(--color-brand-500)]/[0.08] text-text-primary" : "text-text-secondary"
            }`}
          >
            <a.Icon size={14} strokeWidth={1.5} className="shrink-0" />
            {a.label}
          </button>
        );
      })}
    </div>
  );
}

type ChipsVariant = "today" | "empty-only" | "one-row" | "slim" | "menu-only";

function Chip({ label, slim, small }: { label: string; slim?: boolean; small?: boolean }) {
  return (
    <div className="group flex shrink-0 items-stretch overflow-hidden rounded-lg border border-border-default bg-overlay-subtle transition-colors duration-150 hover:border-[var(--color-brand-500)]/20 hover:bg-[var(--color-brand-500)]/[0.04]">
      <button
        type="button"
        className={`cursor-pointer font-medium text-text-secondary transition-colors duration-150 hover:text-text-primary ${
          slim || small ? "px-2 py-1 text-caption" : "px-2.5 py-1.5 text-label"
        }`}
      >
        {label}
      </button>
      {!slim && (
        <button
          type="button"
          className={`flex cursor-pointer items-center justify-center border-l border-border-default text-text-muted transition-colors duration-150 hover:bg-[var(--color-brand-500)]/[0.12] hover:text-[var(--color-brand-400)] ${
            small ? "px-1.5" : "px-2"
          }`}
          title="Submit immediately"
        >
          <SendHorizontal size={small ? 8 : 9} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

function ChipsRow({ variant, convStarted }: { variant: ChipsVariant; convStarted: boolean }) {
  if (variant === "menu-only") return null;
  if (variant === "empty-only" && convStarted) return null;

  if (variant === "one-row") {
    // Extra chips prove the point: overflow scrolls instead of wrapping.
    const labels = [...CHIP_LABELS, "Suggest title", "Review story"];
    return (
      <div className="px-3 pt-2 pb-1">
        <div
          className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ maskImage: "linear-gradient(to right, black calc(100% - 40px), transparent)" }}
        >
          {labels.map((l) => (
            <Chip key={l} label={l} small />
          ))}
        </div>
      </div>
    );
  }

  if (variant === "slim") {
    return (
      <div className="px-3 pt-2.5 pb-1.5">
        <div className="flex items-center gap-1.5 overflow-hidden">
          {CHIP_LABELS.map((l) => (
            <Chip key={l} label={l} slim />
          ))}
        </div>
      </div>
    );
  }

  // "today" and pre-conversation "empty-only": the wrapping row as-is.
  return (
    <div className="px-3 pt-2.5 pb-1.5">
      <div className="flex min-h-[32px] flex-wrap items-center gap-1.5">
        {CHIP_LABELS.map((l) => (
          <Chip key={l} label={l} />
        ))}
      </div>
    </div>
  );
}

function ComposerMock({ variant }: { variant: ChipsVariant }) {
  const [value, setValue] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const slashMode = variant === "menu-only";
  const slashOpen = slashMode && value.startsWith("/");

  return (
    <div className="px-3 pb-2.5 pt-1">
      <div className="flex flex-col rounded-2xl border border-border-strong bg-surface-elevated transition-colors duration-150 focus-within:border-[var(--color-brand-500)]/30">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={
            slashMode ? "Describe what to improve, or type / for actions..." : "Describe what to improve..."
          }
          className="w-full bg-transparent px-3.5 pb-1 pt-3 text-body-lg text-text-primary placeholder-text-tertiary focus:outline-none"
        />
        <div className="flex items-center justify-between px-2 pb-2 pt-1.5">
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border text-text-secondary transition-colors duration-150 hover:bg-overlay-strong ${
                slashMode
                  ? "border-[var(--color-brand-500)]/40 bg-[var(--color-brand-500)]/[0.06]"
                  : "border-border-strong bg-overlay-subtle"
              }`}
              title="AI actions"
            >
              <MessageSquareQuote size={14} strokeWidth={1.5} />
            </button>
            {(menuOpen || slashOpen) && (
              <QuickMenuMock
                onClose={() => {
                  setMenuOpen(false);
                  if (slashOpen) setValue("");
                }}
                highlight={slashOpen ? value.slice(1) : undefined}
              />
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="flex h-7 items-center rounded-lg border border-border-strong px-2 text-body-sm text-text-secondary">
              Sonnet
            </span>
            <span className="flex h-7 items-center gap-1 rounded-lg border border-border-strong px-2 text-body-sm text-text-secondary">
              <Code size={11} strokeWidth={1.75} />
              Codebase
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-brand-500)]/50 text-white">
              <SendHorizontal size={12} strokeWidth={2} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MockChatPane({
  chipsVariant,
  convStarted,
  header,
}: {
  chipsVariant: ChipsVariant;
  convStarted: boolean;
  header?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[var(--color-surface-base)]">
      {header}
      <div className="min-h-0 flex-1 space-y-3 overflow-hidden px-4 py-3">
        {convStarted ? (
          <>
            <div className="ml-auto w-fit max-w-[80%] rounded-xl bg-overlay-default px-3 py-1.5 text-body-sm text-text-secondary">
              Investigate
            </div>
            <p className="text-body-sm leading-[1.65] text-text-tertiary">
              The parent story likely defines the mechanism and the contract for how{" "}
              <span className="rounded bg-[var(--color-brand-500)]/10 px-1 font-mono text-[11px] text-[var(--color-brand-400)]">
                unDiscountedPrice
              </span>{" "}
              gets populated. The strikethrough / original price concept appears across three
              surfaces; VPL-46337 covers the product card itself.
            </p>
            <p className="text-body-sm leading-[1.65] text-text-tertiary">
              Suggested next step: align the card layout with the price-block component so the
              struck price never wraps separately from the current price.
            </p>
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-[260px] text-center text-body-sm leading-[1.6] text-text-muted">
              Start the conversation — pick a quick prompt below or describe what to improve.
            </p>
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-border-default">
        <ChipsRow variant={chipsVariant} convStarted={convStarted} />
        <ComposerMock variant={chipsVariant} />
      </div>
    </div>
  );
}

function MockEditorPane({ label, header }: { label: string; header?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col border-l border-border-default bg-[var(--color-surface-base)]">
      {header}
      <div className="min-h-0 flex-1 space-y-3 overflow-hidden px-5 py-4">
        <p className="text-caption uppercase tracking-[0.1em] text-text-muted">{label}</p>
        <p className="text-body-lg font-semibold text-text-primary">
          Show strikethrough price on product cards
        </p>
        <div className="space-y-2">
          <div className="h-2 w-11/12 rounded bg-overlay-default" />
          <div className="h-2 w-full rounded bg-overlay-default" />
          <div className="h-2 w-4/5 rounded bg-overlay-default" />
          <div className="h-2 w-2/3 rounded bg-overlay-subtle" />
        </div>
        <div className="space-y-2 pt-2">
          <div className="h-2 w-1/3 rounded bg-overlay-strong" />
          <div className="h-2 w-10/12 rounded bg-overlay-default" />
          <div className="h-2 w-9/12 rounded bg-overlay-default" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section 1: full story-writer window mock per chrome variant         */
/* ------------------------------------------------------------------ */

type ChromeVariant = "today" | "merged" | "collapsible" | "header" | "header-menu" | "per-pane";

const CHROME_VARIANTS: Array<{
  id: ChromeVariant;
  label: string;
  saved: string;
  blurb: string;
}> = [
  {
    id: "today",
    label: "Today",
    saved: "88px chrome",
    blurb:
      "Two stacked 44px bars. The top bar lists all 8 apps as toggles; the bottom bar repeats the ACTIVE apps as pane labels with close buttons. Active apps are shown twice.",
  },
  {
    id: "merged",
    label: "A · Merged bar",
    saved: "44px chrome · saves 44px",
    blurb:
      "One bar: open apps as tabs (with close), everything else behind a single + menu. No duplication, common case stays zero-click. Tabs keep drag-to-reorder.",
  },
  {
    id: "collapsible",
    label: "B · Collapsible",
    saved: "88px expanded · 20px collapsed",
    blurb:
      "Keep today's bars but add a collapse chevron. Collapsed state is a slim handle; the preference would persist per ticket next to the existing pane layout storage.",
  },
  {
    id: "header",
    label: "C · Header icons",
    saved: "0px chrome · saves 88px",
    blurb:
      "Icon-only app toggles fold into the 44px view header that is already there. Both bars disappear entirely. Tooltips carry the labels; risk is scannability of rare apps.",
  },
  {
    id: "header-menu",
    label: "C2 · Header menu",
    saved: "0px chrome · saves 88px",
    blurb:
      "Like C, but a single Apps button in the view header opens a dropdown that toggles panes open and closed. Keeps the header calm at narrow widths; switching an app costs one extra click.",
  },
  {
    id: "per-pane",
    label: "D · Per-pane tabs",
    saved: "32px inside each pane · saves 56px",
    blurb:
      "No global bars; each pane owns a slim tab strip (like an IDE) with its own + menu. Most flexible, biggest change; the strip lives inside the pane so net gain is smaller.",
  },
];

function ChromeMock({ variant }: { variant: ChromeVariant }) {
  const [openApps, setOpenApps] = useState<AppId[]>(["chat", "editor"]);
  const [collapsed, setCollapsed] = useState(false);
  const [pane2Active, setPane2Active] = useState<AppId>("editor");

  const secondPaneApps = openApps.filter((a) => a !== "chat");
  const activeSecond = secondPaneApps.includes(pane2Active)
    ? pane2Active
    : secondPaneApps[secondPaneApps.length - 1] ?? null;

  const toggleApp = (id: AppId) => {
    setOpenApps((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
    if (!openApps.includes(id) && id !== "chat") setPane2Active(id);
  };
  const addApp = (id: AppId) => {
    setOpenApps((prev) => (prev.includes(id) ? prev : [...prev, id]));
    if (id !== "chat") setPane2Active(id);
  };

  const showChat = openApps.includes("chat");

  return (
    <div className="overflow-hidden rounded-xl bg-[var(--color-surface-base)] ring-1 ring-border-default">
      <MockViewHeader
        trailing={
          variant === "header" ? (
            <HeaderIconToggles openApps={openApps} onToggle={toggleApp} />
          ) : variant === "header-menu" ? (
            <HeaderAppsMenu openApps={openApps} onToggle={toggleApp} />
          ) : undefined
        }
      />

      {variant === "today" && (
        <>
          <TodayAppListBar openApps={openApps} onToggle={toggleApp} />
          <TodayAppToolbar openApps={openApps} />
        </>
      )}

      {variant === "merged" && <MergedBar openApps={openApps} onToggle={toggleApp} onAdd={addApp} />}

      {variant === "collapsible" &&
        (collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="flex h-5 w-full cursor-pointer items-center justify-center gap-1 border-b border-border-default bg-surface-toolbar text-text-muted transition-colors duration-100 hover:text-text-secondary"
            title="Show app bars"
          >
            <ChevronDown size={11} strokeWidth={1.75} />
            <span className="text-[10px] uppercase tracking-[0.1em]">Apps</span>
          </button>
        ) : (
          <>
            <div className="relative">
              <TodayAppListBar openApps={openApps} onToggle={toggleApp} />
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors duration-100 hover:bg-overlay-subtle hover:text-text-secondary"
                title="Hide app bars"
              >
                <ChevronUp size={13} strokeWidth={1.75} />
              </button>
            </div>
            <TodayAppToolbar openApps={openApps} />
          </>
        ))}

      <div className="flex h-[400px]">
        {showChat && (
          <MockChatPane
            chipsVariant="today"
            convStarted
            header={
              variant === "per-pane" ? (
                <PaneTabStrip
                  tabs={["chat"]}
                  active="chat"
                  onActivate={() => {}}
                  openApps={openApps}
                  onAdd={addApp}
                />
              ) : undefined
            }
          />
        )}
        {activeSecond && (
          <MockEditorPane
            label={appDef(activeSecond).label}
            header={
              variant === "per-pane" ? (
                <PaneTabStrip
                  tabs={secondPaneApps}
                  active={activeSecond}
                  onActivate={setPane2Active}
                  openApps={openApps}
                  onAdd={addApp}
                />
              ) : undefined
            }
          />
        )}
        {!showChat && !activeSecond && (
          <div className="flex flex-1 items-center justify-center text-body-sm text-text-muted">
            All panes closed — open an app from the chrome above.
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section 2: chips variants over a chat-pane-width mock               */
/* ------------------------------------------------------------------ */

const CHIPS_VARIANTS: Array<{
  id: ChipsVariant;
  label: string;
  saved: string;
  blurb: string;
}> = [
  {
    id: "today",
    label: "Today",
    saved: "~84px, always",
    blurb:
      "The chip row always renders, capped at 5 chips. At chat-pane width they wrap to two rows. Label fills the input; the small icon sends immediately.",
  },
  {
    id: "empty-only",
    label: "1 · Empty-conversation only",
    saved: "0px once chatting",
    blurb:
      "Chips show only before the first message, where they earn their keep as starters. After that the row disappears; the popover keeps everything one click away. Toggle the conversation state to feel it.",
  },
  {
    id: "one-row",
    label: "2 · One scrolling row",
    saved: "~38px, fixed",
    blurb:
      "Never wrap: one row of smaller chips that scrolls horizontally with an edge fade. Both actions stay (label fills the input, the icon sends now). Height stays fixed no matter how many prompts are configured. Combines well with 1.",
  },
  {
    id: "slim",
    label: "3 · Slim chips",
    saved: "~40px, fixed",
    blurb:
      "Drop the per-chip send split and shrink the chips; five fit on one row at pane width. Costs the send-now shortcut (the popover still has it on hover).",
  },
  {
    id: "menu-only",
    label: "4 · Menu only + /",
    saved: "0px",
    blurb:
      "No chip row at all. The popover is the single home for prompts, and typing / in the input opens it inline, chat-app style. Try typing / in the mock. Top prompts go from zero clicks to one.",
  },
];

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function StoryWriterChromePage() {
  const [chromeVariant, setChromeVariant] = useState<ChromeVariant>("today");
  const [chipsVariant, setChipsVariant] = useState<ChipsVariant>("today");
  const [convStarted, setConvStarted] = useState(false);

  const chromeDef = CHROME_VARIANTS.find((v) => v.id === chromeVariant)!;
  const chipsDef = CHIPS_VARIANTS.find((v) => v.id === chipsVariant)!;

  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-[1040px]">
        <header className="mb-10">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-brand-400)]">
            /dev/exploration · story-writer-chrome
          </p>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-text-primary">
            Story Writer — reclaiming chat space
          </h1>
          <p className="mt-2 max-w-2xl text-body-lg leading-[1.7] text-text-secondary">
            Two space-eaters, explored live: the pane chrome above the panes (today two stacked
            44px bars) and the quick-prompt chips above the composer (today an always-on row that
            wraps to two lines). Focus mode (Cmd+.) already hides the bars entirely, but it is
            all-or-nothing; these directions reclaim the space in the normal state.
          </p>
        </header>

        {/* ---------------- Section 1: pane chrome ---------------- */}
        <section className="mb-14">
          <h2 className="font-display text-[20px] font-semibold tracking-[-0.02em] text-text-primary">
            1 · The pane toolbar
          </h2>
          <p className="mt-1 max-w-2xl text-body-sm leading-[1.6] text-text-tertiary">
            All mocks are interactive: toggle apps, open the + menus, collapse the bars. Chat and
            Editor start open, matching the default split.
          </p>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {CHROME_VARIANTS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setChromeVariant(v.id)}
                className={`h-8 cursor-pointer rounded-lg px-3 text-body-sm font-medium transition-colors duration-100 ${
                  chromeVariant === v.id
                    ? "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-300)] ring-1 ring-[var(--color-brand-500)]/30"
                    : "bg-overlay-subtle text-text-tertiary hover:bg-overlay-default hover:text-text-secondary"
                } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
              >
                {v.label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-start justify-between gap-4">
            <p className="max-w-2xl text-body-sm leading-[1.6] text-text-secondary">{chromeDef.blurb}</p>
            <PxBadge>{chromeDef.saved}</PxBadge>
          </div>

          <div className="mt-4">
            {/* Remount per variant so each demo starts from the default split. */}
            <ChromeMock key={chromeVariant} variant={chromeVariant} />
          </div>
        </section>

        {/* ---------------- Section 2: quick chips ---------------- */}
        <section className="mb-14">
          <h2 className="font-display text-[20px] font-semibold tracking-[-0.02em] text-text-primary">
            2 · The quick-prompt chips
          </h2>
          <p className="mt-1 max-w-2xl text-body-sm leading-[1.6] text-text-tertiary">
            Shown at chat-pane width, where the wrap hurts. The popover button in the composer
            footer already lists every prompt unconditionally, so chips are purely a shortcut
            layer; nothing becomes unreachable.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            {CHIPS_VARIANTS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setChipsVariant(v.id)}
                className={`h-8 cursor-pointer rounded-lg px-3 text-body-sm font-medium transition-colors duration-100 ${
                  chipsVariant === v.id
                    ? "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-300)] ring-1 ring-[var(--color-brand-500)]/30"
                    : "bg-overlay-subtle text-text-tertiary hover:bg-overlay-default hover:text-text-secondary"
                } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
              >
                {v.label}
              </button>
            ))}
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setConvStarted((v) => !v)}
              className={`h-8 cursor-pointer rounded-lg px-3 text-body-sm font-medium transition-colors duration-100 ${
                convStarted
                  ? "bg-overlay-default text-text-secondary"
                  : "bg-overlay-subtle text-text-tertiary hover:text-text-secondary"
              } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
              title="Toggle whether the mock conversation has started"
            >
              {convStarted ? "Conversation: started" : "Conversation: empty"}
            </button>
          </div>

          <div className="mt-3 flex items-start justify-between gap-4">
            <p className="max-w-2xl text-body-sm leading-[1.6] text-text-secondary">{chipsDef.blurb}</p>
            <PxBadge>{chipsDef.saved}</PxBadge>
          </div>

          <div className="mt-4 flex justify-center">
            <div className="h-[420px] w-full max-w-[560px] overflow-hidden rounded-xl ring-1 ring-border-default">
              <div className="flex h-full flex-col">
                <MockChatPane chipsVariant={chipsVariant} convStarted={convStarted} />
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- Section 3: combined ---------------- */}
        <section className="mb-10">
          <h2 className="font-display text-[20px] font-semibold tracking-[-0.02em] text-text-primary">
            3 · All together
          </h2>
          <p className="mt-1 max-w-2xl text-body-sm leading-[1.6] text-text-tertiary">
            The recommended combination: merged bar (A) plus chips that retire once the
            conversation starts (1 + 2). Mid-conversation, roughly 130px of chrome hands itself
            back to the messages.
          </p>
          <div className="mt-4">
            <CombinedMock />
          </div>
        </section>

        <footer className="border-t border-border-default pt-4">
          <p className="text-caption leading-[1.6] text-text-muted">
            Real components referenced: ApplicationListBar, AppToolbar, StoryWriterChat chips and
            composer, QuickActionsPopover. Pane layout already persists per ticket in
            localStorage, so a chrome preference has an obvious home.
          </p>
        </footer>
      </div>
    </div>
  );
}

/** Section 3: static-ish full mock combining direction A with chips direction 1+2. */
function CombinedMock() {
  const [openApps, setOpenApps] = useState<AppId[]>(["chat", "editor"]);
  const toggleApp = (id: AppId) =>
    setOpenApps((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  const addApp = (id: AppId) => setOpenApps((prev) => (prev.includes(id) ? prev : [...prev, id]));
  const second = openApps.filter((a) => a !== "chat");

  return (
    <div className="overflow-hidden rounded-xl bg-[var(--color-surface-base)] ring-1 ring-border-default">
      <MockViewHeader />
      <MergedBar openApps={openApps} onToggle={toggleApp} onAdd={addApp} />
      <div className="flex h-[400px]">
        {openApps.includes("chat") && <MockChatPane chipsVariant="empty-only" convStarted />}
        {second.length > 0 && <MockEditorPane label={appDef(second[second.length - 1]).label} />}
      </div>
    </div>
  );
}
