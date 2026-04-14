"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname } from "next/navigation";
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
  Plus,
  Link,
  ChevronDown,
  ChevronLeft,
} from "lucide-react";

import type { LocalSearchResult } from "@/app/api/search/local/route";
import type { Conversation } from "@/types/chat";
import type { ActiveSession } from "@/app/api/story-writer/active-sessions/route";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ResultCategory = "page" | "action" | "ticket" | "conversation" | "direct-ticket" | "story-writer";

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
  description?: string;
  aliases: string[];
  opensSubFlow?: boolean;
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

interface DirectTicketResult {
  category: "direct-ticket";
  id: string;
  key: string;
}

interface StoryWriterResult {
  category: "story-writer";
  id: string;
  ticketKey: string;
  title: string;
  sessionId: string;
}

type PaletteResult =
  | PageResult
  | ActionResult
  | TicketResult
  | ConversationResult
  | DirectTicketResult
  | StoryWriterResult;

interface SprintSlot {
  slotIndex: number;
  sprintId: string;
  sprintName: string;
}

type SubFlowState =
  | { kind: "none" }
  | {
      kind: "new-story";
      mode: "create" | "existing";
      title: string;
      existingKey: string;
      sprintId: string;
      sprints: SprintSlot[];
      loading: boolean;
      error: string | null;
      loadingSprints: boolean;
    };

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
/*  Jira ticket key extraction                                         */
/* ------------------------------------------------------------------ */

function extractTicketKey(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Plain ticket key: VPL-12345
  const plainMatch = trimmed.match(/^([A-Z]{2,10}-\d+)$/i);
  if (plainMatch) return plainMatch[1].toUpperCase();

  // Jira browse URL: https://...atlassian.net/browse/VPL-12345
  const browseMatch = trimmed.match(/atlassian\.net\/browse\/([A-Z]{2,10}-\d+)/i);
  if (browseMatch) return browseMatch[1].toUpperCase();

  // Jira board URL with selectedIssue param
  const selectedMatch = trimmed.match(/selectedIssue=([A-Z]{2,10}-\d+)/i);
  if (selectedMatch) return selectedMatch[1].toUpperCase();

  return null;
}

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
  "direct-ticket": "Direct",
  "story-writer": "Story Writer",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const MAX_PER_CATEGORY = 5;
const MAX_TOTAL = 15;
const TICKET_DEBOUNCE_MS = 300;

