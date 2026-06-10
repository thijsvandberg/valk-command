"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { Ticket, TicketReadiness, TicketDetail } from "@/types/ticket";
import { ChevronRight } from "lucide-react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { recordTicketView } from "@/lib/recently-viewed-store";
import { TicketMetaContent } from "@/components/ticket-detail/TicketMetaContent";

export const DEFAULT_SIDEBAR_WIDTH = 420;
const MIN_SIDEBAR_WIDTH = 280;
export const SIDEBAR_WIDTH_KEY = "ticket-sidebar-width";
export const SIDEBAR_COLLAPSED_KEY = "ticket-sidebar-collapsed";

/**
 * The full ticket page's right rail: a resizable, collapsible shell around the
 * shared `TicketMetaContent`. The same meta content is reused (without this
 * shell) by the sprint-board `SidePanel`.
 */
export function TicketSidebar({
  ticket,
  detail,
  reviewData,
  collapsed,
  onCollapsedChange,
  onNavigateToReview,
  onNavigateToDev,
  onReadinessChange,
}: {
  ticket: Ticket;
  detail: TicketDetail | undefined;
  reviewData?: { reviews: { storyVersionHash?: string | null; overallScore: number }[]; currentVersionHash: string | null } | undefined;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onNavigateToReview?: () => void;
  onNavigateToDev?: () => void;
  onReadinessChange?: (v: TicketReadiness | null) => void;
}) {
  // This rail renders exactly once per opened ticket page, so it doubles as
  // the page's "ticket viewed" recorder; the page component itself carries
  // unrelated in-flight work (BRDG-329/330 split).
  useEffect(() => {
    recordTicketView(ticket.key, ticket.title);
  }, [ticket.key, ticket.title]);

  // Resize state
  const [sidebarWidth, setSidebarWidth] = useLocalStorage(SIDEBAR_WIDTH_KEY, DEFAULT_SIDEBAR_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const clampedWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(typeof window !== "undefined" ? window.innerWidth * 0.5 : 800, sidebarWidth));

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleResizeDoubleClick = useCallback(() => {
    onCollapsedChange(!collapsed);
  }, [onCollapsedChange, collapsed]);

  useEffect(() => {
    if (!isDragging) return;

    function handleMouseMove(e: MouseEvent) {
      if (!sidebarRef.current) return;
      const rect = sidebarRef.current.getBoundingClientRect();
      const maxWidth = window.innerWidth * 0.5;
      const newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(maxWidth, rect.right - e.clientX));
      setSidebarWidth(newWidth);
    }

    function handleMouseUp() {
      setIsDragging(false);
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, setSidebarWidth]);

  // Keyboard shortcut: [ to toggle sidebar
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "[") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.getAttribute("contenteditable")) return;
      e.preventDefault();
      onCollapsedChange(!collapsed);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCollapsedChange, collapsed]);

  // Fully hidden when collapsed
  if (collapsed) {
    return null;
  }

  return (
    <div
      ref={sidebarRef}
      className="group/sidebar relative shrink-0"
      style={{
        width: clampedWidth,
        height: "100%",
        transition: isDragging ? "none" : "width 200ms cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
    >
      {/* Resize drag handle */}
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={handleResizeDoubleClick}
        className="absolute top-0 left-0 z-20 h-full w-1 cursor-col-resize hover:bg-[var(--color-brand-500)]/30 active:bg-[var(--color-brand-500)]/50"
        style={isDragging ? { backgroundColor: "var(--color-drag-active)" } : {}}
      />

      {/* Left edge line */}
      <div className="absolute top-0 left-0 h-full w-px bg-border-default" />

      {/* Collapse button on left edge */}
      <button
        type="button"
        onClick={() => onCollapsedChange(true)}
        className="absolute left-0 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full border border-border-default bg-[var(--color-surface-elevated)] text-text-muted cursor-pointer opacity-0 group-hover/sidebar:opacity-100 hover:text-text-secondary hover:border-[var(--color-brand-500)]/40 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        style={{ transition: "opacity 0.15s ease, color 0.15s ease, border-color 0.15s ease" }}
        aria-label="Collapse sidebar"
        title="Collapse sidebar  [  "
      >
        <ChevronRight className="h-3 w-3" strokeWidth={2} />
      </button>

      {/* Sidebar content */}
      <TicketMetaContent
        ticket={ticket}
        detail={detail}
        reviewData={reviewData}
        onReadinessChange={onReadinessChange}
        onNavigateToReview={onNavigateToReview}
        onNavigateToDev={onNavigateToDev}
        className="h-full overflow-y-auto bg-[var(--color-surface-elevated)] py-4 px-5"
        style={{
          opacity: isDragging ? 0.7 : 1,
          transition: isDragging ? "none" : "opacity 150ms ease",
        }}
      />
    </div>
  );
}
