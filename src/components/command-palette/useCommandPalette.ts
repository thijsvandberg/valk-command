"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Fuse from "fuse.js";
import { useRouter, usePathname } from "next/navigation";

import { apiFetch, jira, conversations as conversationsApi, storyWriter, sprintSlots as sprintSlotsApi } from "@/lib/api-client";
import type { LocalSearchResult } from "@/app/api/search/local/route";
import type { Conversation } from "@/types/chat";
import type { ActiveSession } from "@/app/api/story-writer/active-sessions/route";

import type {
  ActionResult,
  TicketResult,
  ConversationResult,
  StoryWriterResult,
  DirectTicketResult,
  PaletteResult,
  SubFlowState,
  SprintSlot,
} from "./types";
import {
  PAGES,
  pageFuse,
  MAX_PER_CATEGORY,
  MAX_TOTAL,
  TICKET_DEBOUNCE_MS,
  extractTicketKey,
} from "./palette-data";

export interface UseCommandPaletteReturn {
  open: boolean;
  closing: boolean;
  query: string;
  setQuery: (q: string) => void;
  activeIdx: number;
  setActiveIdx: (idx: number) => void;
  subFlow: SubFlowState;
  setSubFlow: React.Dispatch<React.SetStateAction<SubFlowState>>;
  allResults: PaletteResult[];
  loadingTickets: boolean;
  loadingConversations: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  subFlowInputRef: React.RefObject<HTMLInputElement | null>;
  listRef: React.RefObject<HTMLDivElement | null>;
  handleOpen: () => void;
  handleClose: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleSubFlowConfirm: () => Promise<void>;
  executeResult: (result: PaletteResult) => void;
}

export function useCommandPalette(): UseCommandPaletteReturn {
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
        await jira.syncTickets({});
      },
    },
    {
      category: "action",
      id: "action-new-conversation",
      label: "New Conversation",
      aliases: ["chat", "message"],
      execute: async () => {
        const conv = await conversationsApi.create({ title: "New conversation" });
        router.push(`/chat?id=${conv.id}`);
      },
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
    {
      category: "action",
      id: "action-keyboard-shortcuts",
      label: "Keyboard Shortcuts",
      aliases: ["shortcuts", "keys", "hotkeys", "keybindings"],
      execute: () => {
        window.dispatchEvent(new Event("valk:openKeyboardShortcuts"));
      },
    },
    {
      category: "action",
      id: "action-new-investigation",
      label: "New Investigation",
      aliases: ["investigate", "search code", "code search", "codebase"],
      execute: async () => {
        const conv = await conversationsApi.create({ title: "New investigation", type: "investigation" });
        router.push(`/chat/${conv.id}`);
      },
    },
  ], [router, currentWriterKey]);

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
    apiFetch<ActiveSession[]>("/api/story-writer/active-sessions")
      .then((data) => {
        setStoryWriterSessions(
          data.map((s) => ({
            category: "story-writer" as const,
            id: `sw-${s.ticketKey}`,
            ticketKey: s.ticketKey,
            title: s.title,
            sessionId: s.sessionId,
            targetTicketKey: s.targetTicketKey ?? null,
            targetTitle: s.targetTitle ?? null,
          })),
        );
      })
      .catch((err) => console.warn("[command-palette] fetch sessions failed", err));
  }, [open]);

  /* ---- Lazily fetch sprint slots when the sub-flow opens ---- */
  const isSubFlowLoadingSprints = subFlow.kind === "new-story" && subFlow.loadingSprints;
  useEffect(() => {
    if (!isSubFlowLoadingSprints) return;
    let cancelled = false;
    (sprintSlotsApi.list() as Promise<SprintSlot[]>)
      .then((data) => {
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
        const data = await apiFetch<{ results?: LocalSearchResult[] }>(
          `/api/search/local?q=${encodeURIComponent(query.trim())}`,
          { signal: abortRef.current.signal },
        );
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
        const all = await conversationsApi.list(convAbortRef.current.signal);
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
        const result = await storyWriter.createViaGlobal({ title, sprintId: subFlow.sprintId || undefined }) as { key: string };
        router.push(`/tickets/${result.key}/write`);
        handleClose();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong";
        setSubFlow((prev) => prev.kind === "new-story" ? { ...prev, loading: false, error: msg } : prev);
      }
    } else {
      const key = subFlow.existingKey.trim().toUpperCase();
      if (!key) {
        setSubFlow((prev) => prev.kind === "new-story" ? { ...prev, error: "Enter a ticket key" } : prev);
        return;
      }
      setSubFlow((prev) => prev.kind === "new-story" ? { ...prev, loading: true, error: null } : prev);
      try {
        await apiFetch(`/api/tickets/${key}`);
        router.push(`/tickets/${key}/write`);
        handleClose();
      } catch {
        setSubFlow((prev) => prev.kind === "new-story" ? { ...prev, loading: false, error: `Ticket ${key} not found locally` } : prev);
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

  return {
    open,
    closing,
    query,
    setQuery,
    activeIdx,
    setActiveIdx,
    subFlow,
    setSubFlow,
    allResults,
    loadingTickets,
    loadingConversations,
    inputRef,
    subFlowInputRef,
    listRef,
    handleOpen,
    handleClose,
    handleKeyDown,
    handleSubFlowConfirm,
    executeResult,
  };
}