export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [ticketResults, setTicketResults] = useState<TicketResult[]>([]);
  const [conversationResults, setConversationResults] = useState<ConversationResult[]>([]);
  const [storyWriterSessions, setStoryWriterSessions] = useState<StoryWriterResult[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [closing, setClosing] = useState(false);
  const [subFlow, setSubFlow] = useState<SubFlowState>({ kind: "none" });

  const inputRef = useRef<HTMLInputElement>(null);
  const subFlowInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const convAbortRef = useRef<AbortController | null>(null);

  // Detect the current story writer session from the active route
  const currentWriterKey = useMemo(() => {
    const match = pathname?.match(/^\/tickets\/([A-Z]+-\d+)\/write$/i);
    return match ? match[1].toUpperCase() : null;
  }, [pathname]);

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
      id: "action-search-tickets",
      label: "Search Tickets",
      aliases: ["s", "find", "lookup"],
      execute: () => {
        window.dispatchEvent(new Event("valk:openGlobalSearch"));
      },
    },
    {
      category: "action",
      id: "action-sync-jira",
      label: "Sync Jira",
      aliases: ["refresh", "pull", "update"],
      execute: async () => {
        await fetch("/api/jira/sync-tickets", { method: "POST" });
      },
    },
    {
      category: "action",
      id: "action-new-conversation",
      label: "New Conversation",
      aliases: ["chat", "message"],
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
      aliases: ["collapse", "expand", "menu"],
      execute: toggleSidebar,
    },
    {
      category: "action",
      id: "action-new-story",
      label: "New Story",
      description: currentWriterKey ? `Currently editing ${currentWriterKey}` : undefined,
      aliases: ["write", "story", "create story", "new story"],
      opensSubFlow: true,
      execute: () => {
        setSubFlow({
          kind: "new-story",
          mode: "create",
          title: "",
          existingKey: "",
          sprintId: "",
          sprints: [],
          loading: false,
          error: null,
          loadingSprints: true,
        });
      },
    },
  ], [router, toggleSidebar, currentWriterKey]);

  const actionFuse = useMemo(
    () => new Fuse(actions, {
      keys: [
        { name: "label", weight: 1.0 },
        { name: "aliases", weight: 0.9 },
      ],
      threshold: 0.4,
      includeScore: true,
    }),
    [actions],
  );

  /* ---- Open / close ---- */
  const handleOpen = useCallback(() => {
    window.dispatchEvent(new Event("valk:closeGlobalSearch"));
    setQuery("");
    setActiveIdx(0);
    setTicketResults([]);
    setConversationResults([]);
    setStoryWriterSessions([]);
    setSubFlow({ kind: "none" });
    setClosing(false);
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleClose = useCallback(() => {
    setSubFlow({ kind: "none" });
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 120);
  }, []);

  /* ---- Global Cmd+K listener ---- */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "k") {
        e.preventDefault();
        e.stopPropagation();
        if (open) handleClose();
        else handleOpen();
      }
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [open, handleOpen, handleClose]);

  /* ---- Listen for close requests from GlobalSearch ---- */
  useEffect(() => {
    function onClosePalette() {
      setOpen(false);
      setClosing(false);
    }
    window.addEventListener("valk:closePalette", onClosePalette);
    return () => window.removeEventListener("valk:closePalette", onClosePalette);
  }, []);

  /* ---- Fetch active story writer sessions once on palette open ---- */
  useEffect(() => {
    if (!open) return;
    fetch("/api/story-writer/active-sessions")
      .then((r) => r.json())
      .then((data: ActiveSession[]) => {
        setStoryWriterSessions(
          data.map((s) => ({
            category: "story-writer" as const,
            id: `sw-${s.ticketKey}`,
            ticketKey: s.ticketKey,
            title: s.title,
            sessionId: s.sessionId,
          })),
        );
      })
      .catch(() => {});
  }, [open]);

  /* ---- Lazily fetch sprint slots when the sub-flow opens ---- */
  const isSubFlowLoadingSprints = subFlow.kind === "new-story" && subFlow.loadingSprints;
  useEffect(() => {
    if (!isSubFlowLoadingSprints) return;
    let cancelled = false;
    fetch("/api/sprint-slots")
      .then((r) => r.json())
      .then((data: SprintSlot[]) => {
        if (cancelled) return;
        setSubFlow((prev) => {
          if (prev.kind !== "new-story") return prev;
          return { ...prev, sprints: data, sprintId: data[0]?.sprintId ?? "", loadingSprints: false };
        });
      })
      .catch(() => {
        if (cancelled) return;
        setSubFlow((prev) => {
          if (prev.kind !== "new-story") return prev;
          return { ...prev, loadingSprints: false };
        });
      });
    return () => { cancelled = true; };
  }, [isSubFlowLoadingSprints]);

  /* ---- Auto-focus the sub-flow input when mode changes ---- */
  const subFlowMode = subFlow.kind === "new-story" ? subFlow.mode : null;
  useEffect(() => {
    if (subFlow.kind === "new-story") {
      requestAnimationFrame(() => subFlowInputRef.current?.focus());
    }
  }, [subFlow.kind, subFlowMode]);

  /* ---- Ticket search (debounced) ---- */
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Skip fuzzy search when we already have a direct ticket key match
    if (extractTicketKey(query) || query.trim().length < 2) {
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

    if (extractTicketKey(query) || query.trim().length < 2) {
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
          // Only surface plain chat conversations here; story writer sessions
          // are handled separately via the active-sessions endpoint
          const plainConversations = all.filter((c) => !c.relatedTicket);
          const fuse = new Fuse(plainConversations, {
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

  /* ---- Detect direct ticket key from query (URL or plain key) ---- */
  const directTicketKey = useMemo(() => extractTicketKey(query), [query]);

  /* ---- Filter story writer sessions by query (client-side) ---- */
  const filteredStoryWriterSessions = useMemo((): StoryWriterResult[] => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // No query: surface all open sessions so the user can jump to any of them
      return storyWriterSessions.slice(0, MAX_PER_CATEGORY);
    }
    if (directTicketKey) {
      // Typing a ticket key: show the session for that specific ticket (if open)
      const match = storyWriterSessions.find((s) => s.ticketKey === directTicketKey);
      return match ? [match] : [];
    }
    return storyWriterSessions
      .filter((s) => s.ticketKey.toLowerCase().includes(q) || s.title.toLowerCase().includes(q))
      .slice(0, MAX_PER_CATEGORY);
  }, [query, storyWriterSessions, directTicketKey]);

  /* ---- Build combined results ---- */
  const allResults: PaletteResult[] = useMemo(() => {
    const q = query.trim();

    // If we detected a direct ticket key, show the story writer session for that
    // ticket first (if open), then the direct-open result, then fuzzy ticket results
    if (directTicketKey) {
      const direct: DirectTicketResult = {
        category: "direct-ticket",
        id: `direct-${directTicketKey}`,
        key: directTicketKey,
      };
      return [
        ...filteredStoryWriterSessions,
        direct,
        ...ticketResults.filter((t) => t.key !== directTicketKey),
      ];
    }

    if (!q) {
      // No query: open story writer sessions first, then pages and actions
      const combined: PaletteResult[] = [
        ...filteredStoryWriterSessions,
        ...PAGES.slice(0, MAX_PER_CATEGORY),
        ...actions.slice(0, MAX_PER_CATEGORY),
      ];
      return combined.slice(0, MAX_TOTAL);
    }

    // With a query: rank all instant results by fuse score, best match first.
    const ql = q.toLowerCase();
    function boost(label: string, aliases: string[], score: number): number {
      if (aliases.some((a) => a.toLowerCase() === ql)) return score * 0.01;
      if (label.toLowerCase().startsWith(ql)) return score * 0.1;
      return score;
    }

    const scoredPages = pageFuse.search(q, { limit: MAX_PER_CATEGORY })
      .map((r) => ({ result: r.item as PaletteResult, score: boost(r.item.label, r.item.aliases, r.score ?? 1) }));
    const scoredActions = actionFuse.search(q, { limit: MAX_PER_CATEGORY })
      .map((r) => ({ result: r.item as PaletteResult, score: boost(r.item.label, r.item.aliases, r.score ?? 1) }));

    const scored = [...scoredPages, ...scoredActions]
      .sort((a, b) => a.score - b.score);

    // Group by category for section headers while preserving rank order
    const seen = new Set<string>();
    const ranked: PaletteResult[] = [];
    for (const { result } of scored) {
      if (!seen.has(result.id)) {
        seen.add(result.id);
        ranked.push(result);
      }
    }

    // Story writer results appear above plain conversations
    const combined: PaletteResult[] = [
      ...ranked,
      ...ticketResults,
      ...filteredStoryWriterSessions,
      ...conversationResults,
    ];

    return combined.slice(0, MAX_TOTAL);
  }, [query, actions, actionFuse, ticketResults, conversationResults, directTicketKey, filteredStoryWriterSessions]);

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
        // Actions with opensSubFlow stay open so the sub-flow can render
        if (!result.opensSubFlow) handleClose();
        break;
      case "ticket":
        router.push(`/tickets/${result.key}`);
        handleClose();
        break;
      case "direct-ticket":
        router.push(`/tickets/${result.key}`);
        handleClose();
        break;
      case "conversation":
        router.push(`/chat?id=${result.conversationId}`);
        handleClose();
        break;
      case "story-writer":
        router.push(`/tickets/${result.ticketKey}/write`);
        handleClose();
        break;
    }
  }, [router, handleClose]);

  /* ---- Sub-flow confirm ---- */
  const handleSubFlowConfirm = useCallback(async () => {
    if (subFlow.kind !== "new-story") return;

    if (subFlow.mode === "create") {
      const title = subFlow.title.trim();
      if (!title) {
        setSubFlow((prev) => prev.kind === "new-story" ? { ...prev, error: "Title is required" } : prev);
        return;
      }
      setSubFlow((prev) => prev.kind === "new-story" ? { ...prev, loading: true, error: null } : prev);
      try {
        const res = await fetch("/api/story-writer/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, sprintId: subFlow.sprintId || undefined }),
        });
        if (!res.ok) {
          const err = await res.json();
          setSubFlow((prev) => prev.kind === "new-story" ? { ...prev, loading: false, error: err.error ?? "Failed to create story" } : prev);
          return;
        }
        const { key } = await res.json();
        router.push(`/tickets/${key}/write`);
        handleClose();
      } catch {
        setSubFlow((prev) => prev.kind === "new-story" ? { ...prev, loading: false, error: "Something went wrong" } : prev);
      }
    } else {
      const key = subFlow.existingKey.trim().toUpperCase();
      if (!key) {
        setSubFlow((prev) => prev.kind === "new-story" ? { ...prev, error: "Enter a ticket key" } : prev);
        return;
      }
      setSubFlow((prev) => prev.kind === "new-story" ? { ...prev, loading: true, error: null } : prev);
      try {
        const res = await fetch(`/api/tickets/${key}`);
        if (!res.ok) {
          setSubFlow((prev) => prev.kind === "new-story" ? { ...prev, loading: false, error: `Ticket ${key} not found locally` } : prev);
          return;
        }
        router.push(`/tickets/${key}/write`);
        handleClose();
      } catch {
        setSubFlow((prev) => prev.kind === "new-story" ? { ...prev, loading: false, error: "Something went wrong" } : prev);
      }
    }
  }, [subFlow, router, handleClose]);

  /* ---- Keyboard navigation ---- */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // When sub-flow is active: Enter confirms, Escape returns to palette
    if (subFlow.kind === "new-story") {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubFlowConfirm();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setSubFlow({ kind: "none" });
        requestAnimationFrame(() => inputRef.current?.focus());
      }
      return;
    }

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
  }, [subFlow.kind, allResults, activeIdx, executeResult, handleClose, handleSubFlowConfirm]);

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
  const isSubFlow = subFlow.kind === "new-story";

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
        {/* Search input row (or sub-flow breadcrumb) */}
        {isSubFlow ? (
          <div className="flex items-center gap-3 px-5 py-4">
            <button
              type="button"
              onClick={() => { setSubFlow({ kind: "none" }); requestAnimationFrame(() => inputRef.current?.focus()); }}
              className="flex items-center justify-center h-[18px] w-[18px] shrink-0 text-white/30 hover:text-white/55 transition-colors duration-75 cursor-pointer"
              aria-label="Back to palette"
            >
              <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={1.5} />
            </button>
            <span className="flex-1 text-[15px] text-white/50 font-[var(--font-body)]">New Story</span>
            <kbd className="hidden sm:flex items-center rounded-md border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-mono text-white/20 tracking-wide">
              ESC
            </kbd>
          </div>
        ) : (
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
        )}

        {/* Divider */}
        <div className="h-px bg-white/[0.06]" />

        {/* Sub-flow form or results list */}
        {isSubFlow ? (
          <SubFlowForm
            subFlow={subFlow}
            subFlowInputRef={subFlowInputRef}
            onModeChange={(mode) =>
              setSubFlow((prev) => prev.kind === "new-story" ? { ...prev, mode, error: null } : prev)
            }
            onTitleChange={(title) =>
              setSubFlow((prev) => prev.kind === "new-story" ? { ...prev, title } : prev)
            }
            onSprintChange={(sprintId) =>
              setSubFlow((prev) => prev.kind === "new-story" ? { ...prev, sprintId } : prev)
            }
            onExistingKeyChange={(existingKey) =>
              setSubFlow((prev) => prev.kind === "new-story" ? { ...prev, existingKey } : prev)
            }
            onConfirm={handleSubFlowConfirm}
            onCancel={() => { setSubFlow({ kind: "none" }); requestAnimationFrame(() => inputRef.current?.focus()); }}
          />
        ) : (
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
        )}

        {/* Footer hints */}
        <div className="flex items-center gap-4 border-t border-white/[0.06] px-5 py-2.5 text-[10px] text-white/18">
          {isSubFlow ? (
            <>
              <span className="flex items-center gap-1.5">
                <kbd className="rounded border border-white/[0.08] bg-white/[0.03] px-1 py-0.5 font-mono text-white/20">{"\u21b5"}</kbd>
                <span className="text-white/20">confirm</span>
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="rounded border border-white/[0.08] bg-white/[0.03] px-1 py-0.5 font-mono text-white/20">esc</kbd>
                <span className="text-white/20">back</span>
              </span>
            </>
          ) : (
            <>
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
            </>
          )}
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
/*  Sub-flow form                                                      */
/* ------------------------------------------------------------------ */

