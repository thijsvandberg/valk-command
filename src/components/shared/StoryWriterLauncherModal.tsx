"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  X, Plus, BookOpen, NotebookPen, ChevronDown,
  Search, ArrowRight, History, Check, Trash2, IterationCw, Zap, Scissors,
} from "lucide-react";
import { IssueTypeIcon, ISSUE_TYPE_COLORS } from "@/components/shared/IssueTypeIcon";
import { apiFetch, jira, sprintSlots, config as configApi, storyWriter, settings } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/shared/TextInput";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import type { IssueType } from "@/types/ticket";
import type { JiraStatus } from "@/types/ticket";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JiraSprint { id: number; name: string; state: string }
interface SprintSlot  { slotIndex: number; sprintId: string; sprintName: string }

interface ActiveSession {
  sessionId: string; ticketKey: string; title: string;
  sprintName: string | null; epic: string | null; epicKey: string | null;
  issueType: string | null; status: string; updatedAt: string | null;
  targetTicketKey: string | null; targetTitle: string | null;
}

interface TicketSearchResult {
  key: string; summary: string; status: string; sprintName: string | null;
}

export interface StoryWriterLauncherModalProps { open: boolean; onClose: () => void }
type LauncherMode = "new" | "session" | "existing";

const ISSUE_TYPES: { value: IssueType; label: string }[] = [
  { value: "story", label: "Story" },
  { value: "bug",   label: "Bug"   },
  { value: "task",  label: "Task"  },
  { value: "spike", label: "Spike" },
];

