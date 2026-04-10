"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Fuse from "fuse.js";
import {
  Search,
  LayoutGrid,
  MessageCircle,
  KanbanSquare,
  FlaskConical,
  SlidersHorizontal,
  Users,
  Settings,
  NotebookPen,
  Zap,
  ArrowRight,
  Activity,
} from "lucide-react";

import type { LocalSearchResult } from "@/app/api/search/local/route";
import type { Conversation } from "@/types/chat";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ResultCategory = "page" | "action" | "ticket" | "conversation";

interface PageResult {
  category: "page";
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  shortcut?: string;
  aliases: string[];
}

interface ActionResult {
  category: "action";
  id: string;
  label: string;
  execute: () => void | Promise<void>;
}

interface TicketResult {
  category: "ticket";
  id: string;
  key: string;
  summary: string;
  status: string;
}

interface ConversationResult {
  category: "conversation";
  id: string;
  title: string;
  lastMessage?: string;
  conversationId: string;
}

type PaletteResult = PageResult | ActionResult | TicketResult | ConversationResult;

/* ------------------------------------------------------------------ */
/*  Static data                                                        */
/* ------------------------------------------------------------------ */

const PAGES: PageResult[] = [
  { category: "page", id: "page-dashboard", label: "Dashboard", href: "/", icon: <LayoutGrid className="h-4 w-4" strokeWidth={1.5} />, aliases: ["home", "overview", "start"] },
  { category: "page", id: "page-chat", label: "Chat", href: "/chat", icon: <MessageCircle className="h-4 w-4" strokeWidth={1.5} />, aliases: ["conversations", "messages", "talk"] },
  { category: "page", id: "page-sprint-board", label: "Sprint Board", href: "/sprint-board", icon: <KanbanSquare className="h-4 w-4" strokeWidth={1.5} />, aliases: ["board", "kanban", "tickets", "sprint", "backlog"] },
  { category: "page", id: "page-story-writer", label: "Story Writer", href: "/story-writer", icon: <NotebookPen className="h-4 w-4" strokeWidth={1.5} />, aliases: ["write", "stories", "editor"] },
  { category: "page", id: "page-test-center", label: "Test Center", href: "/test-center", icon: <FlaskConical className="h-4 w-4" strokeWidth={1.5} />, aliases: ["tests", "testing", "qa"] },
  { category: "page", id: "page-refinement", label: "Refinement", href: "/refinement", icon: <SlidersHorizontal className="h-4 w-4" strokeWidth={1.5} />, aliases: ["refine", "groom", "grooming", "prep"] },
  { category: "page", id: "page-activity-log", label: "Activity Log", href: "/activity-log", icon: <Activity className="h-4 w-4" strokeWidth={1.5} />, aliases: ["activity", "log", "history"] },
  { category: "page", id: "page-stakeholder", label: "Stakeholder", href: "/stakeholder", icon: <Users className="h-4 w-4" strokeWidth={1.5} />, aliases: ["external", "readonly", "share"] },
  { category: "page", id: "page-settings", label: "Settings", href: "/settings", icon: <Settings className="h-4 w-4" strokeWidth={1.5} />, aliases: ["preferences", "config", "configuration"] },
];

const pageFuse = new Fuse(PAGES, {
  keys: [
    { name: "label", weight: 1.0 },
    { name: "aliases", weight: 0.7 },
  ],
  threshold: 0.4,
  includeScore: true,
});

/* ------------------------------------------------------------------ */
/*  Status badge colors                                                */
/* ------------------------------------------------------------------ */

function statusColor(status: string): { bg: string; text: string } {
  const s = status?.toUpperCase() ?? "";
  if (s === "DONE") return { bg: "rgba(34,197,94,0.12)", text: "#4ade80" };
  if (s.includes("PROGRESS")) return { bg: "rgba(56,152,210,0.12)", text: "#58b4e6" };
  if (s.includes("TEST") || s.includes("REVIEW")) return { bg: "rgba(120,90,220,0.12)", text: "#9b7ee8" };
  if (s === "DEPRECATED") return { bg: "rgba(239,68,68,0.12)", text: "#f87171" };
  return { bg: "rgba(100,116,139,0.10)", text: "rgba(255,255,255,0.4)" };
}

/* ------------------------------------------------------------------ */
/*  Category labels                                                    */
/* ------------------------------------------------------------------ */

