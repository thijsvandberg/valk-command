"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/shared/Checkbox";

export interface SelectOption { value: string; label: string; sublabel?: string | null }

export function SessionSelectDropdown({
  value, options, onChange, placeholder = "Select...",
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

  useOutsideClick([panelRef, triggerRef], closePanel, { enabled: open, escapeClose: false });

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
                    <Checkbox checked={isSel} className="mt-0.5" />
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
