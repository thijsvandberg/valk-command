"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Check, Search, ChevronDown, UserX } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import type { Assignee } from "@/types/ticket";
import useSWR from "swr";
import { swrFetcher } from "@/lib/api-client";

interface AssignableUser {
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
}

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function userColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 55%, 50%)`;
}

export function AssigneePicker({
  value,
  onChange,
  align = "right",
}: {
  value: Assignee | null;
  onChange: (user: AssignableUser | null) => void;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; flipUp: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data } = useSWR<{ users: AssignableUser[] }>(
    open ? "/api/jira/assignable-users" : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );

  const users = data?.users ?? [];
  const filtered = query.trim()
    ? users.filter((u) => u.displayName.toLowerCase().includes(query.toLowerCase()))
    : users;

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const flipUp = rect.bottom + 300 > window.innerHeight;
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

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => open ? handleClose() : handleOpen()}
        title={value ? `Assignee: ${value.name}` : "Unassigned"}
        className="group/assignee inline-flex items-center gap-2 rounded-md px-1.5 py-0.5 cursor-pointer hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:opacity-60"
        style={{ transition: "background-color 0.15s ease" }}
      >
        <span className="truncate text-sm text-text-secondary">{value?.name ?? "Unassigned"}</span>
        <Avatar assignee={value} size={20} />
        <ChevronDown
          size={10}
          strokeWidth={2}
          className="shrink-0 text-text-muted opacity-0 group-hover/assignee:opacity-100"
          style={{ transition: "opacity 0.15s ease" }}
        />
      </button>

      {open && pos && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[9999] w-[260px] rounded-xl border border-border-default"
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
              placeholder="Search people..."
              className="flex-1 bg-transparent text-xs text-text-secondary placeholder:text-text-muted focus:outline-none"
            />
          </div>

          {/* Options */}
          <div className="max-h-[220px] overflow-y-auto py-1">
            {/* Unassign option */}
            {!query.trim() && (
              <button
                type="button"
                onClick={() => { onChange(null); handleClose(); }}
                className="flex w-full items-center gap-2.5 px-3 py-[7px] text-xs cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
              >
                <span className="flex h-5 w-5 items-center justify-center shrink-0 rounded-full bg-overlay-subtle text-text-muted">
                  <UserX size={11} strokeWidth={1.5} />
                </span>
                <span className={!value ? "text-text-primary font-medium" : "text-text-secondary"}>Unassigned</span>
                {!value && <Check size={11} strokeWidth={1.5} className="ml-auto text-[var(--color-brand-400)]" />}
              </button>
            )}

            {users.length === 0 && !data && (
              <p className="px-3 py-2 text-xs text-text-muted">Loading...</p>
            )}

            {filtered.length === 0 && query.trim() && (
              <p className="px-3 py-2 text-xs text-text-muted">No people found</p>
            )}

            {filtered.map((u) => {
              const isSelected = value?.name === u.displayName;
              const tempAssignee: Assignee = { name: u.displayName, initials: userInitials(u.displayName), color: userColor(u.displayName) };
              return (
                <button
                  key={u.accountId}
                  type="button"
                  onClick={() => { onChange(u); handleClose(); }}
                  className="flex w-full items-center gap-2.5 px-3 py-[7px] text-xs cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
                >
                  <Avatar assignee={tempAssignee} size={20} />
                  <span className={`flex-1 text-left ${isSelected ? "text-text-primary font-medium" : "text-text-secondary"}`}>
                    {u.displayName}
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
