"use client";

import { useState, useEffect, useRef } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { ChevronDown, Search } from "lucide-react";
import { Checkbox } from "@/components/shared/Checkbox";

export interface SprintOption { value: string; label: string; section: "next" | "pinned" | "other" }

export function SprintSelectDropdown({
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

  useOutsideClick([panelRef, triggerRef], () => setOpen(false), { enabled: open, escapeClose: false });

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
                placeholder="Search sprints..."
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
                        <Checkbox checked={isSel} />
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
