"use client";

import { useCallback, useEffect } from "react";
import type { Ticket } from "@/types/ticket";

interface ShortcutsDeps {
  tickets: Ticket[];
  focusedTicketIdx: number;
  setFocusedTicketIdx: React.Dispatch<React.SetStateAction<number>>;
  setSelectedTicket: React.Dispatch<React.SetStateAction<string | null>>;
  setSearchModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  headerMenuRef: React.RefObject<HTMLDivElement | null>;
  headerMenuOpen: boolean;
  setHeaderMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useSprintBoardShortcuts(deps: ShortcutsDeps) {
  const {
    tickets, focusedTicketIdx, setFocusedTicketIdx, setSelectedTicket,
    setSearchModalOpen, headerMenuRef, headerMenuOpen, setHeaderMenuOpen,
  } = deps;

  // Global search shortcut
  useEffect(() => {
    function onOpenSearch(e: Event) { e.preventDefault(); setSearchModalOpen(true); }
    window.addEventListener("valk:openSearch", onOpenSearch);
    return () => { window.removeEventListener("valk:openSearch", onOpenSearch); };
  }, [setSearchModalOpen]);

  // Close header menu on outside click
  useEffect(() => {
    if (!headerMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) setHeaderMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [headerMenuOpen, headerMenuRef, setHeaderMenuOpen]);

  const handleTableKeyDown = useCallback((e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.key === "Escape") { setSelectedTicket(null); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setFocusedTicketIdx((prev) => Math.min(prev + 1, tickets.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocusedTicketIdx((prev) => Math.max(prev - 1, 0)); }
    else if (e.key === "Enter" && focusedTicketIdx >= 0 && focusedTicketIdx < tickets.length) { e.preventDefault(); const t = tickets[focusedTicketIdx]; setSelectedTicket((prev) => (prev === t.key ? null : t.key)); }
  }, [tickets, focusedTicketIdx, setFocusedTicketIdx, setSelectedTicket]);

  return { handleTableKeyDown };
}
