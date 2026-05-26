"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Check, Search } from "lucide-react";
import { Tag } from "@/components/shared/Tag";
import useSWR from "swr";
import { swrFetcher } from "@/lib/api-client";

export function LabelPicker({
  value,
  onChange,
  align = "right",
}: {
  value: string[];
  onChange: (labels: string[]) => void;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; flipUp: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data } = useSWR<{ labels: string[] }>(
    open ? "/api/jira/labels" : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );

  const labels = data?.labels ?? [];

  const filtered = useMemo(() => {
    if (!query.trim()) return labels;
    const q = query.toLowerCase();
    return labels.filter((l) => l.toLowerCase().includes(q));
  }, [labels, query]);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const flipUp = rect.bottom + 340 > window.innerHeight;
    setPos({
      top: flipUp ? rect.top : rect.bottom + 4,
      left: align === "left" ? rect.left : rect.right,
      flipUp,
    });
  }, [align]);

  const handleOpen = useCallback(() => {
    updatePosition();
    setOpen(true);
    setQuery("");
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [updatePosition]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        popoverRef.current?.contains(e.target as Node)
      ) return;
      handleClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    function handleScroll() { updatePosition(); }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open, updatePosition, handleClose]);

  function handleToggle(label: string) {
    const isSelected = value.includes(label);
    const next = isSelected
      ? value.filter((l) => l !== label)
      : [...value, label];
    onChange(next);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => open ? handleClose() : handleOpen()}
        title={value.length > 0 ? `Labels: ${value.join(", ")}` : "No labels"}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 -mr-2 cursor-pointer hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:opacity-60"
        style={{ transition: "background-color 0.15s ease" }}
      >
        {value.length > 0 ? (
          <span className="flex flex-wrap justify-end gap-1">
            {value.map((l) => (
              <Tag key={l}>{l}</Tag>
            ))}
          </span>
        ) : (
          <span className="text-xs text-text-muted">None</span>
        )}
      </button>

      {open && pos && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[9999] w-[240px] rounded-xl border border-border-default"
          style={{
            top: pos.flipUp ? undefined : pos.top,
            bottom: pos.flipUp ? window.innerHeight - pos.top + 4 : undefined,
            left: align === "left" ? pos.left : undefined,
            right: align === "right" ? window.innerWidth - pos.left : undefined,
            backgroundColor: "var(--color-surface-floating)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.20), 0 1px 4px rgba(0,0,0,0.10)",
          }}
        >
          {/* Search */}
          <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
            <Search size={12} strokeWidth={1.5} className="shrink-0 text-text-muted" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search labels..."
              className="flex-1 bg-transparent text-xs text-text-secondary placeholder:text-text-muted focus:outline-none"
            />
          </div>

          {/* Options */}
          <div className="max-h-[260px] overflow-y-auto py-1">
            {labels.length === 0 && !data && (
              <p className="px-3 py-2 text-xs text-text-muted">Loading...</p>
            )}

            {filtered.length === 0 && query.trim() && (
              <p className="px-3 py-2 text-xs text-text-muted">No labels found</p>
            )}

            {filtered.length === 0 && !query.trim() && data && (
              <p className="px-3 py-2 text-xs text-text-muted">No labels available</p>
            )}

            {filtered.map((label) => {
              const isSelected = value.includes(label);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => handleToggle(label)}
                  className="flex w-full items-center gap-2.5 px-3 py-[7px] text-xs cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
                >
                  <span className={`flex-1 text-left ${isSelected ? "text-text-primary font-medium" : "text-text-secondary"}`}>
                    {label}
                  </span>
                  {isSelected && <Check size={11} strokeWidth={1.5} className="shrink-0 text-[var(--color-brand-400)]" />}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