interface SubFlowFormProps {
  subFlow: Extract<SubFlowState, { kind: "new-story" }>;
  subFlowInputRef: React.RefObject<HTMLInputElement | null>;
  onModeChange: (mode: "create" | "existing") => void;
  onTitleChange: (title: string) => void;
  onSprintChange: (sprintId: string) => void;
  onExistingKeyChange: (key: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function SubFlowForm({
  subFlow,
  subFlowInputRef,
  onModeChange,
  onTitleChange,
  onSprintChange,
  onExistingKeyChange,
  onConfirm,
  onCancel,
}: SubFlowFormProps) {
  return (
    <div className="p-4">
      {/* Mode toggle */}
      <div className="mb-4 flex gap-1 rounded-lg bg-white/[0.04] p-1">
        <button
          type="button"
          onClick={() => onModeChange("create")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium cursor-pointer transition-colors duration-150 ${
            subFlow.mode === "create"
              ? "bg-[var(--color-surface-floating)] text-white/80 shadow-sm"
              : "text-white/40 hover:text-white/60"
          }`}
        >
          <Plus size={12} strokeWidth={2} />
          Create new
        </button>
        <button
          type="button"
          onClick={() => onModeChange("existing")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium cursor-pointer transition-colors duration-150 ${
            subFlow.mode === "existing"
              ? "bg-[var(--color-surface-floating)] text-white/80 shadow-sm"
              : "text-white/40 hover:text-white/60"
          }`}
        >
          <Link size={12} strokeWidth={2} />
          Use existing
        </button>
      </div>

      {/* Create new form */}
      {subFlow.mode === "create" && (
        <div className="mb-4 space-y-3">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-white/45">
              Story title
            </label>
            <input
              ref={subFlowInputRef}
              type="text"
              value={subFlow.title}
              onChange={(e) => onTitleChange(e.target.value)}
              className="w-full rounded-md border border-white/[0.08] bg-[var(--color-surface-floating)] px-3 py-2 text-sm text-white/80 placeholder-white/20 focus:border-[var(--color-brand-500)]/40 focus:outline-none transition-colors duration-150"
              placeholder="Story title..."
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-white/45">
              Sprint
            </label>
            <div className="relative">
              <select
                value={subFlow.sprintId}
                onChange={(e) => onSprintChange(e.target.value)}
                className="w-full appearance-none rounded-md border border-white/[0.08] bg-[var(--color-surface-floating)] px-3 py-2 pr-8 text-sm text-white/80 focus:border-[var(--color-brand-500)]/40 focus:outline-none transition-colors duration-150 cursor-pointer"
              >
                {subFlow.loadingSprints ? (
                  <option value="">Loading sprints...</option>
                ) : subFlow.sprints.length === 0 ? (
                  <option value="">No sprints configured</option>
                ) : (
                  subFlow.sprints.map((s) => (
                    <option key={s.sprintId} value={s.sprintId}>
                      {s.sprintName}
                    </option>
                  ))
                )}
              </select>
              <ChevronDown
                size={13}
                strokeWidth={1.5}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-white/35"
              />
            </div>
          </div>
        </div>
      )}

      {/* Use existing form */}
      {subFlow.mode === "existing" && (
        <div className="mb-4">
          <label className="mb-1.5 block text-[11px] font-medium text-white/45">
            Ticket key
          </label>
          <input
            ref={subFlowInputRef}
            type="text"
            value={subFlow.existingKey}
            onChange={(e) => onExistingKeyChange(e.target.value.toUpperCase())}
            className="w-full rounded-md border border-white/[0.08] bg-[var(--color-surface-floating)] px-3 py-2 font-mono text-sm text-white/80 placeholder-white/20 focus:border-[var(--color-brand-500)]/40 focus:outline-none transition-colors duration-150"
            placeholder="VPL-123"
          />
          <p className="mt-1.5 text-[11px] text-white/30">
            The ticket must be synced locally.
          </p>
        </div>
      )}

      {/* Inline error */}
      {subFlow.error && (
        <p className="mb-4 rounded-md bg-red-500/[0.08] px-3 py-2 text-xs text-red-400/80">
          {subFlow.error}
        </p>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={subFlow.loading}
          className="px-3 py-1.5 text-sm text-white/40 hover:text-white/60 disabled:opacity-40 transition-colors duration-150 cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={subFlow.loading}
          className="flex items-center gap-1.5 rounded-md bg-[var(--color-brand-600)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-brand-500)] disabled:opacity-50 transition-colors duration-150 cursor-pointer"
        >
          {subFlow.loading ? (
            <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white/80 animate-spin" />
          ) : subFlow.mode === "create" ? (
            <Plus size={13} strokeWidth={2} />
          ) : (
            <ArrowRight size={13} strokeWidth={1.5} />
          )}
          {subFlow.mode === "create" ? "Create" : "Open"}
        </button>
      </div>
    </div>
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
    case "direct-ticket":
      return (
        <span className={`${base} ${isActive ? "bg-[var(--color-brand-600)]/15 text-[var(--color-brand-400)]" : "bg-white/[0.04] text-white/30"}`}>
          <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
        </span>
      );
    case "conversation":
      return (
        <span className={`${base} ${isActive ? "bg-purple-500/15 text-purple-400" : "bg-white/[0.04] text-white/30"}`}>
          <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
        </span>
      );
    case "story-writer":
      return (
        <span className={`${base} ${isActive ? "bg-emerald-500/15 text-emerald-400" : "bg-white/[0.04] text-white/30"}`}>
          <NotebookPen className="h-4 w-4" strokeWidth={1.5} />
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
          {result.description && (
            <span className="text-[11px] text-white/25 truncate mt-0.5">{result.description}</span>
          )}
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
    case "direct-ticket":
      return (
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-mono font-semibold bg-[var(--color-brand-600)]/15 text-[var(--color-brand-400)]">
            {result.key}
          </span>
          <span className={`text-sm ${isActive ? "text-white/60" : "text-white/35"}`}>
            Press Enter to open directly
          </span>
        </div>
      );
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
    case "story-writer":
      return (
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="shrink-0 font-mono text-[11px] text-white/30 font-medium">{result.ticketKey}</span>
          <span className={`text-sm truncate ${isActive ? "text-white/90" : "text-white/60"}`}>
            {result.title}
          </span>
          <span className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/[0.10] text-emerald-400/70">
            Story Writer
          </span>
        </div>
      );
  }
}