// Resolve a sprint name that might be stored as a numeric ID
function resolveSprintName(raw: string | null, options: { value: string; label: string }[]): string | null {
  if (!raw) return null;
  if (/^\d+$/.test(raw.trim())) {
    return options.find((o) => o.value === raw.trim())?.label ?? raw;
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Sprint select — searchable, sectioned, keyboard-navigable, portal panel
// ---------------------------------------------------------------------------

interface SprintOption { value: string; label: string; section: "next" | "pinned" | "other" }

function SprintSelectDropdown({
  value, options, onChange,
}: { value: string; options: SprintOption[]; onChange: (v: string) => void }) {
  const [open, setOpen]             = useState(false);
  const [search, setSearch]         = useState("");
  const [focused, setFocused]       = useState(0);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const triggerRef  = useRef<HTMLButtonElement>(null);
  const panelRef    = useRef<HTMLDivElement>(null);
  const searchRef   = useRef<HTMLInputElement>(null);
  const itemRefs    = useRef<(HTMLButtonElement | null)[]>([]);
  const selected    = options.find((o) => o.value === value);

  const filtered = search.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const sections: { key: string; label: string; items: SprintOption[] }[] = [];
  if (!search.trim()) {
    const n = filtered.filter((o) => o.section === "next");
    const p = filtered.filter((o) => o.section === "pinned");
    const r = filtered.filter((o) => o.section === "other");
    if (n.length) sections.push({ key: "n", label: "Default",     items: n });
    if (p.length) sections.push({ key: "p", label: "Pinned",      items: p });
    if (r.length) sections.push({ key: "r", label: "All sprints", items: r });
  } else {
    sections.push({ key: "q", label: "", items: filtered });
  }
  const flat = sections.flatMap((s) => s.items);

  const openPanel = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPanelStyle({ position: "fixed", top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: "var(--z-notification)" });
    setSearch(""); setFocused(0); setOpen(true);
  };

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 20);
    else { setSearch(""); setFocused(0); }
  }, [open]);

  useEffect(() => { itemRefs.current[focused]?.scrollIntoView({ block: "nearest" }); }, [focused]);

  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open]);

  const nav = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown","Enter"," "].includes(e.key)) { e.preventDefault(); openPanel(); }
      return;
    }
    if (e.key === "ArrowDown")  { e.preventDefault(); setFocused((i) => Math.min(i + 1, flat.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocused((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (flat[focused]) { onChange(flat[focused].value); setOpen(false); } }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
  };

  let idx = 0;

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => open ? setOpen(false) : openPanel()} onKeyDown={nav}
        className="flex w-full items-center gap-2 rounded-md border border-border-default bg-overlay-subtle px-2.5 py-1.5 text-body text-left cursor-pointer hover:border-border-strong hover:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        style={{ transition: "background-color 100ms, border-color 100ms" }}
      >
        <span className="flex-1 min-w-0 truncate text-text-secondary">
          {selected?.label ?? <span className="text-text-muted">No sprint</span>}
        </span>
        <ChevronDown size={12} strokeWidth={1.5} className={`shrink-0 text-text-muted ${open ? "rotate-180" : ""}`} style={{ transition: "transform 150ms" }} />
      </button>

      {open && (
        <div ref={panelRef} style={panelStyle} onKeyDown={nav}
          className="overflow-hidden rounded-xl border border-border-strong bg-[var(--color-surface-floating)] shadow-[var(--shadow-modal)]"
        >
          <div className="border-b border-border-subtle px-2 py-1.5">
            <div className="relative">
              <Search size={11} strokeWidth={1.5} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
              <input ref={searchRef} type="text" value={search}
                onChange={(e) => { setSearch(e.target.value); setFocused(0); }}
                onKeyDown={nav}
                className="w-full rounded bg-overlay-subtle py-1 pl-6 pr-2 text-body-sm text-text-secondary placeholder-text-muted focus:outline-none focus:bg-overlay-default"
                placeholder="Search sprints…"
                style={{ transition: "background-color 80ms" }}
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {flat.length === 0
              ? <p className="px-3.5 py-3 text-body-sm text-text-tertiary">No sprints found</p>
              : sections.map((sec, si) => (
                <div key={sec.key}>
                  {sec.label && (
                    <p className={`px-3 pt-2 pb-0.5 text-caption font-semibold uppercase tracking-widest text-text-muted ${si > 0 ? "mt-1 border-t border-border-subtle" : ""}`}>
                      {sec.label}
                    </p>
                  )}
                  {sec.items.map((opt) => {
                    const fi = idx++;
                    const isSel = opt.value === value;
                    const isFoc = fi === focused;
                    return (
                      <button key={opt.value} ref={(el) => { itemRefs.current[fi] = el; }}
                        type="button"
                        onClick={() => { onChange(opt.value); setOpen(false); }}
                        onMouseEnter={() => setFocused(fi)}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left cursor-pointer"
                        style={{ backgroundColor: isFoc ? "var(--color-overlay-default)" : "transparent", transition: "background-color 60ms" }}
                      >
                        <span className="flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-[3px] border"
                          style={{
                            backgroundColor: isSel ? "var(--color-brand-500)" : "transparent",
                            borderColor: isSel ? "var(--color-brand-500)" : "var(--color-text-muted)",
                            transition: "background-color 100ms, border-color 100ms",
                          }}
                        >
                          {isSel && <Check size={8} strokeWidth={2.5} className="text-white" />}
                        </span>
                        <span className="flex-1 min-w-0 truncate text-body text-text-secondary">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))
            }
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Session select — portal panel, keyboard-navigable, no search
// ---------------------------------------------------------------------------

interface SelectOption { value: string; label: string; sublabel?: string | null }

function SessionSelectDropdown({
  value, options, onChange, placeholder = "Select…",
}: { value: string; options: SelectOption[]; onChange: (v: string) => void; placeholder?: string }) {
  const [open, setOpen]             = useState(false);
  const [focused, setFocused]       = useState(0);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef   = useRef<HTMLDivElement>(null);
  const itemRefs   = useRef<(HTMLButtonElement | null)[]>([]);
  const selected   = options.find((o) => o.value === value);

  const openPanel = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPanelStyle({ position: "fixed", top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: "var(--z-notification)" });
    setFocused(options.findIndex((o) => o.value === value) || 0);
    setOpen(true);
  };

  const closePanel = useCallback(() => { setOpen(false); setFocused(0); }, []);

  useEffect(() => { itemRefs.current[focused]?.scrollIntoView({ block: "nearest" }); }, [focused]);

  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) closePanel();
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open, closePanel]);

  const nav = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown","Enter"," "].includes(e.key)) { e.preventDefault(); openPanel(); }
      return;
    }
    if (e.key === "ArrowDown")  { e.preventDefault(); setFocused((i) => Math.min(i + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocused((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (options[focused]) { onChange(options[focused].value); closePanel(); } }
    else if (e.key === "Escape") { e.preventDefault(); closePanel(); triggerRef.current?.focus(); }
  };

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => open ? closePanel() : openPanel()} onKeyDown={nav}
        className="flex w-full items-center gap-2 rounded-md border border-border-default bg-overlay-subtle px-2.5 py-1.5 text-body text-left cursor-pointer hover:border-border-strong hover:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        style={{ transition: "background-color 100ms, border-color 100ms" }}
      >
        <span className="flex-1 min-w-0">
          {selected ? (
            <span className="block truncate text-text-secondary">{selected.label}
              {selected.sublabel && <span className="ml-2 text-label text-text-tertiary">{selected.sublabel}</span>}
            </span>
          ) : (
            <span className="text-text-muted">{placeholder}</span>
          )}
        </span>
        <ChevronDown size={12} strokeWidth={1.5} className={`shrink-0 text-text-muted ${open ? "rotate-180" : ""}`} style={{ transition: "transform 150ms" }} />
      </button>

      {open && (
        <div ref={panelRef} style={panelStyle} onKeyDown={nav}
          className="overflow-hidden rounded-xl border border-border-strong bg-[var(--color-surface-floating)] shadow-[var(--shadow-modal)] py-1.5"
        >
          <div className="max-h-52 overflow-y-auto">
            {options.length === 0
              ? <p className="px-3.5 py-3 text-body-sm text-text-tertiary">No sessions found</p>
              : options.map((opt, fi) => {
                const isSel = opt.value === value;
                const isFoc = fi === focused;
                return (
                  <button key={opt.value} ref={(el) => { itemRefs.current[fi] = el; }}
                    type="button"
                    onClick={() => { onChange(opt.value); setOpen(false); }}
                    onMouseEnter={() => setFocused(fi)}
                    className="flex w-full items-start gap-2.5 px-3 py-2 text-left cursor-pointer"
                    style={{ backgroundColor: isFoc ? "var(--color-overlay-default)" : "transparent", transition: "background-color 60ms" }}
                  >
                    <span className="flex h-[14px] w-[14px] mt-0.5 shrink-0 items-center justify-center rounded-[3px] border"
                      style={{
                        backgroundColor: isSel ? "var(--color-brand-500)" : "transparent",
                        borderColor: isSel ? "var(--color-brand-500)" : "var(--color-text-muted)",
                        transition: "background-color 100ms, border-color 100ms",
                      }}
                    >
                      {isSel && <Check size={8} strokeWidth={2.5} className="text-white" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-mono text-label font-medium text-[var(--color-brand-400)]/80">{opt.label}</span>
                      {opt.sublabel && <span className="block truncate text-body-sm text-text-secondary mt-0.5">{opt.sublabel}</span>}
                    </span>
                  </button>
                );
              })
            }
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

export function StoryWriterLauncherModal({ open, onClose }: StoryWriterLauncherModalProps) {
  const router = useRouter();
  const [mode, setMode] = useState<LauncherMode>("new");

  // New story
  const [newTitle, setNewTitle]         = useState("");
  const [issueType, setIssueType]       = useState<IssueType>("story");
  const [sprintOptions, setSprintOptions] = useState<SprintOption[]>([]);
  const [selectedSprintId, setSelectedSprintId] = useState("");
  const [creating, setCreating]         = useState(false);
  const [createError, setCreateError]   = useState<string | null>(null);

  // Open sessions
  const [sessions, setSessions]                 = useState<ActiveSession[]>([]);
  const [selectedSessionKey, setSelectedSessionKey] = useState("");
  const [sessionsLoading, setSessionsLoading]   = useState(false);
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState<string | null>(null);

  // Existing story search
  const [searchQuery, setSearchQuery]       = useState("");
  const [searchResults, setSearchResults]   = useState<TicketSearchResult[]>([]);
  const [searchLoading, setSearchLoading]   = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketSearchResult | null>(null);
  const [showDropdown, setShowDropdown]     = useState(false);
  const [focusedSearch, setFocusedSearch]   = useState(-1);

  const searchRef        = useRef<HTMLInputElement>(null);
  const dropdownRef      = useRef<HTMLDivElement>(null);
  const searchResultRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRefs         = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    setMode("new"); setNewTitle(""); setIssueType("story"); setCreateError(null);
    setSearchQuery(""); setSearchResults([]); setSelectedTicket(null);
    setShowDropdown(false); setSelectedSessionKey(""); setFocusedSearch(-1); setConfirmDeleteSessionId(null);

    Promise.all([
      jira.getSprints() as unknown as Promise<{ sprints: JiraSprint[]; backlogCount?: number }>,
      sprintSlots.list() as Promise<SprintSlot[]>,
      configApi.get() as Promise<{ nextSprintId: string }>,
      settings.getDefaultSprint().catch(() => ({ sprintId: "" })),
    ]).then(([sprintData, slots, cfg, defaultPref]) => {
      const all      = Array.isArray(sprintData) ? sprintData : (sprintData.sprints ?? []);
      const nextId   = cfg.nextSprintId?.trim() ?? "";
      const savedId  = defaultPref.sprintId?.trim() ?? "";
      const slotIds  = new Set(slots.map((s) => s.sprintId));
      const visible  = all.filter((s) => s.state !== "closed");
      const ordered: SprintOption[] = [];

      if (nextId) {
        const nx = visible.find((s) => String(s.id) === nextId);
        if (nx) ordered.push({ value: String(nx.id), label: nx.name, section: "next" });
      }
      for (const slot of slots) {
        if (slot.sprintId === nextId) continue;
        const sp = visible.find((s) => String(s.id) === slot.sprintId);
        ordered.push(sp
          ? { value: String(sp.id), label: sp.name, section: "pinned" }
          : { value: slot.sprintId, label: slot.sprintName, section: "pinned" }
        );
      }
      const listed = new Set(ordered.map((o) => o.value));
      visible.filter((s) => !listed.has(String(s.id))).forEach((s) =>
        ordered.push({ value: String(s.id), label: s.name, section: "other" })
      );
      setSprintOptions(ordered);
      const def = (savedId && ordered.find((o) => o.value === savedId))
        ? savedId
        : (nextId && ordered.find((o) => o.value === nextId))
          ? nextId
          : ordered[0]?.value ?? "";
      setSelectedSprintId(def);
    }).catch((err) => console.warn("[launcher-modal] fetch sprints failed", err));

    setSessionsLoading(true);
    apiFetch<ActiveSession[]>("/api/story-writer/active-sessions")
      .then((data) => { setSessions(data); setSelectedSessionKey(data[0]?.ticketKey ?? ""); })
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false));
  }, [open]);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q); setSelectedTicket(null); setFocusedSearch(-1);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (q.trim().length < 2) { setSearchResults([]); setShowDropdown(false); return; }
    searchDebounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const d = await apiFetch<{ results?: Array<{ key: string; summary: string; status: string; sprintName: string | null }> }>(`/api/search/local?q=${encodeURIComponent(q)}`);
        const results: TicketSearchResult[] = (d.results ?? []).slice(0, 8).map(
          (x: { key: string; summary: string; status: string; sprintName: string | null }) =>
            ({ key: x.key, summary: x.summary, status: x.status, sprintName: x.sprintName }),
        );
        setSearchResults(results); setShowDropdown(results.length > 0);
      } catch { setSearchResults([]); }
      finally { setSearchLoading(false); }
    }, 200);
  }, []);

  // Scroll focused search item into view
  useEffect(() => {
    if (focusedSearch >= 0) searchResultRefs.current[focusedSearch]?.scrollIntoView({ block: "nearest" });
  }, [focusedSearch]);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node) && !searchRef.current?.contains(e.target as Node))
        setShowDropdown(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || searchResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault(); setFocusedSearch((i) => Math.min(i + 1, searchResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault(); setFocusedSearch((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && focusedSearch >= 0) {
      e.preventDefault();
      const r = searchResults[focusedSearch];
      setSelectedTicket(r); setSearchQuery(`${r.key} — ${r.summary}`); setShowDropdown(false);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  const handleCreateNew = () => {
    const title = newTitle.trim();
    setCreateError(null);

    // Generate draft key client-side and navigate instantly
    const draftKey = `DRAFT-${crypto.randomUUID().slice(0, 8)}`;
    const params = new URLSearchParams({ type: issueType });
    if (title) params.set("title", title);
    onClose();
    router.push(`/tickets/${draftKey}/write?${params.toString()}`);

    // Fire draft creation in background (non-blocking)
    storyWriter.createDraft({
      title: title || undefined, sprintId: selectedSprintId || undefined, issueType, draftKey,
    }).catch(() => {});
  };

  const deleteSession = async (sessionId: string) => {
    const remaining = sessions.filter((s) => s.sessionId !== sessionId);
    setSessions(remaining);
    if (!remaining.find((s) => s.ticketKey === selectedSessionKey)) {
      setSelectedSessionKey(remaining[0]?.ticketKey ?? "");
    }
    await apiFetch(`/api/story-writer/active-sessions?sessionId=${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  };

  // Auto-focus first card when switching to session tab or when sessions finish loading on that tab
  useEffect(() => {
    if (mode === "session" && sessions.length > 0) {
      setSelectedSessionKey(sessions[0].ticketKey);
      setTimeout(() => cardRefs.current[0]?.focus(), 30);
    }
  }, [mode, sessions]);

  const canConfirm =
    mode === "new"     ? true :
    mode === "session" ? !!selectedSessionKey : !!selectedTicket;

  const handleConfirm = () => {
    if (mode === "new")      { handleCreateNew(); return; }
    if (mode === "session" && selectedSessionKey) { onClose(); router.push(`/tickets/${selectedSessionKey}/write`); return; }
    if (mode === "existing" && selectedTicket)    { onClose(); router.push(`/tickets/${selectedTicket.key}/write`); }
  };

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const selectedSession = sessions.find((x) => x.ticketKey === selectedSessionKey);
  const sessionOptions: SelectOption[] = sessions.map((s) => ({
    value: s.ticketKey, label: s.ticketKey, sublabel: s.title,
  }));

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/55 backdrop-blur-[3px]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[560px] rounded-2xl border border-border-default bg-[var(--color-surface-elevated)] shadow-[var(--shadow-2xl)]">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-brand-500)]/12 ring-1 ring-[var(--color-brand-500)]/20 shadow-[0_2px_8px_rgba(46,145,73,0.15)]">
              <NotebookPen size={14} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
            </div>
            <div>
              <p className="text-body font-semibold text-text-primary leading-none">Story writer</p>
              <p className="text-label text-text-tertiary mt-0.5">Create, resume, or open a story</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={<X size={14} strokeWidth={1.5} />}
            onClick={onClose}
            className="text-text-muted"
          />
        </div>

        {/* ── Mode tabs ── */}
        <div className="mx-5 mb-4 flex gap-0.5 rounded-lg bg-overlay-subtle p-0.5">
          {(["new","session","existing"] as LauncherMode[]).map((m) => (
            <div key={m} className="relative flex-1">
              <button type="button" onClick={() => setMode(m)}
                className={`flex w-full items-center justify-center gap-1.5 rounded-[7px] py-[7px] text-body-sm font-medium cursor-pointer transition-colors duration-150 ${
                  mode === m
                    ? "bg-overlay-default text-text-primary shadow-[var(--shadow-sm)]"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                {m === "new"      && <Plus size={11} strokeWidth={2.5} />}
                {m === "session"  && <History size={11} strokeWidth={2} />}
                {m === "existing" && <BookOpen size={11} strokeWidth={1.8} />}
                {m === "new" ? "New story" : m === "session" ? "Open session" : "Existing"}
              </button>
              {m === "session" && sessions.length > 0 && (
                <span className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-brand-500)] px-1 text-caption font-bold text-white leading-none z-10">
                  {sessions.length > 9 ? "9+" : sessions.length}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* ── Content ── */}
        <div className="px-5 pb-5">

          {/* ── NEW STORY ── */}
          {mode === "new" && (
            <div className="space-y-3.5">
              <div>
                <label className="mb-1 block text-label font-medium text-text-tertiary uppercase tracking-wide">Title</label>
                <TextInput
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreateNew(); }}
                  placeholder="Story title (optional, AI will suggest)"
                />
              </div>

              <div>
                <label className="mb-1 block text-label font-medium text-text-tertiary uppercase tracking-wide">Issue type</label>
                <div className="flex gap-1">
                  {ISSUE_TYPES.map(({ value, label }) => {
                    const active = issueType === value;
                    const color  = ISSUE_TYPE_COLORS[value];
                    return (
                      <button key={value} type="button" onClick={() => setIssueType(value)}
                        className="flex flex-1 items-center justify-center gap-1 rounded-md border py-1.5 cursor-pointer transition-colors duration-120"
                        style={{
                          borderColor: active ? `${color}45` : "var(--color-overlay-default)",
                          backgroundColor: active ? `${color}12` : "transparent",
                        }}
                      >
                        <IssueTypeIcon type={value} size={12} />
                        <span className="text-label font-medium" style={{ color: active ? color : "var(--color-text-tertiary)" }}>
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-label font-medium text-text-tertiary uppercase tracking-wide">Sprint</label>
                <SprintSelectDropdown value={selectedSprintId} options={sprintOptions} onChange={setSelectedSprintId} />
              </div>

              <p className="text-label text-text-muted">Opens immediately. Jira issue is created in the background.</p>
            </div>
          )}

          {/* ── OPEN SESSION ── */}
          {mode === "session" && (
            <div>
              {sessionsLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-body-sm text-text-muted">
                  <span className="h-3 w-3 rounded-full border-2 border-border-strong border-t-white/40 animate-spin" />
                  Loading…
                </div>
              ) : sessions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border-default py-8 text-center">
                  <History size={18} strokeWidth={1} className="mx-auto mb-2 text-text-muted" />
                  <p className="text-body-sm text-text-muted">No open sessions</p>
                  <p className="mt-1 text-label text-text-muted">Start a new story to begin</p>
                </div>
              ) : sessions.length <= 3 ? (
                <div className="space-y-2">
                  {sessions.map((s, i) => {
                    const isSelected = selectedSessionKey === s.ticketKey;
                    const sprintName = resolveSprintName(s.sprintName, sprintOptions);
                    return (
                      <button key={s.ticketKey}
                        ref={(el) => { cardRefs.current[i] = el; }}
                        type="button"
                        onClick={() => { onClose(); router.push(`/tickets/${s.ticketKey}/write`); }}
                        onFocus={() => setSelectedSessionKey(s.ticketKey)}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowDown") { e.preventDefault(); cardRefs.current[Math.min(i + 1, sessions.length - 1)]?.focus(); }
                          if (e.key === "ArrowUp")   { e.preventDefault(); cardRefs.current[Math.max(i - 1, 0)]?.focus(); }
                        }}
                        className={`group relative flex w-full items-center gap-3 rounded-lg border px-3.5 py-3 cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                          isSelected
                            ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/[0.06]"
                            : "border-border-default bg-overlay-subtle hover:border-border-strong hover:bg-overlay-subtle"
                        }`}
                        style={{ transition: "background-color 80ms, border-color 80ms" }}
                      >
                        <div className="min-w-0 flex-1">
                          {/* Breadcrumb: sprint / epic / key */}
                          <div className="flex items-center gap-1.5 flex-wrap text-label text-text-tertiary mb-1">
                            {sprintName && (
                              <>
                                <span className="flex items-center gap-1">
                                  <IterationCw size={11} strokeWidth={1.5} style={{ color: "var(--color-icon-sprint)", flexShrink: 0 }} />
                                  <span className="truncate max-w-[120px]">{sprintName}</span>
                                </span>
                                <span className="text-text-muted">/</span>
                              </>
                            )}
                            {s.epic && (
                              <>
                                <span className="flex items-center gap-1">
                                  <Zap size={11} strokeWidth={1.5} style={{ color: "var(--color-icon-epic)", flexShrink: 0 }} />
                                  <span className="truncate max-w-[120px]">{s.epic}</span>
                                </span>
                                <span className="text-text-muted">/</span>
                              </>
                            )}
                            <span className="flex items-center gap-1 text-text-secondary">
                              <IssueTypeIcon type={s.issueType ?? "story"} size={11} />
                              <span className="font-mono font-medium">{s.ticketKey}</span>
                            </span>
                            {s.targetTicketKey && (
                              <>
                                <Scissors size={9} strokeWidth={2} style={{ color: "rgba(167,139,250,0.6)", flexShrink: 0 }} />
                                <span className="font-mono font-medium text-text-secondary">{s.targetTicketKey}</span>
                                <span className="rounded px-1 py-px text-caption font-medium bg-violet-500/10 text-violet-400/80">Split</span>
                              </>
                            )}
                          </div>
                          <p className="text-body text-text-secondary leading-snug truncate">{s.title}</p>
                          {s.targetTicketKey && (
                            <p className="text-body-sm text-text-tertiary leading-snug truncate mt-0.5">
                              {s.targetTitle ?? s.targetTicketKey}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusBadge status={s.status as JiraStatus} className="shrink-0 rounded-[4px] px-1.5 text-caption tracking-wide" />
                          <Button
                            variant="destructive"
                            size="sm"
                            iconOnly
                            icon={<Trash2 size={12} strokeWidth={1.5} />}
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteSessionId(s.sessionId); }}
                            title="Dismiss session"
                            aria-label="Dismiss session"
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div>
                    <label className="mb-1 block text-label font-medium text-text-tertiary uppercase tracking-wide">Active session</label>
                    <SessionSelectDropdown value={selectedSessionKey} options={sessionOptions} onChange={setSelectedSessionKey} />
                  </div>

                  {selectedSession && (
                    <div className="rounded-lg border border-border-default bg-overlay-subtle px-3.5 py-3">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap text-label text-text-tertiary mb-1">
                            {(() => {
                              const name = resolveSprintName(selectedSession.sprintName, sprintOptions);
                              return name ? (
                                <>
                                  <span className="flex items-center gap-1">
                                    <IterationCw size={11} strokeWidth={1.5} style={{ color: "var(--color-icon-sprint)" }} />
                                    <span className="truncate max-w-[120px]">{name}</span>
                                  </span>
                                  <span className="text-text-muted">/</span>
                                </>
                              ) : null;
                            })()}
                            {selectedSession.epic && (
                              <>
                                <span className="flex items-center gap-1">
                                  <Zap size={11} strokeWidth={1.5} style={{ color: "var(--color-icon-epic)" }} />
                                  <span className="truncate max-w-[120px]">{selectedSession.epic}</span>
                                </span>
                                <span className="text-text-muted">/</span>
                              </>
                            )}
                            <span className="flex items-center gap-1 text-text-secondary">
                              <IssueTypeIcon type={selectedSession.issueType ?? "story"} size={11} />
                              <span className="font-mono font-medium">{selectedSession.ticketKey}</span>
                            </span>
                            {selectedSession.targetTicketKey && (
                              <>
                                <Scissors size={9} strokeWidth={2} style={{ color: "rgba(167,139,250,0.6)", flexShrink: 0 }} />
                                <span className="font-mono font-medium text-text-secondary">{selectedSession.targetTicketKey}</span>
                                <span className="rounded px-1 py-px text-caption font-medium bg-violet-500/10 text-violet-400/80">Split</span>
                              </>
                            )}
                          </div>
                          <p className="text-body text-text-secondary leading-snug">{selectedSession.title}</p>
                          {selectedSession.targetTicketKey && (
                            <p className="text-body-sm text-text-tertiary leading-snug mt-0.5">
                              {selectedSession.targetTitle ?? selectedSession.targetTicketKey}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusBadge status={selectedSession.status as JiraStatus} className="shrink-0 rounded-[4px] px-1.5 text-caption tracking-wide" />
                          <Button
                            variant="destructive"
                            size="sm"
                            iconOnly
                            icon={<Trash2 size={12} strokeWidth={1.5} />}
                            onClick={() => setConfirmDeleteSessionId(selectedSession.sessionId)}
                            title="Dismiss session"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── EXISTING STORY ── */}
          {mode === "existing" && (
            <div>
              <label className="mb-1 block text-label font-medium text-text-tertiary uppercase tracking-wide">Search story</label>
              <div className="relative">
                {searchLoading && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 z-10 h-3 w-3 rounded-full border-2 border-border-strong border-t-white/40 animate-spin" />
                )}
                <TextInput
                  ref={searchRef}
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
                  onKeyDown={handleSearchKeyDown}
                  icon={<Search size={12} strokeWidth={1.5} />}
                  placeholder="Search by key or title…"
                />

                {showDropdown && searchResults.length > 0 && (
                  <div ref={dropdownRef}
                    className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-xl border border-border-strong bg-[var(--color-surface-floating)] shadow-[var(--shadow-modal)]"
                  >
                    {searchResults.map((r, i) => {
                      const isFoc = i === focusedSearch;
                      return (
                        <button key={r.key}
                          ref={(el) => { searchResultRefs.current[i] = el; }}
                          type="button"
                          onClick={() => { setSelectedTicket(r); setSearchQuery(`${r.key} — ${r.summary}`); setShowDropdown(false); }}
                          onMouseEnter={() => setFocusedSearch(i)}
                          className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left cursor-pointer"
                          style={{ backgroundColor: isFoc ? "var(--color-overlay-default)" : "transparent", transition: "background-color 60ms" }}
                        >
                          <span className="mt-px shrink-0 font-mono text-label font-medium text-[var(--color-brand-400)]/75" style={{ color: isFoc ? undefined : undefined }}>
                            {r.key}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-body text-text-secondary">{r.summary}</p>
                            {r.sprintName && <p className="mt-0.5 text-caption text-text-muted">{r.sprintName}</p>}
                          </div>
                          <StatusBadge status={r.status as JiraStatus} className="shrink-0 rounded-[4px] px-1.5 text-caption tracking-wide" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {selectedTicket && (
                <div className="mt-2 flex items-center gap-2.5 rounded-md border border-[var(--color-brand-500)]/18 bg-[var(--color-brand-500)]/[0.05] px-3 py-2">
                  <span className="shrink-0 font-mono text-label font-medium text-[var(--color-brand-400)]">{selectedTicket.key}</span>
                  <span className="truncate text-body-sm text-text-secondary">{selectedTicket.summary}</span>
                </div>
              )}
              {!selectedTicket && searchQuery.length >= 2 && !searchLoading && searchResults.length === 0 && (
                <p className="mt-2 text-label text-text-muted">No stories found.</p>
              )}
            </div>
          )}

          {createError && (
            <p className="mt-3 rounded-md bg-red-500/[0.08] px-3 py-1.5 text-body-sm text-red-400/80">{createError}</p>
          )}

          {/* ── Actions ── */}
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="md"
              onClick={onClose}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              icon={creating
                ? <span className="h-3 w-3 rounded-full border-2 border-border-strong border-t-white/80 animate-spin" />
                : <ArrowRight size={12} strokeWidth={2} />
              }
              onClick={handleConfirm}
              disabled={creating || !canConfirm}
            >
              {mode === "new" ? (creating ? "Creating..." : "Create & open") : mode === "session" ? "Resume session" : "Open story writer"}
            </Button>
          </div>

        </div>
      </div>

      {/* ── Discard confirmation ── */}
      <ConfirmDialog
        open={!!confirmDeleteSessionId}
        onClose={() => setConfirmDeleteSessionId(null)}
        title="Discard session?"
        description="This will permanently discard the session. You will not be able to resume it later."
        confirmLabel="Discard"
        confirmClassName="bg-red-500/10 border border-red-500/20 hover:bg-red-500/20"
        onConfirm={() => {
          if (confirmDeleteSessionId) deleteSession(confirmDeleteSessionId);
        }}
      />
    </div>,
    document.body,
  );
}