const CATEGORY_LABELS: Record<ResultCategory, string> = {
  page: "Pages",
  action: "Actions",
  ticket: "Tickets",
  conversation: "Conversations",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const MAX_PER_CATEGORY = 5;
const MAX_TOTAL = 15;
const TICKET_DEBOUNCE_MS = 300;

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [ticketResults, setTicketResults] = useState<TicketResult[]>([]);
  const [conversationResults, setConversationResults] = useState<ConversationResult[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [closing, setClosing] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const convAbortRef = useRef<AbortController | null>(null);

  /* ---- Sidebar toggle helper ---- */
  const toggleSidebar = useCallback(() => {
    try {
      const current = localStorage.getItem("sidebar-collapsed") === "true";
      localStorage.setItem("sidebar-collapsed", String(!current));
      window.dispatchEvent(new Event("storage"));
    } catch { /* noop */ }
  }, []);

  /* ---- Actions (static, but depend on callbacks) ---- */
  const actions: ActionResult[] = useMemo(() => [
    {
      category: "action",
      id: "action-sync-jira",
      label: "Sync Jira",
      execute: async () => {
        await fetch("/api/jira/sync-tickets", { method: "POST" });
      },
    },
    {
      category: "action",
      id: "action-new-conversation",
      label: "New Conversation",
      execute: async () => {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "New conversation" }),
        });
        if (res.ok) {
          const conv = await res.json();
          router.push(`/chat?id=${conv.id}`);
        }
      },
    },
    {
      category: "action",
      id: "action-toggle-sidebar",
      label: "Toggle Sidebar",
      execute: toggleSidebar,
    },
  ], [router, toggleSidebar]);

  const actionFuse = useMemo(
    () => new Fuse(actions, { keys: ["label"], threshold: 0.4, includeScore: true }),
    [actions],
  );

  /* ---- Open / close ---- */
  const handleOpen = useCallback(() => {
    setQuery("");
    setActiveIdx(0);
    setTicketResults([]);
    setConversationResults([]);
    setClosing(false);
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 120);
  }, []);

  /* ---- Global Cmd+K listener ---- */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        e.stopPropagation();
        if (open) handleClose();
        else handleOpen();
      }
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [open, handleOpen, handleClose]);

  /* ---- Ticket search (debounced) ---- */
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setTicketResults([]);
      setLoadingTickets(false);
      return;
    }

    setLoadingTickets(true);
    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      try {
        const res = await fetch(
          `/api/search/local?q=${encodeURIComponent(query.trim())}`,
          { signal: abortRef.current.signal },
        );
        if (res.ok) {
          const data = await res.json();
          const results: TicketResult[] = ((data.results ?? []) as LocalSearchResult[])
            .slice(0, MAX_PER_CATEGORY)
            .map((r) => ({
              category: "ticket" as const,
              id: `ticket-${r.key}`,
              key: r.key,
              summary: r.summary,
              status: r.status,
            }));
          setTicketResults(results);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      } finally {
        setLoadingTickets(false);
      }
    }, TICKET_DEBOUNCE_MS);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, open]);

  /* ---- Conversation search (debounced) ---- */
  useEffect(() => {
    if (!open) return;

    if (query.trim().length < 2) {
      setConversationResults([]);
      setLoadingConversations(false);
      return;
    }

    setLoadingConversations(true);
    const timeout = setTimeout(async () => {
      if (convAbortRef.current) convAbortRef.current.abort();
      convAbortRef.current = new AbortController();
      try {
        const res = await fetch("/api/conversations", {
          signal: convAbortRef.current.signal,
        });
        if (res.ok) {
          const all: Conversation[] = await res.json();
          const fuse = new Fuse(all, {
            keys: ["title"],
            threshold: 0.4,
            includeScore: true,
          });
          const matched = fuse.search(query.trim(), { limit: MAX_PER_CATEGORY });
          setConversationResults(
            matched.map((m) => ({
              category: "conversation" as const,
              id: `conv-${m.item.id}`,
              title: m.item.title,
              conversationId: m.item.id,
            })),
          );
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      } finally {
        setLoadingConversations(false);
      }
    }, TICKET_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [query, open]);

  /* ---- Build combined results ---- */
  const allResults: PaletteResult[] = useMemo(() => {
    const q = query.trim();

    // Pages: always show when empty, fuzzy match when query
    let pages: PageResult[];
    if (!q) {
      pages = PAGES.slice(0, MAX_PER_CATEGORY);
    } else {
      pages = pageFuse.search(q, { limit: MAX_PER_CATEGORY }).map((r) => r.item);
    }

    // Actions: always show when empty, fuzzy match when query
    let filteredActions: ActionResult[];
    if (!q) {
      filteredActions = actions.slice(0, MAX_PER_CATEGORY);
    } else {
      filteredActions = actionFuse.search(q, { limit: MAX_PER_CATEGORY }).map((r) => r.item);
    }

    const combined: PaletteResult[] = [
      ...pages,
      ...filteredActions,
      ...ticketResults,
      ...conversationResults,
    ];

    return combined.slice(0, MAX_TOTAL);
  }, [query, actions, actionFuse, ticketResults, conversationResults]);

  /* ---- Reset active index when results change ---- */
  useEffect(() => {
    setActiveIdx(0);
  }, [allResults.length, query]);

  /* ---- Execute result ---- */
  const executeResult = useCallback((result: PaletteResult) => {
    switch (result.category) {
      case "page":
        router.push(result.href);
        handleClose();
        break;
      case "action":
        result.execute();
        handleClose();
        break;
      case "ticket":
        router.push(`/tickets/${result.key}`);
        handleClose();
        break;
      case "conversation":
        router.push(`/chat?id=${result.conversationId}`);
        handleClose();
        break;
    }
  }, [router, handleClose]);

  /* ---- Keyboard navigation ---- */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((prev) => Math.min(prev + 1, allResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const result = allResults[activeIdx];
      if (result) executeResult(result);
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
    }
  }, [allResults, activeIdx, executeResult, handleClose]);

  /* ---- Scroll active item into view ---- */
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const rows = list.querySelectorAll("[data-palette-row]");
    const row = rows[activeIdx] as HTMLElement | undefined;
    row?.scrollIntoView?.({ block: "nearest" });
  }, [activeIdx]);

  /* ---- Render ---- */
  if (!open) return null;

  // Group results by category for section headers
  const grouped: { category: ResultCategory; items: PaletteResult[] }[] = [];
  for (const result of allResults) {
    const last = grouped[grouped.length - 1];
    if (last && last.category === result.category) {
      last.items.push(result);
    } else {
      grouped.push({ category: result.category, items: [result] });
    }
  }

  // Flat index tracker for active highlighting
  let flatIdx = 0;

  const isLoading = loadingTickets || loadingConversations;

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[15vh] ${closing ? "cmd-palette-backdrop-out" : "cmd-palette-backdrop-in"}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      {/* Backdrop blur layer */}
      <div className="pointer-events-none absolute inset-0 backdrop-blur-[6px]" />

      {/* Palette container */}
      <div
        className={`relative z-10 w-full max-w-[560px] overflow-hidden rounded-2xl border border-white/[0.08] ${closing ? "cmd-palette-out" : "cmd-palette-in"}`}
        style={{
          backgroundColor: "var(--color-surface-floating)",
          boxShadow:
            "0 0 0 1px rgba(255,255,255,0.04), 0 24px 64px rgba(0,0,0,0.65), 0 8px 24px rgba(0,0,0,0.4), 0 0 80px rgba(19,69,128,0.08)",
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search input row */}
        <div className="flex items-center gap-3 px-5 py-4">
          <Search className="h-[18px] w-[18px] shrink-0 text-white/25" strokeWidth={1.5} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages, tickets, or actions..."
            className="flex-1 bg-transparent text-[15px] text-white/90 placeholder-white/20 focus:outline-none font-[var(--font-body)]"
            spellCheck={false}
            autoComplete="off"
          />
          {isLoading && (
            <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/10 border-t-white/40" />
          )}
          <kbd className="hidden sm:flex items-center rounded-md border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-mono text-white/20 tracking-wide">
            ESC
          </kbd>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/[0.06]" />

        {/* Results list */}
        <div
          ref={listRef}
          className="overflow-y-auto py-2"
          style={{
            maxHeight: 380,
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(255,255,255,0.06) transparent",
          }}
        >
          {allResults.length === 0 && query.trim().length > 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-white/20 text-sm">
              <Search className="h-8 w-8 mb-3 text-white/10" strokeWidth={1} />
              <span>No results for &ldquo;{query}&rdquo;</span>
            </div>
          )}

          {grouped.map((group) => {
            const sectionStartIdx = flatIdx;
            return (
              <div key={`${group.category}-${sectionStartIdx}`}>
                {/* Section header */}
                <div className="px-5 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/20 font-[var(--font-body)]">
                  {CATEGORY_LABELS[group.category]}
                </div>

                {group.items.map((result) => {
                  const idx = flatIdx++;
                  const isActive = idx === activeIdx;

                  return (
                    <div
                      key={result.id}
                      data-palette-row=""
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => executeResult(result)}
                      className={`group flex items-center gap-3 mx-2 px-3 py-2 rounded-lg cursor-pointer transition-colors duration-75 ${
                        isActive
                          ? "bg-white/[0.06]"
                          : "hover:bg-white/[0.03]"
                      }`}
                    >
                      <ResultIcon result={result} isActive={isActive} />
                      <ResultLabel result={result} isActive={isActive} />
                      {isActive && (
                        <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-white/20" strokeWidth={1.5} />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-4 border-t border-white/[0.06] px-5 py-2.5 text-[10px] text-white/18">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-white/[0.08] bg-white/[0.03] px-1 py-0.5 font-mono text-white/20">{"\u2191\u2193"}</kbd>
            <span className="text-white/20">navigate</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-white/[0.08] bg-white/[0.03] px-1 py-0.5 font-mono text-white/20">{"\u21b5"}</kbd>
            <span className="text-white/20">open</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-white/[0.08] bg-white/[0.03] px-1 py-0.5 font-mono text-white/20">esc</kbd>
            <span className="text-white/20">close</span>
          </span>
        </div>
      </div>

      <style>{`
        @keyframes cmdPaletteBackdropIn {
          from { background-color: rgba(0,0,0,0); }
          to { background-color: rgba(0,0,0,0.5); }
        }
        @keyframes cmdPaletteBackdropOut {
          from { background-color: rgba(0,0,0,0.5); }
          to { background-color: rgba(0,0,0,0); }
        }
        @keyframes cmdPaletteIn {
          from { opacity: 0; transform: scale(0.95) translateY(-8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes cmdPaletteOut {
          from { opacity: 1; transform: scale(1) translateY(0); }
          to { opacity: 0; transform: scale(0.95) translateY(-8px); }
        }
        .cmd-palette-backdrop-in {
          animation: cmdPaletteBackdropIn 0.15s ease-out forwards;
        }
        .cmd-palette-backdrop-out {
          animation: cmdPaletteBackdropOut 0.12s ease-in forwards;
        }
        .cmd-palette-in {
          animation: cmdPaletteIn 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .cmd-palette-out {
          animation: cmdPaletteOut 0.12s ease-in forwards;
        }
      `}</style>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ResultIcon({ result, isActive }: { result: PaletteResult; isActive: boolean }) {
  const base = `shrink-0 flex items-center justify-center h-7 w-7 rounded-lg transition-colors duration-75`;

  switch (result.category) {
    case "page":
      return (
        <span className={`${base} ${isActive ? "bg-[var(--color-brand-600)]/15 text-[var(--color-brand-400)]" : "bg-white/[0.04] text-white/30"}`}>
          {result.icon}
        </span>
      );
    case "action":
      return (
        <span className={`${base} ${isActive ? "bg-amber-500/15 text-amber-400" : "bg-white/[0.04] text-white/30"}`}>
          <Zap className="h-4 w-4" strokeWidth={1.5} />
        </span>
      );
    case "ticket":
      return (
        <span className={`${base} ${isActive ? "bg-[var(--color-secondary-600)]/15 text-[var(--color-secondary-400)]" : "bg-white/[0.04] text-white/30"}`}>
          <KanbanSquare className="h-4 w-4" strokeWidth={1.5} />
        </span>
      );
    case "conversation":
      return (
        <span className={`${base} ${isActive ? "bg-purple-500/15 text-purple-400" : "bg-white/[0.04] text-white/30"}`}>
          <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
        </span>
      );
  }
}

function ResultLabel({ result, isActive }: { result: PaletteResult; isActive: boolean }) {
  switch (result.category) {
    case "page":
      return (
        <div className="flex flex-col min-w-0 flex-1">
          <span className={`text-sm truncate ${isActive ? "text-white/90" : "text-white/60"}`}>
            {result.label}
          </span>
        </div>
      );
    case "action":
      return (
        <div className="flex flex-col min-w-0 flex-1">
          <span className={`text-sm truncate ${isActive ? "text-white/90" : "text-white/60"}`}>
            {result.label}
          </span>
        </div>
      );
    case "ticket": {
      const sc = statusColor(result.status);
      return (
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="shrink-0 font-mono text-[11px] text-white/30 font-medium">{result.key}</span>
          <span className={`text-sm truncate ${isActive ? "text-white/90" : "text-white/60"}`}>
            {result.summary}
          </span>
          <span
            className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium capitalize"
            style={{ backgroundColor: sc.bg, color: sc.text }}
          >
            {result.status.toLowerCase()}
          </span>
        </div>
      );
    }
    case "conversation":
      return (
        <div className="flex flex-col min-w-0 flex-1">
          <span className={`text-sm truncate ${isActive ? "text-white/90" : "text-white/60"}`}>
            {result.title}
          </span>
          {result.lastMessage && (
            <span className="text-xs text-white/20 truncate mt-0.5">{result.lastMessage}</span>
          )}
        </div>
      );
  }
}
