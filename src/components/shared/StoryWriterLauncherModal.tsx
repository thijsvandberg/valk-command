"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  X, Plus, BookOpen, NotebookPen, ChevronDown,
  Search, ArrowRight, History, Check, Trash2, IterationCw, Zap, Scissors,
} from "lucide-react";
import { IssueTypeIcon, ISSUE_TYPE_COLORS } from "@/components/shared/IssueTypeIcon";
import { apiFetch, jira, sprintSlots, config as configApi, storyWriter } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import type { IssueType } from "@/types/ticket";
import { JIRA_STATUS_COLORS } from "@/types/ticket";

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
    setPanelStyle({ position: "fixed", top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 9999 });
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
        className="flex w-full items-center gap-2 rounded-md border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-[13px] text-left cursor-pointer hover:border-white/[0.12] hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-brand-500)]/50"
        style={{ transition: "background-color 100ms, border-color 100ms" }}
      >
        <span className="flex-1 min-w-0 truncate text-white/75">
          {selected?.label ?? <span className="text-white/25">No sprint</span>}
        </span>
        <ChevronDown size={12} strokeWidth={1.5} className={`shrink-0 text-white/25 ${open ? "rotate-180" : ""}`} style={{ transition: "transform 150ms" }} />
      </button>

      {open && (
        <div ref={panelRef} style={panelStyle} onKeyDown={nav}
          className="overflow-hidden rounded-xl border border-white/[0.08] bg-[var(--color-surface-floating)] shadow-[0_16px_48px_rgba(0,0,0,0.7),0_4px_12px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.04)]"
        >
          <div className="border-b border-white/[0.05] px-2 py-1.5">
            <div className="relative">
              <Search size={11} strokeWidth={1.5} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-white/25" />
              <input ref={searchRef} type="text" value={search}
                onChange={(e) => { setSearch(e.target.value); setFocused(0); }}
                onKeyDown={nav}
                className="w-full rounded bg-white/[0.04] py-1 pl-6 pr-2 text-xs text-white/70 placeholder-white/20 focus:outline-none focus:bg-white/[0.07]"
                placeholder="Search sprints…"
                style={{ transition: "background-color 80ms" }}
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {flat.length === 0
              ? <p className="px-3.5 py-3 text-xs text-white/30">No sprints found</p>
              : sections.map((sec, si) => (
                <div key={sec.key}>
                  {sec.label && (
                    <p className={`px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-widest text-white/20 ${si > 0 ? "mt-1 border-t border-white/[0.04]" : ""}`}>
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
                        style={{ backgroundColor: isFoc ? "rgba(255,255,255,0.05)" : "transparent", transition: "background-color 60ms" }}
                      >
                        <span className="flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-[3px] border"
                          style={{
                            backgroundColor: isSel ? "var(--color-brand-500)" : "transparent",
                            borderColor: isSel ? "var(--color-brand-500)" : "rgba(255,255,255,0.15)",
                            transition: "background-color 100ms, border-color 100ms",
                          }}
                        >
                          {isSel && <Check size={8} strokeWidth={2.5} className="text-white" />}
                        </span>
                        <span className="flex-1 min-w-0 truncate text-[13px] text-white/70">{opt.label}</span>
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
    setPanelStyle({ position: "fixed", top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 9999 });
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
        className="flex w-full items-center gap-2 rounded-md border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-[13px] text-left cursor-pointer hover:border-white/[0.12] hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-brand-500)]/50"
        style={{ transition: "background-color 100ms, border-color 100ms" }}
      >
        <span className="flex-1 min-w-0">
          {selected ? (
            <span className="block truncate text-white/75">{selected.label}
              {selected.sublabel && <span className="ml-2 text-[11px] text-white/35">{selected.sublabel}</span>}
            </span>
          ) : (
            <span className="text-white/25">{placeholder}</span>
          )}
        </span>
        <ChevronDown size={12} strokeWidth={1.5} className={`shrink-0 text-white/25 ${open ? "rotate-180" : ""}`} style={{ transition: "transform 150ms" }} />
      </button>

      {open && (
        <div ref={panelRef} style={panelStyle} onKeyDown={nav}
          className="overflow-hidden rounded-xl border border-white/[0.08] bg-[var(--color-surface-floating)] shadow-[0_16px_48px_rgba(0,0,0,0.7),0_4px_12px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.04)] py-1.5"
        >
          <div className="max-h-52 overflow-y-auto">
            {options.length === 0
              ? <p className="px-3.5 py-3 text-xs text-white/30">No sessions found</p>
              : options.map((opt, fi) => {
                const isSel = opt.value === value;
                const isFoc = fi === focused;
                return (
                  <button key={opt.value} ref={(el) => { itemRefs.current[fi] = el; }}
                    type="button"
                    onClick={() => { onChange(opt.value); setOpen(false); }}
                    onMouseEnter={() => setFocused(fi)}
                    className="flex w-full items-start gap-2.5 px-3 py-2 text-left cursor-pointer"
                    style={{ backgroundColor: isFoc ? "rgba(255,255,255,0.05)" : "transparent", transition: "background-color 60ms" }}
                  >
                    <span className="flex h-[14px] w-[14px] mt-0.5 shrink-0 items-center justify-center rounded-[3px] border"
                      style={{
                        backgroundColor: isSel ? "var(--color-brand-500)" : "transparent",
                        borderColor: isSel ? "var(--color-brand-500)" : "rgba(255,255,255,0.15)",
                        transition: "background-color 100ms, border-color 100ms",
                      }}
                    >
                      {isSel && <Check size={8} strokeWidth={2.5} className="text-white" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-mono text-[11px] font-medium text-[var(--color-brand-400)]/80">{opt.label}</span>
                      {opt.sublabel && <span className="block truncate text-xs text-white/50 mt-0.5">{opt.sublabel}</span>}
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
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const upper = status.toUpperCase();
  const color = JIRA_STATUS_COLORS[upper as keyof typeof JIRA_STATUS_COLORS] ?? { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.35)" };
  return (
    <span
      className="shrink-0 rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium tracking-wide"
      style={{ backgroundColor: color.bg, color: color.text }}
    >
      {status}
    </span>
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
  const cardRefs         = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    setMode("new"); setNewTitle(""); setIssueType("story"); setCreateError(null);
    setSearchQuery(""); setSearchResults([]); setSelectedTicket(null);
    setShowDropdown(false); setSelectedSessionKey(""); setFocusedSearch(-1); setConfirmDeleteSessionId(null);

    Promise.all([
      jira.getSprints() as unknown as Promise<JiraSprint[]>,
      sprintSlots.list() as Promise<SprintSlot[]>,
      configApi.get() as Promise<{ nextSprintId: string }>,
    ]).then(([all, slots, cfg]) => {
      const nextId   = cfg.nextSprintId?.trim() ?? "";
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
      const def = nextId && ordered.find((o) => o.value === nextId) ? nextId : ordered[0]?.value ?? "";
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

  const handleCreateNew = async () => {
    const title = newTitle.trim();
    if (!title) { setCreateError("Enter a story title"); return; }
    setCreateError(null); setCreating(true);
    try {
      const { key } = await storyWriter.createViaGlobal({ title, sprintId: selectedSprintId || undefined, issueType }) as { key: string };
      onClose(); router.push(`/tickets/${key}/write`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setCreateError(msg);
    }
    finally { setCreating(false); }
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
  }, [mode, sessions.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const canConfirm =
    mode === "new"     ? newTitle.trim().length > 0 :
    mode === "session" ? !!selectedSessionKey : !!selectedTicket;

  const handleConfirm = () => {
    if (mode === "new")      { handleCreateNew(); return; }
    if (mode === "session" && selectedSessionKey) { onClose(); router.push(`/tickets/${selectedSessionKey}/write`); return; }
    if (mode === "existing" && selectedTicket)    { onClose(); router.push(`/tickets/${selectedTicket.key}/write`); }
  };

  if (!open) return null;

  const selectedSession = sessions.find((x) => x.ticketKey === selectedSessionKey);
  const sessionOptions: SelectOption[] = sessions.map((s) => ({
    value: s.ticketKey, label: s.ticketKey, sublabel: s.title,
  }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[3px]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[560px] rounded-2xl border border-white/[0.07] bg-[var(--color-surface-elevated)] shadow-[0_32px_80px_rgba(0,0,0,0.65),0_8px_24px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(46,145,73,0.22),inset_0_0_0_1px_rgba(255,255,255,0.03)]">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-brand-500)]/12 ring-1 ring-[var(--color-brand-500)]/20 shadow-[0_2px_8px_rgba(46,145,73,0.15)]">
              <NotebookPen size={14} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-white/85 leading-none">Story writer</p>
              <p className="text-[11px] text-white/30 mt-0.5">Create, resume, or open a story</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={<X size={14} strokeWidth={1.5} />}
            onClick={onClose}
            className="text-white/25"
          />
        </div>

        {/* ── Mode tabs ── */}
        <div className="mx-5 mb-4 flex gap-0.5 rounded-lg bg-white/[0.035] p-0.5">
          {(["new","session","existing"] as LauncherMode[]).map((m) => (
            <div key={m} className="relative flex-1">
              <button type="button" onClick={() => setMode(m)}
                className={`flex w-full items-center justify-center gap-1.5 rounded-[7px] py-[7px] text-[12px] font-medium cursor-pointer transition-colors duration-150 ${
                  mode === m
                    ? "bg-white/[0.07] text-white/85 shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
                    : "text-white/35 hover:text-white/55"
                }`}
              >
                {m === "new"      && <Plus size={11} strokeWidth={2.5} />}
                {m === "session"  && <History size={11} strokeWidth={2} />}
                {m === "existing" && <BookOpen size={11} strokeWidth={1.8} />}
                {m === "new" ? "New story" : m === "session" ? "Open session" : "Existing"}
              </button>
              {m === "session" && sessions.length > 0 && (
                <span className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-brand-500)] px-1 text-[9px] font-bold text-white leading-none z-10">
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
                <label className="mb-1 block text-[11px] font-medium text-white/35 uppercase tracking-wide">Title</label>
                <input
                  type="text" autoFocus value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreateNew(); }}
                  className="w-full rounded-md border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-[13px] text-white/80 placeholder-white/20 focus:outline-none focus:border-[var(--color-brand-500)]/35 focus:bg-white/[0.05]"
                  style={{ transition: "border-color 120ms, background-color 120ms" }}
                  placeholder="Build cool stuff"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-white/35 uppercase tracking-wide">Issue type</label>
                <div className="flex gap-1">
                  {ISSUE_TYPES.map(({ value, label }) => {
                    const active = issueType === value;
                    const color  = ISSUE_TYPE_COLORS[value];
                    return (
                      <button key={value} type="button" onClick={() => setIssueType(value)}
                        className="flex flex-1 items-center justify-center gap-1 rounded-md border py-1.5 cursor-pointer transition-colors duration-120"
                        style={{
                          borderColor: active ? `${color}45` : "rgba(255,255,255,0.06)",
                          backgroundColor: active ? `${color}12` : "transparent",
                        }}
                      >
                        <IssueTypeIcon type={value} size={12} />
                        <span className="text-[11px] font-medium" style={{ color: active ? color : "rgba(255,255,255,0.35)" }}>
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-white/35 uppercase tracking-wide">Sprint</label>
                <SprintSelectDropdown value={selectedSprintId} options={sprintOptions} onChange={setSelectedSprintId} />
              </div>

              <p className="text-[11px] text-white/25">Creates in Jira and opens in story writer.</p>
            </div>
          )}

          {/* ── OPEN SESSION ── */}
          {mode === "session" && (
            <div>
              {sessionsLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-xs text-white/25">
                  <span className="h-3 w-3 rounded-full border-2 border-white/15 border-t-white/40 animate-spin" />
                  Loading…
                </div>
              ) : sessions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/[0.07] py-8 text-center">
                  <History size={18} strokeWidth={1} className="mx-auto mb-2 text-white/15" />
                  <p className="text-xs text-white/25">No open sessions</p>
                  <p className="mt-1 text-[11px] text-white/15">Start a new story to begin</p>
                </div>
              ) : sessions.length <= 3 ? (
                <div className="space-y-2">
                  {sessions.map((s, i) => {
                    const isSelected = selectedSessionKey === s.ticketKey;
                    const sprintName = resolveSprintName(s.sprintName, sprintOptions);
                    return (
                      <div key={s.ticketKey}
                        ref={(el) => { cardRefs.current[i] = el; }}
                        role="button"
                        tabIndex={0}
                        onClick={() => { onClose(); router.push(`/tickets/${s.ticketKey}/write`); }}
                        onFocus={() => setSelectedSessionKey(s.ticketKey)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); onClose(); router.push(`/tickets/${s.ticketKey}/write`); }
                          if (e.key === "ArrowDown") { e.preventDefault(); cardRefs.current[Math.min(i + 1, sessions.length - 1)]?.focus(); }
                          if (e.key === "ArrowUp")   { e.preventDefault(); cardRefs.current[Math.max(i - 1, 0)]?.focus(); }
                        }}
                        className={`group relative flex items-center gap-3 rounded-lg border px-3.5 py-3 cursor-pointer focus:outline-none ${
                          isSelected
                            ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/[0.06]"
                            : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.10] hover:bg-white/[0.035]"
                        }`}
                        style={{ transition: "background-color 80ms, border-color 80ms" }}
                      >
                        <div className="min-w-0 flex-1">
                          {/* Breadcrumb: sprint / epic / key */}
                          <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-white/40 mb-1">
                            {sprintName && (
                              <>
                                <span className="flex items-center gap-1">
                                  <IterationCw size={11} strokeWidth={1.5} style={{ color: "#d4904a", flexShrink: 0 }} />
                                  <span className="truncate max-w-[120px]">{sprintName}</span>
                                </span>
                                <span className="text-white/15">/</span>
                              </>
                            )}
                            {s.epic && (
                              <>
                                <span className="flex items-center gap-1">
                                  <Zap size={11} strokeWidth={1.5} style={{ color: "#9b6cd4", flexShrink: 0 }} />
                                  <span className="truncate max-w-[120px]">{s.epic}</span>
                                </span>
                                <span className="text-white/15">/</span>
                              </>
                            )}
                            <span className="flex items-center gap-1 text-white/55">
                              <IssueTypeIcon type={s.issueType ?? "story"} size={11} />
                              <span className="font-mono font-medium">{s.ticketKey}</span>
                            </span>
                            {s.targetTicketKey && (
                              <>
                                <Scissors size={9} strokeWidth={2} style={{ color: "rgba(167,139,250,0.6)", flexShrink: 0 }} />
                                <span className="font-mono font-medium text-white/55">{s.targetTicketKey}</span>
                                <span className="rounded px-1 py-px text-[9px] font-medium bg-violet-500/10 text-violet-400/80">Split</span>
                              </>
                            )}
                          </div>
                          <p className="text-[13px] text-white/55 leading-snug truncate">{s.title}</p>
                          {s.targetTicketKey && (
                            <p className="text-[12px] text-white/30 leading-snug truncate mt-0.5">
                              {s.targetTitle ?? s.targetTicketKey}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusBadge status={s.status} />
                          <Button
                            variant="destructive"
                            size="sm"
                            iconOnly
                            icon={<Trash2 size={12} strokeWidth={1.5} />}
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteSessionId(s.sessionId); }}
                            title="Dismiss session"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-white/35 uppercase tracking-wide">Active session</label>
                    <SessionSelectDropdown value={selectedSessionKey} options={sessionOptions} onChange={setSelectedSessionKey} />
                  </div>

                  {selectedSession && (
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-white/40 mb-1">
                            {(() => {
                              const name = resolveSprintName(selectedSession.sprintName, sprintOptions);
                              return name ? (
                                <>
                                  <span className="flex items-center gap-1">
                                    <IterationCw size={11} strokeWidth={1.5} style={{ color: "#d4904a" }} />
                                    <span className="truncate max-w-[120px]">{name}</span>
                                  </span>
                                  <span className="text-white/15">/</span>
                                </>
                              ) : null;
                            })()}
                            {selectedSession.epic && (
                              <>
                                <span className="flex items-center gap-1">
                                  <Zap size={11} strokeWidth={1.5} style={{ color: "#9b6cd4" }} />
                                  <span className="truncate max-w-[120px]">{selectedSession.epic}</span>
                                </span>
                                <span className="text-white/15">/</span>
                              </>
                            )}
                            <span className="flex items-center gap-1 text-white/55">
                              <IssueTypeIcon type={selectedSession.issueType ?? "story"} size={11} />
                              <span className="font-mono font-medium">{selectedSession.ticketKey}</span>
                            </span>
                            {selectedSession.targetTicketKey && (
                              <>
                                <Scissors size={9} strokeWidth={2} style={{ color: "rgba(167,139,250,0.6)", flexShrink: 0 }} />
                                <span className="font-mono font-medium text-white/55">{selectedSession.targetTicketKey}</span>
                                <span className="rounded px-1 py-px text-[9px] font-medium bg-violet-500/10 text-violet-400/80">Split</span>
                              </>
                            )}
                          </div>
                          <p className="text-[13px] text-white/55 leading-snug">{selectedSession.title}</p>
                          {selectedSession.targetTicketKey && (
                            <p className="text-[12px] text-white/30 leading-snug mt-0.5">
                              {selectedSession.targetTitle ?? selectedSession.targetTicketKey}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusBadge status={selectedSession.status} />
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
              <label className="mb-1 block text-[11px] font-medium text-white/35 uppercase tracking-wide">Search story</label>
              <div className="relative">
                <Search size={12} strokeWidth={1.5} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25" />
                {searchLoading && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-white/15 border-t-white/40 animate-spin" />
                )}
                <input ref={searchRef} type="text" autoFocus value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
                  onKeyDown={handleSearchKeyDown}
                  className="w-full rounded-md border border-white/[0.07] bg-white/[0.03] py-1.5 pl-8 pr-7 text-[13px] text-white/80 placeholder-white/20 focus:outline-none focus:border-[var(--color-brand-500)]/35 focus:bg-white/[0.05]"
                  style={{ transition: "border-color 120ms, background-color 120ms" }}
                  placeholder="Search by key or title…"
                />

                {showDropdown && searchResults.length > 0 && (
                  <div ref={dropdownRef}
                    className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-xl border border-white/[0.08] bg-[var(--color-surface-floating)] shadow-[0_16px_48px_rgba(0,0,0,0.7),0_4px_12px_rgba(0,0,0,0.3)]"
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
                          style={{ backgroundColor: isFoc ? "rgba(255,255,255,0.05)" : "transparent", transition: "background-color 60ms" }}
                        >
                          <span className="mt-px shrink-0 font-mono text-[11px] font-medium text-[var(--color-brand-400)]/75" style={{ color: isFoc ? undefined : undefined }}>
                            {r.key}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] text-white/60">{r.summary}</p>
                            {r.sprintName && <p className="mt-0.5 text-[10px] text-white/25">{r.sprintName}</p>}
                          </div>
                          <StatusBadge status={r.status} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {selectedTicket && (
                <div className="mt-2 flex items-center gap-2.5 rounded-md border border-[var(--color-brand-500)]/18 bg-[var(--color-brand-500)]/[0.05] px-3 py-2">
                  <span className="shrink-0 font-mono text-[11px] font-medium text-[var(--color-brand-400)]">{selectedTicket.key}</span>
                  <span className="truncate text-xs text-white/55">{selectedTicket.summary}</span>
                </div>
              )}
              {!selectedTicket && searchQuery.length >= 2 && !searchLoading && searchResults.length === 0 && (
                <p className="mt-2 text-[11px] text-white/25">No stories found.</p>
              )}
            </div>
          )}

          {createError && (
            <p className="mt-3 rounded-md bg-red-500/[0.08] px-3 py-1.5 text-xs text-red-400/80">{createError}</p>
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
                ? <span className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white/80 animate-spin" />
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
      {confirmDeleteSessionId && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDeleteSessionId(null); }}
        >
          <div className="w-full max-w-sm rounded-xl bg-[var(--color-surface-elevated)] p-6 shadow-2xl border border-white/[0.08]">
            <h3 className="font-[var(--font-display)] text-sm font-semibold text-white/90">
              Discard session?
            </h3>
            <p className="mt-2 text-xs leading-[1.7] text-white/50">
              This will permanently discard the session. You will not be able to resume it later.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="ghost" size="md" onClick={() => setConfirmDeleteSessionId(null)} className="border-0">
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="md"
                onClick={() => { deleteSession(confirmDeleteSessionId); setConfirmDeleteSessionId(null); }}
                className="bg-red-500/10 border border-red-500/20 hover:bg-red-500/20"
              >
                Discard
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
